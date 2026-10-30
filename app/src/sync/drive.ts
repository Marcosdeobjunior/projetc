/*
 * Acesso ao Google Drive (API v3) com o token de acesso da conta conectada.
 * Cada projeto fica numa pasta "InkFlow/<título>" marcada com o id do
 * projeto; as subpastas espelham as pastas do vault.
 */

export interface RemoteFile {
  id: string;
  /** Caminho relativo à pasta do projeto, com "/". */
  path: string;
  md5: string;
}

export interface RemoteProject {
  folderId: string;
  projectId: string;
  title: string;
  modifiedTime: string;
}

/** O que a sincronização precisa do Drive (o Google Drive de verdade ou um falso nos testes). */
export interface Drive {
  email(): Promise<string>;
  /** Pasta do projeto no Drive; cria se ainda não existe. */
  projectFolder(projectId: string, title: string): Promise<string>;
  listProjects(): Promise<RemoteProject[]>;
  list(folderId: string): Promise<Map<string, RemoteFile>>;
  download(id: string): Promise<Uint8Array>;
  /** Cria (ou, com `id`, substitui o conteúdo de) um arquivo. Devolve o MD5 do Drive. */
  upload(folderId: string, path: string, data: Uint8Array, id?: string): Promise<RemoteFile>;
  /** Manda para a lixeira do Drive (dá para recuperar por 30 dias). */
  remove(id: string): Promise<void>;
}

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
const ROOT_NAME = "InkFlow";
/** Acima disso o envio é feito em partes (upload "resumable"). */
const SIMPLE_LIMIT = 5 * 1024 * 1024;

type Fetch = typeof fetch;

interface ApiFile {
  id: string;
  name: string;
  mimeType: string;
  md5Checksum?: string;
  modifiedTime?: string;
  appProperties?: Record<string, string>;
}

const quote = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

export class GoogleDrive implements Drive {
  /** Pastas já conhecidas: "<pasta do projeto>/<caminho>" → id. */
  private folders = new Map<string, string>();

  constructor(
    /** Token de acesso; `renew` pede um novo (o atual foi recusado). */
    private token: (renew?: boolean) => Promise<string>,
    private fetchImpl: Fetch = (...args) => fetch(...args),
  ) {}

  private async request(url: string, init: RequestInit = {}, retry = 0): Promise<Response> {
    const token = await this.token(retry > 0);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new DriveError("Sem conexão com o Google Drive. Verifique a internet.");
    }
    if (res.ok) return res;
    // Token vencido: renova uma vez. Limite de uso: espera e tenta de novo.
    if (res.status === 401 && retry === 0) return this.request(url, init, 1);
    if ((res.status === 429 || res.status === 403 || res.status >= 500) && retry < 3) {
      const text = await res.clone().text();
      if (res.status !== 403 || /rateLimit|userRateLimit/i.test(text)) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** retry));
        return this.request(url, init, retry + 1);
      }
    }
    let message = `O Google Drive respondeu ${res.status}.`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) message = `Google Drive: ${body.error.message}`;
    } catch {
      // resposta sem JSON
    }
    throw new DriveError(message, res.status);
  }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    return (await this.request(url, init)).json() as Promise<T>;
  }

  private async search(
    q: string,
    fields = "id,name,mimeType,md5Checksum,modifiedTime,appProperties",
  ) {
    const out: ApiFile[] = [];
    let page: string | undefined;
    do {
      const params = new URLSearchParams({
        q,
        fields: `nextPageToken,files(${fields})`,
        pageSize: "1000",
        spaces: "drive",
      });
      if (page) params.set("pageToken", page);
      const r = await this.json<{ files: ApiFile[]; nextPageToken?: string }>(
        `${API}/files?${params}`,
      );
      out.push(...r.files);
      page = r.nextPageToken;
    } while (page);
    return out;
  }

  private async createFolder(
    name: string,
    parent: string | null,
    appProperties?: Record<string, string>,
  ) {
    const f = await this.json<ApiFile>(`${API}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: FOLDER,
        ...(parent ? { parents: [parent] } : {}),
        ...(appProperties ? { appProperties } : {}),
      }),
    });
    return f.id;
  }

  async email() {
    const r = await this.json<{ user: { emailAddress: string } }>(
      `${API}/about?fields=user(emailAddress)`,
    );
    return r.user.emailAddress;
  }

  private async rootFolder(create: boolean): Promise<string | null> {
    const found = await this.search(
      `appProperties has { key='inkflowRoot' and value='1' } and mimeType=${quote(FOLDER)} and trashed=false`,
    );
    if (found[0]) return found[0].id;
    return create ? this.createFolder(ROOT_NAME, null, { inkflowRoot: "1" }) : null;
  }

  async projectFolder(projectId: string, title: string) {
    const found = await this.search(
      `appProperties has { key='inkflowProject' and value=${quote(projectId)} } and trashed=false`,
    );
    if (found[0]) return found[0].id;
    const root = (await this.rootFolder(true))!;
    return this.createFolder(title, root, { inkflowProject: projectId });
  }

  async listProjects(): Promise<RemoteProject[]> {
    const root = await this.rootFolder(false);
    if (!root) return [];
    const found = await this.search(
      `${quote(root)} in parents and mimeType=${quote(FOLDER)} and trashed=false`,
    );
    return found
      .filter((f) => f.appProperties?.inkflowProject)
      .map((f) => ({
        folderId: f.id,
        projectId: f.appProperties!.inkflowProject!,
        title: f.name,
        modifiedTime: f.modifiedTime ?? "",
      }));
  }

  async list(folderId: string) {
    const files = new Map<string, RemoteFile>();
    const queue: [string, string][] = [[folderId, ""]];
    while (queue.length) {
      const [id, prefix] = queue.shift()!;
      for (const f of await this.search(`${quote(id)} in parents and trashed=false`)) {
        const path = prefix + f.name;
        if (f.mimeType === FOLDER) {
          this.folders.set(`${folderId}/${path}`, f.id);
          queue.push([f.id, path + "/"]);
        } else if (!files.has(path)) {
          files.set(path, { id: f.id, path, md5: f.md5Checksum ?? "" });
        }
      }
    }
    return files;
  }

  /** Id da pasta de um caminho, criando as que faltam. */
  private async folderFor(folderId: string, path: string) {
    const parts = path.split("/").slice(0, -1);
    let parent = folderId;
    let sub = "";
    for (const part of parts) {
      sub = sub ? `${sub}/${part}` : part;
      const key = `${folderId}/${sub}`;
      let id = this.folders.get(key);
      if (!id) {
        const existing = await this.search(
          `${quote(parent)} in parents and name=${quote(part)} and mimeType=${quote(FOLDER)} and trashed=false`,
          "id",
        );
        id = existing[0]?.id ?? (await this.createFolder(part, parent));
        this.folders.set(key, id);
      }
      parent = id;
    }
    return parent;
  }

  async download(id: string) {
    const res = await this.request(`${API}/files/${id}?alt=media`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async upload(folderId: string, path: string, data: Uint8Array, id?: string): Promise<RemoteFile> {
    const body = data as Uint8Array<ArrayBuffer>;
    const fields = "fields=id,md5Checksum";
    let f: ApiFile;
    if (data.length > SIMPLE_LIMIT) {
      const meta = id
        ? {}
        : { name: path.split("/").pop(), parents: [await this.folderFor(folderId, path)] };
      const start = await this.request(
        id
          ? `${UPLOAD}/files/${id}?uploadType=resumable&${fields}`
          : `${UPLOAD}/files?uploadType=resumable&${fields}`,
        {
          method: id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json; charset=UTF-8" },
          body: JSON.stringify(meta),
        },
      );
      const session = start.headers.get("Location");
      if (!session) throw new DriveError("O Google Drive não aceitou o envio do arquivo grande.");
      f = (await (await this.request(session, { method: "PUT", body })).json()) as ApiFile;
    } else if (id) {
      f = await this.json<ApiFile>(`${UPLOAD}/files/${id}?uploadType=media&${fields}`, {
        method: "PATCH",
        body,
      });
    } else {
      const boundary = `inkflow${crypto.randomUUID().replace(/-/g, "")}`;
      const meta = { name: path.split("/").pop(), parents: [await this.folderFor(folderId, path)] };
      const multipart = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
        `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
        body,
        `\r\n--${boundary}--`,
      ]);
      f = await this.json<ApiFile>(`${UPLOAD}/files?uploadType=multipart&${fields}`, {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body: multipart,
      });
    }
    return { id: f.id, path, md5: f.md5Checksum ?? "" };
  }

  async remove(id: string) {
    await this.request(`${API}/files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });
  }
}

//! Acesso aos arquivos do vault.
//!
//! Cada comando recebe a raiz do vault (escolhida pelo usuário numa caixa de
//! diálogo) e um caminho relativo. Caminhos que tentam sair da raiz (`..`,
//! caminhos absolutos) são recusados.

use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf};

use tauri::ipc::{InvokeBody, Request, Response};
use tauri_plugin_opener::OpenerExt;

type CmdResult<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Nome que não pode virar parte de um caminho do vault: no Windows, `D:`
/// no meio do caminho trocaria de unidade, e `\\` separaria pastas.
fn bad_part(part: &str) -> bool {
    part.contains(':') || part.contains('\\') || part.chars().any(|c| c.is_control())
}

/// Junta a raiz e o caminho relativo, recusando qualquer coisa fora da raiz.
fn resolve(root: &str, rel: &str) -> CmdResult<PathBuf> {
    let root = PathBuf::from(root);
    if !root.is_absolute() {
        return Err("a raiz do vault precisa ser um caminho absoluto".into());
    }
    let mut out = root.clone();
    for c in Path::new(rel).components() {
        match c {
            Component::Normal(part) if !bad_part(&part.to_string_lossy()) => out.push(part),
            Component::CurDir => {}
            _ => return Err(format!("caminho inválido: {rel}")),
        }
    }
    if !out.starts_with(&root) {
        return Err(format!("caminho inválido: {rel}"));
    }
    Ok(out)
}

/// Garante que o caminho não sai do vault por um atalho (link simbólico):
/// a parte que já existe no disco precisa continuar dentro da raiz real.
fn ensure_real(root: &str, path: &Path) -> CmdResult<()> {
    let real_root = fs::canonicalize(root).map_err(err)?;
    let root = Path::new(root);
    let mut probe = path.to_path_buf();
    loop {
        // A própria pasta do projeto pode ser um atalho (ex.: OneDrive); o que importa é o que tem dentro.
        if probe == root {
            return Ok(());
        }
        if let Ok(meta) = fs::symlink_metadata(&probe) {
            if meta.file_type().is_symlink() {
                return Err("atalhos (links simbólicos) não são aceitos no projeto".into());
            }
            let real = fs::canonicalize(&probe).map_err(err)?;
            if !real.starts_with(&real_root) {
                return Err("caminho fora da pasta do projeto".into());
            }
            return Ok(());
        }
        if !probe.pop() {
            return Ok(());
        }
    }
}

/// `resolve` + `ensure_real`: o caminho de um arquivo que vai ser lido ou alterado.
fn safe_path(root: &str, rel: &str) -> CmdResult<PathBuf> {
    let p = resolve(root, rel)?;
    ensure_real(root, &p)?;
    Ok(p)
}

/// Grava num arquivo temporário e depois renomeia, para nunca deixar um
/// arquivo pela metade se o app fechar no meio da gravação. O temporário tem
/// nome aleatório e é criado novo (nunca abre um arquivo ou atalho já existente).
fn write_atomic(path: &Path, data: &[u8]) -> CmdResult<()> {
    let dir = path.parent().ok_or("caminho sem pasta")?;
    fs::create_dir_all(dir).map_err(err)?;
    let name = path.file_name().ok_or("caminho sem nome de arquivo")?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos())
        ^ (std::process::id() as u128) << 64;
    let tmp = dir.join(format!(
        ".{}.{:x}.inkflow-tmp",
        name.to_string_lossy(),
        nonce
    ));
    {
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)
            .map_err(err)?;
        f.write_all(data).map_err(err)?;
        f.sync_all().map_err(err)?;
    }
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        err(e)
    })
}

fn read_text(root: &str, path: &str) -> CmdResult<Option<String>> {
    match fs::read_to_string(safe_path(root, path)?) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(err(e)),
    }
}

fn rename(root: &str, from: &str, to: &str) -> CmdResult<()> {
    let src = safe_path(root, from)?;
    let dst = safe_path(root, to)?;
    if dst.exists() {
        return Err(format!("já existe um arquivo em {to}"));
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::rename(src, dst).map_err(err)
}

fn remove(root: &str, path: &str) -> CmdResult<()> {
    let target = safe_path(root, path)?;
    if target == Path::new(root) {
        return Err("não é permitido apagar a pasta do vault".into());
    }
    match fs::metadata(&target) {
        Ok(m) if m.is_dir() => fs::remove_dir_all(target).map_err(err),
        Ok(_) => fs::remove_file(target).map_err(err),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Err(e) => Err(err(e)),
    }
}

/// Nomes dos arquivos direto dentro de uma pasta (sem as subpastas), em ordem.
fn list(root: &str, path: &str) -> CmdResult<Vec<String>> {
    let dir = match fs::read_dir(safe_path(root, path)?) {
        Ok(d) => d,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(err(e)),
    };
    let mut names = vec![];
    for entry in dir {
        let entry = entry.map_err(err)?;
        if entry.file_type().map_err(err)?.is_file() {
            names.push(entry.file_name().to_string_lossy().into_owned());
        }
    }
    names.sort();
    Ok(names)
}

#[derive(serde::Serialize, PartialEq, Debug)]
pub struct FileInfo {
    path: String,
    size: u64,
    /// Última modificação, em milissegundos desde 1970.
    mtime: u64,
}

/// Todos os arquivos do vault (caminhos relativos com "/"), sem os temporários.
fn walk(root: &str) -> CmdResult<Vec<FileInfo>> {
    let base = resolve(root, "")?;
    let mut out = vec![];
    let mut stack = vec![base.clone()];
    while let Some(dir) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(e) if e.kind() == ErrorKind::NotFound => continue,
            Err(e) => return Err(err(e)),
        };
        for entry in entries {
            let entry = entry.map_err(err)?;
            let kind = entry.file_type().map_err(err)?;
            if kind.is_dir() {
                stack.push(entry.path());
            } else if kind.is_file() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if name.ends_with(".inkflow-tmp") {
                    continue;
                }
                let meta = entry.metadata().map_err(err)?;
                let mtime = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map_or(0, |d| d.as_millis() as u64);
                let rel = entry.path();
                let rel = rel.strip_prefix(&base).map_err(err)?;
                let path = rel
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy())
                    .collect::<Vec<_>>()
                    .join("/");
                out.push(FileInfo {
                    path,
                    size: meta.len(),
                    mtime,
                });
            }
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

fn header(request: &Request<'_>, name: &str) -> CmdResult<String> {
    let raw = request
        .headers()
        .get(name)
        .ok_or_else(|| format!("cabeçalho {name} ausente"))?
        .to_str()
        .map_err(err)?;
    percent_decode(raw)
}

/// Decodifica o `encodeURIComponent` do JavaScript.
fn percent_decode(s: &str) -> CmdResult<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).map_err(err)?;
            out.push(u8::from_str_radix(hex, 16).map_err(err)?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(err)
}

#[tauri::command]
pub async fn vault_read_text(root: String, path: String) -> CmdResult<Option<String>> {
    read_text(&root, &path)
}

#[tauri::command]
pub async fn vault_write_text(root: String, path: String, data: String) -> CmdResult<()> {
    write_atomic(&safe_path(&root, &path)?, data.as_bytes())
}

#[tauri::command]
pub async fn vault_read_bytes(root: String, path: String) -> CmdResult<Response> {
    let data = fs::read(safe_path(&root, &path)?).map_err(err)?;
    Ok(Response::new(data))
}

/// Recebe os bytes no corpo da chamada; raiz e caminho vêm nos cabeçalhos.
#[tauri::command]
pub async fn vault_write_bytes(request: Request<'_>) -> CmdResult<()> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("esperado corpo binário".into());
    };
    let root = header(&request, "x-root")?;
    let path = header(&request, "x-path")?;
    write_atomic(&safe_path(&root, &path)?, data)
}

/// Grava a exportação no caminho escolhido na caixa "Salvar como" (fora do vault).
#[tauri::command]
pub async fn export_write(request: Request<'_>) -> CmdResult<()> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("esperado corpo binário".into());
    };
    let path = PathBuf::from(header(&request, "x-path")?);
    if !path.is_absolute() {
        return Err("caminho de exportação inválido".into());
    }
    write_atomic(&path, data)
}

#[tauri::command]
pub async fn vault_exists(root: String, path: String) -> CmdResult<bool> {
    Ok(resolve(&root, &path)?.exists())
}

#[tauri::command]
pub async fn vault_list(root: String, path: String) -> CmdResult<Vec<String>> {
    list(&root, &path)
}

/// Abre um arquivo do vault (um anexo) no programa padrão do sistema.
/// Tipos que podem ser abertos no programa padrão: nada que execute código.
const OPENABLE: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg", "mp3", "wav", "ogg", "oga", "opus",
    "m4a", "aac", "flac", "mp4", "m4v", "webm", "mov", "ogv", "pdf", "txt", "md", "rtf", "doc",
    "docx", "odt", "xls", "xlsx", "ods", "csv", "ppt", "pptx", "odp", "epub",
];

/// Só arquivos de `anexos/` com uma extensão da lista.
fn openable(path: &str) -> bool {
    let ext = path.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase());
    path.starts_with("anexos/") && ext.is_some_and(|e| OPENABLE.contains(&e.as_str()))
}

#[tauri::command]
pub async fn vault_open(app: tauri::AppHandle, root: String, path: String) -> CmdResult<()> {
    if !openable(&path) {
        return Err(
            "Por segurança, o InkFlow só abre imagens, áudios, vídeos e documentos da pasta anexos. \
             Este arquivo continua na pasta anexos do projeto."
                .into(),
        );
    }
    let target = safe_path(&root, &path)?;
    let name = path.rsplit('/').next().unwrap_or(&path);
    if !target.is_file() {
        return Err(format!(
            "O arquivo \"{name}\" não foi encontrado na pasta anexos do projeto."
        ));
    }
    app.opener()
        .open_path(target.to_string_lossy(), None::<&str>)
        .map_err(|e| {
            format!(
                "Não foi possível abrir \"{name}\". Verifique se há um programa instalado \
                 para esse tipo de arquivo. ({e})"
            )
        })
}

#[tauri::command]
pub async fn vault_walk(root: String) -> CmdResult<Vec<FileInfo>> {
    walk(&root)
}

#[tauri::command]
pub async fn vault_rename(root: String, from: String, to: String) -> CmdResult<()> {
    rename(&root, &from, &to)
}

#[tauri::command]
pub async fn vault_remove(root: String, path: String) -> CmdResult<()> {
    remove(&root, &path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().unwrap();
        let s = dir.path().to_string_lossy().into_owned();
        (dir, s)
    }

    #[test]
    fn recusa_caminhos_fora_do_vault() {
        let (_d, r) = root();
        assert!(resolve(&r, "../fora.md").is_err());
        assert!(resolve(&r, "a/../../fora.md").is_err());
        assert!(resolve(&r, "manuscrito/cena.md").is_ok());
        assert!(resolve("relativo", "x").is_err());
    }

    #[test]
    fn grava_le_move_e_remove() {
        let (_d, r) = root();
        write_atomic(
            &resolve(&r, "manuscrito/cap/cena.md").unwrap(),
            "Olá".as_bytes(),
        )
        .unwrap();
        assert_eq!(
            read_text(&r, "manuscrito/cap/cena.md").unwrap().as_deref(),
            Some("Olá")
        );
        assert_eq!(read_text(&r, "nao-existe.md").unwrap(), None);
        rename(&r, "manuscrito/cap", ".inkflow/lixeira/cap").unwrap();
        assert!(!resolve(&r, "manuscrito/cap").unwrap().exists());
        assert!(resolve(&r, ".inkflow/lixeira/cap/cena.md")
            .unwrap()
            .exists());
        remove(&r, ".inkflow").unwrap();
        assert!(!resolve(&r, ".inkflow").unwrap().exists());
        assert!(remove(&r, "").is_err());
    }

    #[test]
    fn lista_so_arquivos_da_pasta() {
        let (_d, r) = root();
        write_atomic(&resolve(&r, "anexos/b.png").unwrap(), b"b").unwrap();
        write_atomic(&resolve(&r, "anexos/a.mp3").unwrap(), b"a").unwrap();
        write_atomic(&resolve(&r, "anexos/sub/c.txt").unwrap(), b"c").unwrap();
        assert_eq!(list(&r, "anexos").unwrap(), vec!["a.mp3", "b.png"]);
        assert!(list(&r, "nao-existe").unwrap().is_empty());
    }

    #[test]
    fn percorre_todas_as_pastas() {
        let (_d, r) = root();
        write_atomic(&resolve(&r, "manuscrito/cap/cena.md").unwrap(), b"abc").unwrap();
        write_atomic(&resolve(&r, ".inkflow/project.json").unwrap(), b"{}").unwrap();
        fs::write(resolve(&r, "manuscrito/.x.inkflow-tmp").unwrap(), b"tmp").unwrap();
        let files = walk(&r).unwrap();
        let paths: Vec<_> = files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(
            paths,
            vec![".inkflow/project.json", "manuscrito/cap/cena.md"]
        );
        assert_eq!(files[1].size, 3);
        assert!(files[1].mtime > 0);
    }

    #[test]
    fn recusa_unidade_no_meio_do_caminho() {
        let (_d, r) = root();
        assert!(resolve(&r, "x/D:/evil.txt").is_err());
        assert!(resolve(&r, "D:").is_err());
        assert!(resolve(&r, "a\\..\\b").is_err());
    }

    #[test]
    #[cfg(unix)]
    fn recusa_atalhos_para_fora() {
        let (_d, r) = root();
        let fora = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(fora.path(), resolve(&r, "anexos").unwrap()).unwrap();
        assert!(safe_path(&r, "anexos/x.png").is_err());
        assert!(read_text(&r, "anexos/x.png").is_err());
        write_atomic(&resolve(&r, "a.md").unwrap(), b"ok").unwrap();
        // Um temporário plantado como atalho não é seguido.
        let alvo = fora.path().join("alvo.txt");
        std::os::unix::fs::symlink(&alvo, resolve(&r, ".b.md.inkflow-tmp").unwrap()).unwrap();
        write_atomic(&safe_path(&r, "b.md").unwrap(), b"novo").unwrap();
        assert!(!alvo.exists());
    }

    #[test]
    #[cfg(unix)]
    fn aceita_pasta_do_projeto_que_e_atalho() {
        let real = tempfile::tempdir().unwrap();
        let links = tempfile::tempdir().unwrap();
        let link = links.path().join("vault");
        std::os::unix::fs::symlink(real.path(), &link).unwrap();
        let r = link.to_string_lossy().into_owned();
        write_atomic(&safe_path(&r, "manuscrito/cena.md").unwrap(), b"ok").unwrap();
        assert_eq!(
            read_text(&r, "manuscrito/cena.md").unwrap().as_deref(),
            Some("ok")
        );
    }

    #[test]
    fn so_abre_anexos_seguros() {
        assert!(openable("anexos/mapa.PNG"));
        assert!(openable("anexos/roteiro.pdf"));
        assert!(!openable("anexos/mapa.pdf.exe"));
        assert!(!openable("anexos/script.bat"));
        assert!(!openable("manuscrito/cena.md"));
    }

    #[test]
    fn nao_sobrescreve_ao_mover() {
        let (_d, r) = root();
        write_atomic(&resolve(&r, "a.md").unwrap(), b"a").unwrap();
        write_atomic(&resolve(&r, "b.md").unwrap(), b"b").unwrap();
        assert!(rename(&r, "a.md", "b.md").is_err());
    }

    #[test]
    fn decodifica_cabecalhos() {
        assert_eq!(
            percent_decode("Cap%C3%ADtulo%201%2Fcena").unwrap(),
            "Capítulo 1/cena"
        );
        assert_eq!(
            percent_decode("C%3A%5CUsers%5Cana").unwrap(),
            "C:\\Users\\ana"
        );
    }
}

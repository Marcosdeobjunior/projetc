//! Acesso aos arquivos do vault.
//!
//! Cada comando recebe a raiz do vault (escolhida pelo usuário numa caixa de
//! diálogo) e um caminho relativo. Caminhos que tentam sair da raiz (`..`,
//! caminhos absolutos) são recusados.

use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf};

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request, Response};

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    name: String,
    is_dir: bool,
}

type CmdResult<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Junta a raiz e o caminho relativo, recusando qualquer coisa fora da raiz.
fn resolve(root: &str, rel: &str) -> CmdResult<PathBuf> {
    let root = PathBuf::from(root);
    if !root.is_absolute() {
        return Err("a raiz do vault precisa ser um caminho absoluto".into());
    }
    let mut out = root;
    for c in Path::new(rel).components() {
        match c {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            _ => return Err(format!("caminho inválido: {rel}")),
        }
    }
    Ok(out)
}

/// Grava num arquivo temporário e depois renomeia, para nunca deixar um
/// arquivo pela metade se o app fechar no meio da gravação.
fn write_atomic(path: &Path, data: &[u8]) -> CmdResult<()> {
    let dir = path.parent().ok_or("caminho sem pasta")?;
    fs::create_dir_all(dir).map_err(err)?;
    let name = path.file_name().ok_or("caminho sem nome de arquivo")?;
    let tmp = dir.join(format!(".{}.inkflow-tmp", name.to_string_lossy()));
    {
        let mut f = fs::File::create(&tmp).map_err(err)?;
        f.write_all(data).map_err(err)?;
        f.sync_all().map_err(err)?;
    }
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        err(e)
    })
}

fn read_text(root: &str, path: &str) -> CmdResult<Option<String>> {
    match fs::read_to_string(resolve(root, path)?) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(err(e)),
    }
}

fn list(root: &str, path: &str) -> CmdResult<Vec<DirEntry>> {
    let dir = resolve(root, path)?;
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(err(e)),
    };
    let mut out = Vec::new();
    for entry in entries {
        let entry = entry.map_err(err)?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.ends_with(".inkflow-tmp") {
            continue;
        }
        out.push(DirEntry {
            name,
            is_dir: entry.file_type().map_err(err)?.is_dir(),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

fn rename(root: &str, from: &str, to: &str) -> CmdResult<()> {
    let src = resolve(root, from)?;
    let dst = resolve(root, to)?;
    if dst.exists() {
        return Err(format!("já existe um arquivo em {to}"));
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::rename(src, dst).map_err(err)
}

fn remove(root: &str, path: &str) -> CmdResult<()> {
    let target = resolve(root, path)?;
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
    write_atomic(&resolve(&root, &path)?, data.as_bytes())
}

#[tauri::command]
pub async fn vault_read_bytes(root: String, path: String) -> CmdResult<Response> {
    let data = fs::read(resolve(&root, &path)?).map_err(err)?;
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
    write_atomic(&resolve(&root, &path)?, data)
}

#[tauri::command]
pub async fn vault_list(root: String, path: String) -> CmdResult<Vec<DirEntry>> {
    list(&root, &path)
}

#[tauri::command]
pub async fn vault_exists(root: String, path: String) -> CmdResult<bool> {
    Ok(resolve(&root, &path)?.exists())
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
    fn grava_le_lista_move_e_remove() {
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
        assert_eq!(
            list(&r, "manuscrito").unwrap(),
            vec![DirEntry {
                name: "cap".into(),
                is_dir: true
            }]
        );
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

//! Baixa uma imagem da internet para o fundo da tela de projetos.
//!
//! A política de segurança da janela (CSP) não deixa a interface carregar
//! imagens de outros sites, então o download acontece aqui e a interface
//! recebe só os bytes, que ela reduz e guarda como cópia local.

use std::time::Duration;
use tauri::ipc::Response;

/// Tamanho máximo aceito (antes de reduzir).
const MAX_BYTES: usize = 20 * 1024 * 1024;

type CmdResult<T> = Result<T, String>;

/// Confere o endereço: só http e https.
fn parse_url(url: &str) -> CmdResult<reqwest::Url> {
    let parsed =
        reqwest::Url::parse(url.trim()).map_err(|_| "Esse endereço não é válido.".to_string())?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        _ => Err("Use um endereço que comece com http:// ou https://.".into()),
    }
}

#[tauri::command]
pub async fn fetch_image(url: String) -> CmdResult<Response> {
    let url = parse_url(&url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("InkFlow")
        .build()
        .map_err(|e| e.to_string())?;
    let mut res = client.get(url).send().await.map_err(|_| {
        "Não foi possível baixar a imagem. Confira o endereço e a conexão com a internet."
            .to_string()
    })?;
    if !res.status().is_success() {
        return Err(format!(
            "O site não entregou a imagem (erro {}).",
            res.status().as_u16()
        ));
    }
    let kind = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !kind.starts_with("image/") {
        return Err("Esse endereço não aponta para uma imagem.".into());
    }
    let too_big = || "A imagem passa de 20 MB. Escolha uma menor.".to_string();
    if res.content_length().is_some_and(|n| n > MAX_BYTES as u64) {
        return Err(too_big());
    }
    let mut data = Vec::new();
    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
        data.extend_from_slice(&chunk);
        if data.len() > MAX_BYTES {
            return Err(too_big());
        }
    }
    Ok(Response::new(data))
}

#[cfg(test)]
mod tests {
    use super::parse_url;

    #[test]
    fn aceita_so_http_e_https() {
        assert!(parse_url("https://exemplo.com/a.jpg").is_ok());
        assert!(parse_url(" http://exemplo.com/a.png ").is_ok());
        assert!(parse_url("file:///etc/passwd").is_err());
        assert!(parse_url("javascript:alert(1)").is_err());
        assert!(parse_url("não é endereço").is_err());
    }
}

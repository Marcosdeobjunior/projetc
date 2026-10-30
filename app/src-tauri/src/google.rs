//! Login no Google para a sincronização com o Google Drive.
//!
//! Usa o fluxo de "app instalado": abre o navegador na página de login do
//! Google, que devolve a autorização para um endereço local
//! (http://127.0.0.1:<porta>) onde este comando está esperando. O código
//! recebido é trocado por tokens com PKCE. As chamadas ao Drive são feitas
//! pela interface, com o token de acesso.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri_plugin_opener::OpenerExt;

type CmdResult<T> = Result<T, String>;

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
/// Só os arquivos e pastas que o próprio InkFlow criou no Drive.
const SCOPE: &str = "https://www.googleapis.com/auth/drive.file";
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Serialize, Deserialize)]
pub struct Tokens {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    expires_in: u64,
}

#[derive(Deserialize)]
struct TokenError {
    error: String,
    #[serde(default)]
    error_description: Option<String>,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn random_string(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

/// Desafio PKCE (S256) a partir do verificador.
fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let hex = bytes
            .get(i + 1..i + 3)
            .and_then(|h| std::str::from_utf8(h).ok())
            .and_then(|h| u8::from_str_radix(h, 16).ok());
        match (bytes[i], hex) {
            (b'%', Some(v)) => {
                out.push(v);
                i += 3;
                continue;
            }
            (b'+', _) => out.push(b' '),
            (b, _) => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Valores da query string de uma linha "GET /?a=1&b=2 HTTP/1.1".
fn query_param(request_line: &str, name: &str) -> Option<String> {
    let target = request_line.split_whitespace().nth(1)?;
    let query = target.split_once('?')?.1;
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == name).then(|| decode(v))
    })
}

fn respond(mut stream: &TcpStream, ok: bool) {
    let (title, text) = if ok {
        (
            "Pronto!",
            "Sua conta Google foi conectada ao InkFlow. Pode fechar esta aba e voltar ao app.",
        )
    } else {
        (
            "Não foi possível conectar",
            "O login foi cancelado ou deu errado. Volte ao InkFlow e tente de novo.",
        )
    };
    let body = format!(
        "<!doctype html><meta charset=utf-8><title>InkFlow</title>\
         <body style=\"font-family:system-ui;background:#0b0b0d;color:#ececf0;display:grid;place-items:center;height:100vh;margin:0\">\
         <div style=\"text-align:center\"><h1 style=\"color:#c4b5fd\">{title}</h1><p>{text}</p></div>"
    );
    let _ = write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
}

/// Espera o navegador voltar com `?code=...&state=...`. Ignora outros pedidos (ex.: favicon).
fn wait_for_code(listener: TcpListener, state: &str) -> CmdResult<String> {
    listener.set_nonblocking(true).map_err(err)?;
    let started = Instant::now();
    loop {
        if started.elapsed() > LOGIN_TIMEOUT {
            return Err("O login demorou demais. Tente de novo.".into());
        }
        let stream = match listener.accept() {
            Ok((s, _)) => s,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            Err(e) => return Err(err(e)),
        };
        stream.set_nonblocking(false).map_err(err)?;
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .map_err(err)?;
        let mut line = String::new();
        if BufReader::new(&stream).read_line(&mut line).is_err() {
            continue;
        }
        if query_param(&line, "state").as_deref() != Some(state) {
            continue;
        }
        if let Some(code) = query_param(&line, "code") {
            respond(&stream, true);
            return Ok(code);
        }
        respond(&stream, false);
        return Err(match query_param(&line, "error").as_deref() {
            Some("access_denied") => "O acesso não foi autorizado.".into(),
            Some(e) => format!("O Google recusou o login ({e})."),
            None => "Resposta inesperada do Google.".into(),
        });
    }
}

async fn token_request(params: &[(&str, &str)]) -> CmdResult<Tokens> {
    let res = reqwest::Client::new()
        .post(TOKEN_URL)
        .form(params)
        .send()
        .await
        .map_err(|e| format!("Sem conexão com o Google: {e}"))?;
    let status = res.status();
    let text = res.text().await.map_err(err)?;
    if status.is_success() {
        return serde_json::from_str(&text).map_err(err);
    }
    let e: Option<TokenError> = serde_json::from_str(&text).ok();
    Err(match e {
        Some(e) if e.error == "invalid_grant" => {
            "A autorização do Google expirou. Conecte a conta de novo.".into()
        }
        Some(e) => format!(
            "O Google recusou ({}): {}",
            e.error,
            e.error_description.unwrap_or_default()
        ),
        None => format!("O Google respondeu {status}."),
    })
}

/// Abre o login do Google no navegador e devolve os tokens.
#[tauri::command]
pub async fn google_sign_in(
    app: tauri::AppHandle,
    client_id: String,
    client_secret: String,
) -> CmdResult<Tokens> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(err)?;
    let redirect = format!(
        "http://127.0.0.1:{}",
        listener.local_addr().map_err(err)?.port()
    );
    let verifier = random_string(48);
    let state = random_string(16);
    let url = format!(
        "{AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&state={}&access_type=offline&prompt=consent",
        encode(&client_id),
        encode(&redirect),
        encode(SCOPE),
        challenge(&verifier),
        state,
    );
    app.opener().open_url(url, None::<&str>).map_err(err)?;

    let wait_state = state.clone();
    let code = tauri::async_runtime::spawn_blocking(move || wait_for_code(listener, &wait_state))
        .await
        .map_err(err)??;

    token_request(&[
        ("client_id", &client_id),
        ("client_secret", &client_secret),
        ("code", &code),
        ("code_verifier", &verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", &redirect),
    ])
    .await
}

/// Novo token de acesso a partir do token de renovação guardado.
#[tauri::command]
pub async fn google_refresh(
    client_id: String,
    client_secret: String,
    refresh_token: String,
) -> CmdResult<Tokens> {
    token_request(&[
        ("client_id", &client_id),
        ("client_secret", &client_secret),
        ("refresh_token", &refresh_token),
        ("grant_type", "refresh_token"),
    ])
    .await
}

/// Desfaz a autorização no Google (ao desconectar a conta).
#[tauri::command]
pub async fn google_revoke(token: String) -> CmdResult<()> {
    reqwest::Client::new()
        .post("https://oauth2.googleapis.com/revoke")
        .form(&[("token", token.as_str())])
        .send()
        .await
        .map_err(err)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_parametros_da_volta_do_login() {
        let line = "GET /?state=abc&code=4%2F0Ab-c%20d&scope=x HTTP/1.1\r\n";
        assert_eq!(query_param(line, "state").as_deref(), Some("abc"));
        assert_eq!(query_param(line, "code").as_deref(), Some("4/0Ab-c d"));
        assert_eq!(query_param(line, "error"), None);
        assert_eq!(query_param("GET /favicon.ico HTTP/1.1", "code"), None);
    }

    #[test]
    fn desafio_pkce_conhecido() {
        // Exemplo do RFC 7636, apêndice B.
        assert_eq!(
            challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        assert_eq!(encode("a b/c"), "a%20b%2Fc");
    }
}

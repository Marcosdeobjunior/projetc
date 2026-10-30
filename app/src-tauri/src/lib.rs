mod google;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            vault::vault_read_text,
            vault::vault_write_text,
            vault::vault_read_bytes,
            vault::vault_write_bytes,
            vault::vault_exists,
            vault::vault_list,
            vault::vault_open,
            vault::vault_walk,
            google::google_sign_in,
            google::google_refresh,
            google::google_revoke,
            vault::vault_rename,
            vault::vault_remove,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o InkFlow");
}

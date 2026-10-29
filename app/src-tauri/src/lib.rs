mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            vault::vault_read_text,
            vault::vault_write_text,
            vault::vault_read_bytes,
            vault::vault_write_bytes,
            vault::vault_list,
            vault::vault_exists,
            vault::vault_rename,
            vault::vault_remove,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o InkFlow");
}

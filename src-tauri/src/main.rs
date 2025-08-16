// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Estructura para los argumentos que vienen del frontend
#[derive(serde::Deserialize)]
struct TransferArgs {
    mode: String,
    protocol: String,
    files: Vec<String>,
}

#[tauri::command]
async fn start_transfer(args: TransferArgs) -> Result<String, String> {
    // Aquí iría tu lógica de red
    // ...
    // ... (por ejemplo, el código del ejemplo anterior)
    // ...

    Ok(format!("Transferencia iniciada en modo {} con protocolo {}. Archivos: {:?}", args.mode, args.protocol, args.files))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![start_transfer])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

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
use ping::ping;
use std::net::IpAddr;

#[tauri::command]
fn ping_ip(ip: String) -> Result<String, String> {
    let ip_addr: IpAddr = ip.parse().map_err(|e| format!("IP inválida: {}", e))?;
    match ping(ip_addr, None, None, None, None, None) {
        Ok(response) => Ok(format!("Ping exitoso: {:?}", response)),
        Err(e) => Err(format!("Error: {:?}", e)),
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![start_transfer, ping_ip])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
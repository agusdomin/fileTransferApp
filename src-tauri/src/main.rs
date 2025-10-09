use std::thread;
use std::sync::mpsc;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
#[tauri::command]
fn start_receiver(save_path: String) -> Result<String, String> {
    // Lanzar el receptor en un hilo separado para no bloquear la UI
    thread::spawn(move || {
        let listener = TcpListener::bind("0.0.0.0:4000").expect("No se pudo abrir el puerto 4000");
        println!("[RECEIVER] Esperando conexión en puerto 4000...");
        for stream in listener.incoming() {
            match stream {
                Ok(mut s) => {
                    println!("[RECEIVER] Conexión recibida");
                    let mut file = std::fs::File::create(&save_path).expect("No se pudo crear el archivo");
                    let mut buffer = [0u8; 4096];
                    loop {
                        match s.read(&mut buffer) {
                            Ok(0) => break, // Fin de transmisión
                            Ok(n) => {
                                file.write_all(&buffer[..n]).expect("Error escribiendo archivo");
                            },
                            Err(e) => {
                                println!("[RECEIVER] Error leyendo: {}", e);
                                break;
                            }
                        }
                    }
                    println!("[RECEIVER] Archivo guardado en {}", save_path);
                },
                Err(e) => println!("[RECEIVER] Error de conexión: {}", e),
            }
        }
    });
    Ok("Receptor iniciado en puerto 4000".to_string())
}
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Estructura para los argumentos que vienen del frontend
use serde::Deserialize;

#[derive(Deserialize)]
struct FileArg {
    name: String,
    content_base64: String,
}

#[derive(Deserialize)]
struct TransferArgs {
    ip: String,
    protocol: String,
    files: Vec<FileArg>,
}

#[tauri::command]
async fn start_transfer(args: TransferArgs) -> Result<String, String> {
    // Debug: mostrar los argumentos recibidos
    println!("[DEBUG] start_transfer llamado con:");
    println!("  ip: {}", args.ip);
    println!("  protocol: {}", args.protocol);
    println!("  files: [");
    for f in &args.files {
        println!("    {} ({} bytes base64)", f.name, f.content_base64.len());
    }
    println!("  ]");

    // Solo soporta TCP por ahora y solo el primer archivo
    if args.files.is_empty() {
        return Err("No se proporcionaron archivos".into());
    }
    if args.protocol.to_uppercase() != "TCP" {
        return Err("Por ahora solo se soporta TCP".into());
    }

    let file = &args.files[0];
    let ip = &args.ip;
    let port = 4000; // Puerto fijo para ejemplo
    let addr = format!("{}:{}", ip, port);

    use std::io::Write;
    use std::net::TcpStream;
    let file_bytes = match base64::decode(&file.content_base64) {
        Ok(b) => b.to_vec(),
        Err(e) => return Err(format!("No se pudo decodificar el archivo base64: {}", e)),
    };

    println!("[DEBUG] start_transfer llamado con:", );

    let mut stream = TcpStream::connect(&addr).map_err(|e| format!("No se pudo conectar a {}: {}", addr, e))?;
    stream.write_all(&file_bytes).map_err(|e| format!("Error enviando datos: {}", e))?;

    Ok(format!("Archivo '{}' enviado correctamente a {}", file.name, addr))
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
        .invoke_handler(tauri::generate_handler![start_transfer, ping_ip, start_receiver])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
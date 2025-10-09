// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::thread;
use std::sync::mpsc;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::net::UdpSocket;

#[tauri::command]
fn get_local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let local_addr = socket.local_addr().ok()?;
    Some(local_addr.ip().to_string())
}

#[tauri::command]
fn start_receiver(save_path: String) -> Result<String, String> {
    // Lanzar el receptor en un hilo separado para no bloquear la UI
    use std::path::Path;
    use std::fs;
    use std::io::BufReader;
    use std::io::Read;
    thread::spawn(move || {
        let listener = TcpListener::bind("0.0.0.0:4000").expect("No se pudo abrir el puerto 4000");
        println!("[RECEIVER] Esperando conexión en puerto 4000...");
        for stream in listener.incoming() {
            match stream {
                Ok(mut s) => {
                    println!("[RECEIVER] Conexión recibida en directorio {}", save_path);
                    // Asegurarse de que el directorio existe
                    if !Path::new(&save_path).exists() {
                        if let Err(e) = fs::create_dir_all(&save_path) {
                            println!("[RECEIVER] No se pudo crear el directorio: {}", e);
                            continue;
                        }
                    }
                    // Leer el nombre del archivo primero (enviar desde el transmisor)
                    let mut name_len_buf = [0u8; 2];
                    if let Err(e) = s.read_exact(&mut name_len_buf) {
                        println!("[RECEIVER] Error leyendo longitud de nombre: {}", e);
                        continue;
                    }
                    let name_len = u16::from_be_bytes(name_len_buf) as usize;
                    let mut name_buf = vec![0u8; name_len];
                    if let Err(e) = s.read_exact(&mut name_buf) {
                        println!("[RECEIVER] Error leyendo nombre de archivo: {}", e);
                        continue;
                    }
                    let file_name = match String::from_utf8(name_buf) {
                        Ok(n) => n,
                        Err(e) => {
                            println!("[RECEIVER] Nombre de archivo inválido: {}", e);
                            continue;
                        }
                    };
                    let file_path = Path::new(&save_path).join(&file_name);
                    let mut file = match std::fs::File::create(&file_path) {
                        Ok(f) => f,
                        Err(e) => {
                            println!("[RECEIVER] No se pudo crear el archivo: {}", e);
                            continue;
                        }
                    };
                    let mut buffer = [0u8; 4096];
                    loop {
                        match s.read(&mut buffer) {
                            Ok(0) => break, // Fin de transmisión
                            Ok(n) => {
                                if let Err(e) = file.write_all(&buffer[..n]) {
                                    println!("[RECEIVER] Error escribiendo archivo: {}", e);
                                    break;
                                }
                            },
                            Err(e) => {
                                println!("[RECEIVER] Error leyendo: {}", e);
                                break;
                            }
                        }
                    }
                    println!("[RECEIVER] Archivo guardado en {:?}", file_path);
                },
                Err(e) => println!("[RECEIVER] Error de conexión: {}", e),
            }
        }
    });
    Ok("Receptor iniciado en puerto 4000".to_string())
}

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

    // Enviar primero la longitud del nombre de archivo (2 bytes, big endian), luego el nombre, luego el archivo
    let file_name_bytes = file.name.as_bytes();
    let name_len = file_name_bytes.len();
    if name_len > u16::MAX as usize {
        return Err("Nombre de archivo demasiado largo".to_string());
    }
    let mut stream = TcpStream::connect(&addr).map_err(|e| format!("No se pudo conectar a {}: {}", addr, e))?;
    let name_len_bytes = (name_len as u16).to_be_bytes();
    stream.write_all(&name_len_bytes).map_err(|e| format!("Error enviando longitud de nombre: {}", e))?;
    stream.write_all(file_name_bytes).map_err(|e| format!("Error enviando nombre de archivo: {}", e))?;
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
        .invoke_handler(tauri::generate_handler![start_transfer, get_local_ip, ping_ip, start_receiver])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
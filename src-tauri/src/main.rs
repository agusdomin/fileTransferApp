// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::thread;
use std::sync::mpsc;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::net::UdpSocket;
use std::sync::Mutex;
use std::fs::{File, OpenOptions};
use std::io::BufWriter;
use chrono::Local;

// Estado global del archivo de log
struct LogState {
    file_path: String,
}

impl LogState { // Implementacion de los metodos de la clase (estructura) LogState
    fn new() -> Self { // Constructor de clase
        let timestamp = Local::now().format("%Y%m%d_%H%M%S");
        let log_path = format!("logs/transfer_log_{}.txt", timestamp);
        
        // Crear directorio de logs si no existe
        std::fs::create_dir_all("logs").ok();
        
        // Crear archivo de log
        if let Ok(mut file) = File::create(&log_path) {
            let header = format!("=== Log de Transferencia ===\nInicio: {}\n\n", Local::now().format("%Y-%m-%d %H:%M:%S"));
            let _ = file.write_all(header.as_bytes());
        }
        
        LogState {
            file_path: log_path,
        }
    }
}

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
                    // Recibir múltiples archivos en la misma conexión
                    loop {
                        // Leer longitud del nombre (2 bytes)
                        let mut name_len_buf = [0u8; 2];
                        if let Err(e) = s.read_exact(&mut name_len_buf) {
                            // Si no hay más datos, salir del bucle
                            if e.kind() == std::io::ErrorKind::UnexpectedEof {
                                break;
                            }
                            println!("[RECEIVER] Error leyendo longitud de nombre: {}", e);
                            break;
                        }
                        let name_len = u16::from_be_bytes(name_len_buf) as usize;
                        let mut name_buf = vec![0u8; name_len];
                        if let Err(e) = s.read_exact(&mut name_buf) {
                            println!("[RECEIVER] Error leyendo nombre de archivo: {}", e);
                            break;
                        }
                        let file_name = match String::from_utf8(name_buf) {
                            Ok(n) => n,
                            Err(e) => {
                                println!("[RECEIVER] Nombre de archivo inválido: {}", e);
                                break;
                            }
                        };
                        // Leer tamaño del archivo (8 bytes)
                        let mut size_buf = [0u8; 8];
                        if let Err(e) = s.read_exact(&mut size_buf) {
                            println!("[RECEIVER] Error leyendo tamaño de archivo: {}", e);
                            break;
                        }
                        let file_size = u64::from_be_bytes(size_buf);
                        let file_path = Path::new(&save_path).join(&file_name);
                        let mut file = match std::fs::File::create(&file_path) {
                            Ok(f) => f,
                            Err(e) => {
                                println!("[RECEIVER] No se pudo crear el archivo: {}", e);
                                break;
                            }
                        };
                        let mut bytes_left = file_size;
                        let mut buffer = [0u8; 4096];
                        while bytes_left > 0 {
                            let to_read = std::cmp::min(buffer.len() as u64, bytes_left) as usize;
                            match s.read_exact(&mut buffer[..to_read]) {
                                Ok(()) => {
                                    if let Err(e) = file.write_all(&buffer[..to_read]) {
                                        println!("[RECEIVER] Error escribiendo archivo: {}", e);
                                        break;
                                    }
                                    bytes_left -= to_read as u64;
                                },
                                Err(e) => {
                                    println!("[RECEIVER] Error leyendo datos de archivo: {}", e);
                                    break;
                                }
                            }
                        }
                        println!("[RECEIVER] Archivo guardado en {:?}", file_path);
                    }
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
async fn start_transfer(log_state: tauri::State<'_, Mutex<LogState>>, args: TransferArgs) -> Result<String, String> {
    // Registrar inicio de transferencia
    write_log(&log_state, &format!("Iniciando transferencia a {}:{}", args.ip, 4000));
    write_log(&log_state, &format!("Protocolo: {}", args.protocol));
    write_log(&log_state, &format!("Archivos a enviar: {}", args.files.len()));
    
    // Debug: mostrar los argumentos recibidos
    println!("[DEBUG] start_transfer llamado con:");
    println!("  ip: {}", args.ip);
    println!("  protocol: {}", args.protocol);
    println!("  files: [");
    for f in &args.files {
        println!("    {} ({} bytes base64)", f.name, f.content_base64.len());
    }
    println!("  ]");

    // Solo soporta TCP por ahora y todos los archivos
    if args.files.is_empty() {
        let error_msg = "No se proporcionaron archivos".to_string();
        write_log(&log_state, &format!("✗ {}", error_msg));
        return Err(error_msg);
    }
    if args.protocol.to_uppercase() != "TCP" {
        let error_msg = "Por ahora solo se soporta TCP".to_string();
        write_log(&log_state, &format!("✗ {}", error_msg));
        return Err(error_msg);
    }

    let ip = &args.ip;
    let port = 4000; // Puerto fijo para ejemplo
    let addr = format!("{}:{}", ip, port);

    use std::io::Write;
    use std::net::TcpStream;
    let mut stream = TcpStream::connect(&addr).map_err(|e| {
        let error_msg = format!("No se pudo conectar a {}: {}", addr, e);
        write_log(&log_state, &format!("✗ {}", error_msg));
        error_msg
    })?;
    
    write_log(&log_state, "✓ Conexión establecida");

    for file in &args.files {
        write_log(&log_state, &format!("Enviando archivo: {}", file.name));
        let file_bytes = match base64::decode(&file.content_base64) {
            Ok(b) => b.to_vec(),
            Err(e) => {
                let error_msg = format!("No se pudo decodificar el archivo base64: {}", e);
                write_log(&log_state, &format!("✗ {}", error_msg));
                return Err(error_msg);
            },
        };
        // Enviar primero la longitud del nombre de archivo (2 bytes, big endian), luego el nombre, luego el tamaño (8 bytes), luego el archivo
        let file_name_bytes = file.name.as_bytes();
        let name_len = file_name_bytes.len();
        if name_len > u16::MAX as usize {
            return Err("Nombre de archivo demasiado largo".to_string());
        }
        let name_len_bytes = (name_len as u16).to_be_bytes();
        let file_size_bytes = (file_bytes.len() as u64).to_be_bytes();
        stream.write_all(&name_len_bytes).map_err(|e| format!("Error enviando longitud de nombre: {}", e))?;
        stream.write_all(file_name_bytes).map_err(|e| format!("Error enviando nombre de archivo: {}", e))?;
        stream.write_all(&file_size_bytes).map_err(|e| format!("Error enviando tamaño de archivo: {}", e))?;
        stream.write_all(&file_bytes).map_err(|e| format!("Error enviando datos: {}", e))?;
        write_log(&log_state, &format!("✓ Archivo '{}' enviado ({} bytes)", file.name, file_bytes.len()));
        println!("[DEBUG] Archivo '{}' enviado ({} bytes)", file.name, file_bytes.len());
    }

    let success_msg = format!("{} archivo(s) enviados correctamente a {}", args.files.len(), addr);
    write_log(&log_state, &format!("✓ {}", success_msg));
    Ok(success_msg)
}
use ping::ping;
use std::net::IpAddr;

// Función auxiliar para escribir en el log
fn write_log(log_state: &Mutex<LogState>, message: &str) {
    if let Ok(state) = log_state.lock() {
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&state.file_path)
        {
            let timestamp = Local::now().format("%H:%M:%S");
            let log_entry = format!("[{}] {}\n", timestamp, message);
            let _ = file.write_all(log_entry.as_bytes());
        }
    }
}

#[tauri::command]
fn write_log_entry(log_state: tauri::State<Mutex<LogState>>, message: String) -> Result<(), String> {
    write_log(&log_state, &message);
    Ok(())
}

#[tauri::command]
fn read_logs(log_state: tauri::State<Mutex<LogState>>) -> Result<String, String> {
    if let Ok(state) = log_state.lock() {
        match std::fs::read_to_string(&state.file_path) {
            Ok(content) => Ok(content),
            Err(e) => Err(format!("Error leyendo logs: {}", e)),
        }
    } else {
        Err("No se pudo acceder al estado del log".to_string())
    }
}

#[tauri::command]
fn get_log_file_path(log_state: tauri::State<Mutex<LogState>>) -> Result<String, String> {
    if let Ok(state) = log_state.lock() {
        Ok(state.file_path.clone())
    } else {
        Err("No se pudo acceder al estado del log".to_string())
    }
}

#[tauri::command]
fn ping_ip(log_state: tauri::State<Mutex<LogState>>, ip: String) -> Result<String, String> {
    write_log(&log_state, &format!("Iniciando ping a {}...", ip));
    let ip_addr: IpAddr = ip.parse().map_err(|e| {
        let error_msg = format!("IP inválida: {}", e);
        write_log(&log_state, &format!("✗ {}", error_msg));
        error_msg
    })?;
    match ping(ip_addr, None, None, None, None, None) {
        Ok(response) => {
            let success_msg = format!("Ping exitoso: {:?}", response);
            write_log(&log_state, &format!("✓ Ping exitoso a {}", ip));
            Ok(success_msg)
        },
        Err(e) => {
            let error_msg = format!("Error: {:?}", e);
            write_log(&log_state, &format!("✗ Error en ping: {}", e));
            Err(error_msg)
        },
    }
}

fn main() {
    let log_state = Mutex::new(LogState::new());
    
    tauri::Builder::default()
        .manage(log_state)
        .invoke_handler(tauri::generate_handler![
            start_transfer, 
            get_local_ip, 
            ping_ip, 
            start_receiver,
            write_log_entry,
            read_logs,
            get_log_file_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
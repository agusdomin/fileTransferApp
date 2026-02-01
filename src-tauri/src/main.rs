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
use md5;
use sha2::{Sha256, Digest as Sha2Digest};
use sha3::{Sha3_256, Digest as Sha3Digest};
use crc32fast::Hasher;

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

    let ip = &args.ip;
    let port = 4000; // Puerto fijo para ejemplo
    let addr = format!("{}:{}", ip, port);

    use std::io::Write; // para realizar operaciones de escritura en tipos que lo implementan, como File, TcpStream, o BufWriter.
    use std::net::TcpStream; // socket TCP
    use std::net::UdpSocket; // Socket UDP
    use std::time::Duration;    
    

    if args.protocol.to_uppercase() == "TCP" {
        // let error_msg = "Por ahora solo se soporta TCP".to_string();
        // write_log(&log_state, &format!("✗ {}", error_msg));
        // return Err(error_msg);
    
        println!("[DEBUG] Intentando establecer conexión TCP a {}...", addr);
        write_log(&log_state, &format!("Intentando establecer conexión TCP a {}...", addr));
        
        let mut stream = match TcpStream::connect_timeout( // Try/catch para manejar la conexión TCP
            &addr.parse::<std::net::SocketAddr>().map_err(|e| {
                let error_msg = format!("Dirección inválida {}: {}", addr, e);
                write_log(&log_state, &format!("✗ {}", error_msg));
                println!("[DEBUG] {}", error_msg);
                error_msg
            })?, // Parsear la dirección IP y puerto a SocketAddr, es lo que espera TcpStream, si falla logea el eeror
            Duration::from_secs(10) // Este es el tiempo de espera del connection_timeout
        ) {
            Ok(s) => s, // Si esta OK, devuelve el stream, es decir la conexión fue exitosa
            Err(e) => { // Sino, logea el error, la conexión falló
                let error_msg = format!("No se pudo conectar a {}: {}", addr, e);
                write_log(&log_state, &format!("✗ {}", error_msg));
                println!("[DEBUG] {}", error_msg);
                return Err(error_msg);
            }
        };

        // Configurar timeouts para operaciones de lectura/escritura
        stream.set_write_timeout(Some(Duration::from_secs(30))).ok();
        stream.set_read_timeout(Some(Duration::from_secs(30))).ok();

        println!("[DEBUG] Conexión establecida exitosamente");
        write_log(&log_state, "✓ Conexión establecida");

        for file in &args.files {
            println!("[DEBUG] Procesando archivo: {} ({} bytes base64)", file.name, file.content_base64.len());
            write_log(&log_state, &format!("Enviando archivo: {}", file.name));
            
            let file_bytes = match base64::decode(&file.content_base64) {
                Ok(b) => {
                    println!("[DEBUG] Archivo decodificado: {} bytes reales", b.len());
                    b.to_vec()
                },
                Err(e) => {
                    let error_msg = format!("No se pudo decodificar el archivo base64: {}", e);
                    write_log(&log_state, &format!("✗ {}", error_msg));
                    println!("[DEBUG] {}", error_msg);
                    return Err(error_msg);
                },
            };
            
            // Enviar primero la longitud del nombre de archivo (2 bytes, big endian), luego el nombre, luego el tamaño (8 bytes), luego el archivo
            let file_name_bytes = file.name.as_bytes();
            let name_len = file_name_bytes.len();
            if name_len > u16::MAX as usize {
                return Err("Nombre de archivo demasiado largo".to_string());
            }
            
            println!("[DEBUG] Enviando metadata del archivo...");
            let name_len_bytes = (name_len as u16).to_be_bytes();
            let file_size_bytes = (file_bytes.len() as u64).to_be_bytes();
            
            stream.write_all(&name_len_bytes).map_err(|e| {
                let error_msg = format!("Error enviando longitud de nombre: {}", e);
                println!("[DEBUG] {}", error_msg);
                error_msg
            })?;
            
            stream.write_all(file_name_bytes).map_err(|e| {
                let error_msg = format!("Error enviando nombre de archivo: {}", e);
                println!("[DEBUG] {}", error_msg);
                error_msg
            })?;
            
            stream.write_all(&file_size_bytes).map_err(|e| {
                let error_msg = format!("Error enviando tamaño de archivo: {}", e);
                println!("[DEBUG] {}", error_msg);
                error_msg
            })?;
            
            println!("[DEBUG] Enviando datos del archivo ({} bytes)...", file_bytes.len());
            stream.write_all(&file_bytes).map_err(|e| {
                let error_msg = format!("Error enviando datos: {}", e);
                println!("[DEBUG] {}", error_msg);
                error_msg
            })?;
            
            stream.flush().map_err(|e| {
                let error_msg = format!("Error haciendo flush: {}", e);
                println!("[DEBUG] {}", error_msg);
                error_msg
            })?;
            
            write_log(&log_state, &format!("✓ Archivo '{}' enviado ({} bytes)", file.name, file_bytes.len()));
            println!("[DEBUG] Archivo '{}' enviado exitosamente ({} bytes)", file.name, file_bytes.len());
        }

        let success_msg = format!("{} archivo(s) enviados correctamente a {}", args.files.len(), addr);
        write_log(&log_state, &format!("✓ {}", success_msg));
        Ok(success_msg)
    } else if args.protocol.to_uppercase() == "UDP" {
        // Crear un socket UDP
        // let mut socket = UdpSocket::bind("0.0.0.0:0")?;
        let socket = match UdpSocket::bind("0.0.0.0:0") {  // Asociar a cualquier dirección local y puerto efímero
            Ok(s) => s, // Si es Ok, obtenemos el UdpSocket
            Err(e) => {
                println!("Error al crear el socket UDP: {}", e);
                return Err(format!("Error al crear el socket UDP: {}", e));
            }
        };
        socket.connect(&addr); // Conectar al destino remoto

        println!("[DEBUG] Conectado a {} por UDP", addr);
        write_log(&log_state, &format!("Conectado a {} por UDP", addr));

        for file in &args.files {
            println!("[DEBUG] Procesando archivo: {} ({} bytes base64)", file.name, file.content_base64.len());
            write_log(&log_state, &format!("Enviando archivo: {}", file.name));

            // Decodificar el contenido del archivo desde base64
            let file_bytes = match base64::decode(&file.content_base64) {
                Ok(b) => b,
                Err(e) => {
                    let error_msg = format!("No se pudo decodificar el archivo base64: {}", e);
                    write_log(&log_state, &format!("✗ {}", error_msg));
                    println!("[DEBUG] {}", error_msg);
                    return Err(error_msg);
                },
            };

            // Preparar los datos a bytes para enviarlos en el paquete
            let file_name_bytes = file.name.as_bytes();
            let name_len = file_name_bytes.len();
            if name_len > u16::MAX as usize {
                return Err("Nombre de archivo demasiado largo".to_string());
            }            
            let name_len_bytes = (name_len as u16).to_be_bytes(); // Longitud del nombre (2 bytes)
            let file_size_bytes = (file_bytes.len() as u64).to_be_bytes(); // Tamaño del archivo (8 bytes)

            // Combinar todos los datos en un solo buffer (paquete)
            let mut packet = Vec::new();
            packet.extend_from_slice(&name_len_bytes); // Longitud del nombre
            packet.extend_from_slice(file_name_bytes); // Nombre del archivo
            packet.extend_from_slice(&file_size_bytes); // Tamaño del archivo
            packet.extend_from_slice(&file_bytes); // Contenido del archivo

            // Enviar el paquete por UDP
            match socket.send(&packet) { 
                Ok(bytes_sent) => {
                    println!("[DEBUG] Archivo '{}' enviado exitosamente ({} bytes)", file.name, bytes_sent);
                    write_log(&log_state, &format!("✓ Archivo '{}' enviado ({} bytes)", file.name, bytes_sent));
                },
                Err(e) => {
                    let error_msg = format!("Error enviando archivo '{}': {}", file.name, e);
                    write_log(&log_state, &format!("✗ {}", error_msg));
                    println!("[DEBUG] {}", error_msg);
                    return Err(error_msg);
                },
            }
        };
        let success_msg = format!("{} archivo(s) enviados correctamente a {}", args.files.len(), addr);
        write_log(&log_state, &format!("✓ {}", success_msg));
        Ok(success_msg)
    } else {
        let error_msg = format!("Protocolo no soportado: {}", args.protocol);
        write_log(&log_state, &format!("✗ {}", error_msg));
        Err(error_msg)
    }
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

// Función para calcular el hash MD5 de un archivo
#[tauri::command]
fn calcular_md5(file_path: &str) -> Result<String, String> {
    use std::fs::File;
    use std::io::{BufReader, Read};

    let file = File::open(file_path).map_err(|e| format!("Error abriendo archivo: {}", e))?;
    let mut reader = BufReader::new(file);
    let mut buffer = Vec::new();
    reader.read_to_end(&mut buffer).map_err(|e| format!("Error leyendo archivo: {}", e))?;
    let digest = md5::compute(buffer);
    Ok(format!("{:x}", digest))
}

// Función para calcular el hash SHA-256 de un archivo
#[tauri::command]
fn calcular_sha256(file_path: &str) -> Result<String, String> {
    use std::fs::File;
    use std::io::{BufReader, Read};

    let file = File::open(file_path).map_err(|e| format!("Error abriendo archivo: {}", e))?;
    let mut reader = BufReader::new(file);
    let mut buffer = Vec::new();
    reader.read_to_end(&mut buffer).map_err(|e| format!("Error leyendo archivo: {}", e))?;
    let mut hasher = Sha256::new();
    hasher.update(buffer);
    let result = hasher.finalize();
    Ok(format!("{:x}", result))
}

// Función para calcular el hash SHA-3 de un archivo
#[tauri::command]
fn calcular_sha3_256(file_path: &str) -> Result<String, String> {
    use std::fs::File;
    use std::io::{BufReader, Read};

    let file = File::open(file_path).map_err(|e| format!("Error abriendo archivo: {}", e))?;
    let mut reader = BufReader::new(file);
    let mut buffer = Vec::new();
    reader.read_to_end(&mut buffer).map_err(|e| format!("Error leyendo archivo: {}", e))?;
    let mut hasher = Sha3_256::new();
    hasher.update(buffer);
    let result = hasher.finalize();
    Ok(format!("{:x}", result))
}

// Función para calcular el hash CRC32 de un archivo
#[tauri::command]
fn calcular_crc32(file_path: &str) -> Result<String, String> {
    use std::fs::File;
    use std::io::{BufReader, Read};
    use crc32fast::Hasher;

    let file = File::open(file_path).map_err(|e| format!("Error abriendo archivo: {}", e))?;
    let mut reader = BufReader::new(file);
    let mut buffer = Vec::new();
    reader.read_to_end(&mut buffer).map_err(|e| format!("Error leyendo archivo: {}", e))?;
    let mut hasher = Hasher::new();
    hasher.update(&buffer);
    let checksum = hasher.finalize();
    Ok(format!("{:x}", checksum))
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
            get_log_file_path,
            calcular_md5,
            calcular_sha256,
            calcular_sha3_256,
            calcular_crc32
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
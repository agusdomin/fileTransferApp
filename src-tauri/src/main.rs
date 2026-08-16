// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Local;
use crc32fast::Hasher;
use tauri::Emitter;
use md5;
use rand::Rng;
use sha2::{Digest as Sha2Digest, Sha256};
use sha3::{Digest as Sha3Digest, Sha3_256};
use std::fs::{File, OpenOptions};
use std::io::BufWriter;
use std::io::{Read, Write};
use std::collections::HashMap;
use std::net::UdpSocket;
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::mpsc;
use std::sync::Mutex;
use std::thread;

// Estado global del archivo de log
struct LogState {
    file_path: String,
}

impl LogState {
    // Implementacion de los metodos de la clase (estructura) LogState
    fn new() -> Self {
        // Constructor de clase
        let timestamp = Local::now().format("%Y%m%d_%H%M%S");
        let log_path = format!("logs/transfer_log_{}.txt", timestamp);

        // Crear directorio de logs si no existe
        std::fs::create_dir_all("logs").ok();

        // Crear archivo de log
        if let Ok(mut file) = File::create(&log_path) {
            let header = format!(
                "=== Log de Transferencia ===\nInicio: {}\n\n",
                Local::now().format("%Y-%m-%d %H:%M:%S")
            );
            let _ = file.write_all(header.as_bytes());
        }

        LogState {
            file_path: log_path,
        }
    }
}

struct ReceiverStopFlag(Mutex<Option<Arc<AtomicBool>>>);

#[tauri::command]
fn get_local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let local_addr = socket.local_addr().ok()?;
    Some(local_addr.ip().to_string())
}

// Estructura para el reensamblado de archivos recibidos por UDP
struct UdpFileAssembly {
    algo: String,
    expected_checksum: String,
    file_name: String,
    total_chunks: u32,
    chunks: HashMap<u32, Vec<u8>>,
}

#[derive(serde::Serialize, Clone)]
struct ReceivedFileEvent {
    name: String,
    extension: String,
    size: u64,
    checksum_valid: bool,
    path: String,
}

// Calcula checksum directamente sobre bytes en memoria
fn calcular_checksum_bytes(data: &[u8], algoritmo: &str) -> String {
    match algoritmo {
        "MD5" => format!("{:x}", md5::compute(data)),
        "SHA-256" => {
            let mut h = Sha256::new();
            h.update(data);
            format!("{:x}", h.finalize())
        }
        "SHA3-256" => {
            let mut h = Sha3_256::new();
            h.update(data);
            format!("{:x}", h.finalize())
        }
        "CRC32" => {
            let mut h = crc32fast::Hasher::new();
            h.update(data);
            format!("{:x}", h.finalize())
        }
        _ => format!("algoritmo_desconocido({})", algoritmo),
    }
}

// Reensambla el archivo, verifica el checksum y lo guarda en disco
fn finalize_udp_assembly<F: Fn(&str)>(assembly: UdpFileAssembly, save_path: &str, log: &F, app_handle: &tauri::AppHandle) {
    let received = assembly.chunks.len() as u32;
    let missing = assembly.total_chunks.saturating_sub(received);

    if missing > 0 {
        log(&format!(
            "⚠ Transferencia incompleta: {}/{} fragmentos ({} faltante(s))",
            received, assembly.total_chunks, missing
        ));
    }

    // Reensamblar en orden por índice de fragmento
    let mut sorted_keys: Vec<u32> = assembly.chunks.keys().cloned().collect();
    sorted_keys.sort();
    let mut file_data: Vec<u8> = Vec::new();
    for key in &sorted_keys {
        file_data.extend_from_slice(&assembly.chunks[key]);
    }

    // Verificar integridad mediante checksum
    let computed = calcular_checksum_bytes(&file_data, &assembly.algo);
    let checksum_valid = computed == assembly.expected_checksum;
    if checksum_valid {
        log(&format!(
            "✓ Checksum válido ({}: {})",
            assembly.algo, computed
        ));
    } else {
        log(&format!(
            "✗ Checksum INVÁLIDO ({}): esperado={} | calculado={}",
            assembly.algo, assembly.expected_checksum, computed
        ));
    }

    // Guardar el archivo en disco
    let file_name = assembly.file_name;
    let file_path = std::path::Path::new(save_path).join(&file_name);
    let file_size = file_data.len() as u64;
    match std::fs::write(&file_path, &file_data) {
        Ok(_) => {
            log(&format!("✓ Archivo '{}' guardado ({} bytes)", file_name, file_size));
            let extension = file_name.rsplit('.').next().unwrap_or("").to_string();
            let full_path = file_path.to_string_lossy().to_string();
            let _ = app_handle.emit("file_received", ReceivedFileEvent {
                name: file_name,
                extension,
                size: file_size,
                checksum_valid,
                path: full_path,
            });
        }
        Err(e) => log(&format!("✗ Error guardando '{}': {}", file_name, e)),
    }
}

#[tauri::command]
fn start_receiver(
    log_state: tauri::State<Mutex<LogState>>,
    stop_flag_state: tauri::State<ReceiverStopFlag>,
    app_handle: tauri::AppHandle,
    save_path: String,
) -> Result<String, String> {
    // Obtener la ruta del log para pasarla al thread
    let log_path = if let Ok(state) = log_state.lock() {
        state.file_path.clone()
    } else {
        return Err("No se pudo acceder al estado del log".to_string());
    };

    // Escribir log inicial
    write_log(&log_state, &format!("Iniciando receptor en puerto 4000"));
    write_log(&log_state, &format!("Carpeta destino: {}", save_path));

    // Crear flag de parada compartido entre los hilos
    let stop_flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut guard) = stop_flag_state.0.lock() {
        *guard = Some(stop_flag.clone());
    }

    // Lanzar el receptor en un hilo separado para no bloquear la UI
    use std::fs;
    use std::io::BufReader;
    use std::io::Read;
    use std::path::Path;

    // Clonar rutas para el hilo UDP
    let save_path_udp = save_path.clone();
    let log_path_udp = log_path.clone();
    let app_handle_tcp = app_handle.clone();
    let stop_flag_tcp = stop_flag.clone();
    let stop_flag_udp = stop_flag;

    thread::spawn(move || {
        use std::time::Duration;
        // Función auxiliar para escribir logs desde el thread
        let write_thread_log = |message: &str| {
            if let Ok(mut file) = OpenOptions::new().append(true).open(&log_path) {
                let timestamp = Local::now().format("%H:%M:%S");
                let _ = writeln!(file, "[{}] {}", timestamp, message);
            }
        };

        let listener = match TcpListener::bind("0.0.0.0:4000") {
            Ok(l) => l,
            Err(e) => {
                write_thread_log(&format!("✗ No se pudo abrir el puerto TCP 4000: {}", e));
                return;
            }
        };
        listener.set_nonblocking(true).ok();
        write_thread_log("✓ Receptor TCP activo, esperando conexiones...");

        loop {
            if stop_flag_tcp.load(Ordering::Relaxed) {
                write_thread_log("Receptor TCP detenido");
                break;
            }
            match listener.accept() {
                Ok((mut s, _addr)) => {
                    s.set_nonblocking(false).ok();
                    s.set_read_timeout(Some(Duration::from_secs(30))).ok();
                    write_thread_log("=== Nueva conexión recibida ===");

                    if !Path::new(&save_path).exists() {
                        if let Err(e) = fs::create_dir_all(&save_path) {
                            write_thread_log(&format!("✗ No se pudo crear el directorio: {}", e));
                            continue;
                        }
                    }

                    loop {
                        if stop_flag_tcp.load(Ordering::Relaxed) { break; }

                        let mut name_len_buf = [0u8; 2];
                        if let Err(e) = s.read_exact(&mut name_len_buf) {
                            if e.kind() == std::io::ErrorKind::UnexpectedEof {
                                break;
                            }
                            write_thread_log(&format!("✗ Error leyendo longitud de nombre: {}", e));
                            break;
                        }
                        let name_len = u16::from_be_bytes(name_len_buf) as usize;
                        let mut name_buf = vec![0u8; name_len];
                        if let Err(e) = s.read_exact(&mut name_buf) {
                            write_thread_log(&format!("✗ Error leyendo nombre de archivo: {}", e));
                            break;
                        }
                        let file_name = match String::from_utf8(name_buf) {
                            Ok(n) => n,
                            Err(e) => {
                                write_thread_log(&format!("✗ Nombre de archivo inválido: {}", e));
                                break;
                            }
                        };

                        write_thread_log(&format!("Recibiendo archivo: {}", file_name));

                        let mut size_buf = [0u8; 8];
                        if let Err(e) = s.read_exact(&mut size_buf) {
                            write_thread_log(&format!("✗ Error leyendo tamaño de archivo: {}", e));
                            break;
                        }
                        let file_size = u64::from_be_bytes(size_buf);
                        let file_path = Path::new(&save_path).join(&file_name);
                        let mut file = match std::fs::File::create(&file_path) {
                            Ok(f) => f,
                            Err(e) => {
                                write_thread_log(&format!("✗ No se pudo crear el archivo: {}", e));
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
                                        write_thread_log(&format!("✗ Error escribiendo archivo: {}", e));
                                        break;
                                    }
                                    bytes_left -= to_read as u64;
                                }
                                Err(e) => {
                                    write_thread_log(&format!("✗ Error leyendo datos de archivo: {}", e));
                                    break;
                                }
                            }
                        }
                        write_thread_log(&format!("✓ Archivo '{}' recibido ({} bytes)", file_name, file_size));
                        let extension = file_name.rsplit('.').next().unwrap_or("").to_string();
                        let full_path = file_path.to_string_lossy().to_string();
                        let _ = app_handle_tcp.emit("file_received", ReceivedFileEvent {
                            name: file_name,
                            extension,
                            size: file_size,
                            checksum_valid: true,
                            path: full_path,
                        });
                    }
                    write_thread_log("=== Conexión cerrada ===");
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(200));
                }
                Err(e) => {
                    write_thread_log(&format!("✗ Error aceptando conexión: {}", e));
                }
            }
        }
    });

    // --- Hilo receptor UDP en puerto 4000 ---
    thread::spawn(move || {
        use std::time::Duration;

        let write_udp_log = |message: &str| {
            if let Ok(mut file) = OpenOptions::new().append(true).open(&log_path_udp) {
                let timestamp = Local::now().format("%H:%M:%S");
                let _ = writeln!(file, "[{}] {}", timestamp, message);
            }
        };

        let socket = match UdpSocket::bind("0.0.0.0:4000") {
            Ok(s) => {
                write_udp_log("✓ Receptor UDP activo en puerto 4000");
                s
            }
            Err(e) => {
                write_udp_log(&format!("✗ No se pudo iniciar receptor UDP: {}", e));
                return;
            }
        };
        socket.set_read_timeout(Some(Duration::from_secs(2))).ok();

        if let Err(e) = std::fs::create_dir_all(&save_path_udp) {
            write_udp_log(&format!("✗ No se pudo crear carpeta destino: {}", e));
            return;
        }

        let mut current_assembly: Option<UdpFileAssembly> = None;
        let mut recv_buf = vec![0u8; 65535];

        loop {
            if stop_flag_udp.load(Ordering::Relaxed) {
                if let Some(assembly) = current_assembly.take() {
                    finalize_udp_assembly(assembly, &save_path_udp, &write_udp_log, &app_handle);
                }
                write_udp_log("Receptor UDP detenido");
                break;
            }
            match socket.recv_from(&mut recv_buf) {
                Ok((size, _src)) => {
                    if size == 0 {
                        continue;
                    }
                    let packet = &recv_buf[..size];

                    match packet[0] {
                        // --- Datagrama de metadatos 0x01 ---
                        // [algo_len:u8][algo][ck_len:u8][checksum][name_len:u16][name][total_size:u64][total_chunks:u32]
                        0x01 => {
                            // Finalizar transferencia previa si estaba en curso
                            if let Some(prev) = current_assembly.take() {
                                write_udp_log(&format!(
                                    "⚠ Nueva sesión recibida, finalizando '{}' incompleto",
                                    prev.file_name
                                ));
                                finalize_udp_assembly(prev, &save_path_udp, &write_udp_log, &app_handle);
                            }

                            let mut pos = 1usize;

                            if pos >= size { write_udp_log("✗ Metadato 0x01 malformado"); continue; }
                            let algo_len = packet[pos] as usize;
                            pos += 1;
                            if pos + algo_len > size { write_udp_log("✗ Metadato 0x01 malformado (algo)"); continue; }
                            let algo = match String::from_utf8(packet[pos..pos + algo_len].to_vec()) {
                                Ok(s) => s,
                                Err(_) => { write_udp_log("✗ Algoritmo inválido en metadatos"); continue; }
                            };
                            pos += algo_len;

                            if pos >= size { write_udp_log("✗ Metadato 0x01 malformado"); continue; }
                            let ck_len = packet[pos] as usize;
                            pos += 1;
                            if pos + ck_len > size { write_udp_log("✗ Metadato 0x01 malformado (checksum)"); continue; }
                            let expected_checksum = match String::from_utf8(packet[pos..pos + ck_len].to_vec()) {
                                Ok(s) => s,
                                Err(_) => { write_udp_log("✗ Checksum inválido en metadatos"); continue; }
                            };
                            pos += ck_len;

                            if pos + 2 > size { write_udp_log("✗ Metadato 0x01 malformado (nombre)"); continue; }
                            let name_len = u16::from_be_bytes([packet[pos], packet[pos + 1]]) as usize;
                            pos += 2;
                            if pos + name_len > size { write_udp_log("✗ Metadato 0x01 malformado (nombre len)"); continue; }
                            let file_name = match String::from_utf8(packet[pos..pos + name_len].to_vec()) {
                                Ok(s) => s,
                                Err(_) => { write_udp_log("✗ Nombre de archivo inválido"); continue; }
                            };
                            pos += name_len;

                            if pos + 12 > size { write_udp_log("✗ Metadato 0x01 malformado (tamaño/chunks)"); continue; }
                            let total_size = {
                                let mut arr = [0u8; 8];
                                arr.copy_from_slice(&packet[pos..pos + 8]);
                                u64::from_be_bytes(arr)
                            };
                            pos += 8;
                            let total_chunks = {
                                let mut arr = [0u8; 4];
                                arr.copy_from_slice(&packet[pos..pos + 4]);
                                u32::from_be_bytes(arr)
                            };

                            write_udp_log(&format!("=== Recibiendo archivo UDP: {} ===", file_name));
                            write_udp_log(&format!(
                                "   Algoritmo: {} | Tamaño: {} bytes | Fragmentos esperados: {}",
                                algo, total_size, total_chunks
                            ));
                            write_udp_log(&format!("   Checksum esperado: {}", expected_checksum));

                            current_assembly = Some(UdpFileAssembly {
                                algo,
                                expected_checksum,
                                file_name,
                                total_chunks,
                                chunks: HashMap::new(),
                            });
                        }

                        // --- Datagrama de fragmento 0x02 ---
                        // [chunk_idx:u32][datos]
                        0x02 => {
                            if size < 5 {
                                continue;
                            }
                            let chunk_idx = {
                                let mut arr = [0u8; 4];
                                arr.copy_from_slice(&packet[1..5]);
                                u32::from_be_bytes(arr)
                            };
                            let data = packet[5..].to_vec();

                            if let Some(ref mut assembly) = current_assembly {
                                // or_insert ignora fragmentos duplicados
                                assembly.chunks.entry(chunk_idx).or_insert(data);
                                let received = assembly.chunks.len() as u32;
                                if received >= assembly.total_chunks {
                                    let assembly = current_assembly.take().unwrap();
                                    write_udp_log(&format!(
                                        "✓ Todos los fragmentos recibidos ({}/{})",
                                        received, assembly.total_chunks
                                    ));
                                    finalize_udp_assembly(assembly, &save_path_udp, &write_udp_log, &app_handle);
                                }
                            } else {
                                write_udp_log("⚠ Fragmento recibido sin metadatos previos, descartado");
                            }
                        }

                        _ => {}
                    }
                }

                // Timeout: si hay una transferencia incompleta, finalizarla
                Err(e)
                    if e.kind() == std::io::ErrorKind::WouldBlock
                        || e.kind() == std::io::ErrorKind::TimedOut =>
                {
                    if let Some(assembly) = current_assembly.take() {
                        write_udp_log(&format!(
                            "⚠ Timeout: '{}' incompleto ({}/{} fragmentos recibidos)",
                            assembly.file_name,
                            assembly.chunks.len(),
                            assembly.total_chunks
                        ));
                        finalize_udp_assembly(assembly, &save_path_udp, &write_udp_log, &app_handle);
                    }
                }

                Err(e) => {
                    write_udp_log(&format!("✗ Error en receptor UDP: {}", e));
                }
            }
        }
    });

    Ok("Receptor iniciado (TCP y UDP) en puerto 4000".to_string())
}

// Estructura para los argumentos que vienen del frontend
use serde::Deserialize;

#[derive(Deserialize)]
struct FileArg {
    name: String,
    base64Content: String,
    checksum: String,
}

#[derive(Deserialize)]
#[allow(non_snake_case)]
struct TransferArgs {
    ip: String,
    protocol: String,
    algoritmoChecksum: String,
    mtu: u32,
    simularPerdida: bool,
    simularCorrupcion: bool,
    files: Vec<FileArg>,
}

#[tauri::command]
async fn start_transfer(
    log_state: tauri::State<'_, Mutex<LogState>>,
    args: TransferArgs,
) -> Result<String, String> {
    // Registrar inicio de transferencia
    write_log(
        &log_state,
        &format!("Iniciando transferencia a {}:{}", args.ip, 4000),
    );
    write_log(&log_state, &format!("Protocolo: {}", args.protocol));
    write_log(
        &log_state,
        &format!("Archivos a enviar: {}", args.files.len()),
    );

    // Debug: mostrar los argumentos recibidos
    println!("[DEBUG] start_transfer llamado con:");
    println!("  ip: {}", args.ip);
    println!("  protocol: {}", args.protocol);
    println!("  files: [");
    for f in &args.files {
        println!("    {} ({} bytes base64)", f.name, f.base64Content.len());
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
        write_log(
            &log_state,
            &format!("Intentando establecer conexión TCP a {}...", addr),
        );

        let mut stream = match TcpStream::connect_timeout(
            // Try/catch para manejar la conexión TCP
            &addr.parse::<std::net::SocketAddr>().map_err(|e| {
                let error_msg = format!("Dirección inválida {}: {}", addr, e);
                write_log(&log_state, &format!("✗ {}", error_msg));
                println!("[DEBUG] {}", error_msg);
                error_msg
            })?, // Parsear la dirección IP y puerto a SocketAddr, es lo que espera TcpStream, si falla logea el eeror
            Duration::from_secs(10), // Este es el tiempo de espera del connection_timeout
        ) {
            Ok(s) => s, // Si esta OK, devuelve el stream, es decir la conexión fue exitosa
            Err(e) => {
                // Sino, logea el error, la conexión falló
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
            println!(
                "[DEBUG] Procesando archivo: {} ({} bytes base64)",
                file.name,
                file.base64Content.len()
            );
            write_log(&log_state, &format!("Enviando archivo: {}", file.name));

            let file_bytes = match base64::decode(&file.base64Content) {
                Ok(b) => {
                    println!("[DEBUG] Archivo decodificado: {} bytes reales", b.len());
                    b.to_vec()
                }
                Err(e) => {
                    let error_msg = format!("No se pudo decodificar el archivo base64: {}", e);
                    write_log(&log_state, &format!("✗ {}", error_msg));
                    println!("[DEBUG] {}", error_msg);
                    return Err(error_msg);
                }
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

            println!(
                "[DEBUG] Enviando datos del archivo ({} bytes)...",
                file_bytes.len()
            );
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

            write_log(
                &log_state,
                &format!(
                    "✓ Archivo '{}' enviado ({} bytes)",
                    file.name,
                    file_bytes.len()
                ),
            );
            println!(
                "[DEBUG] Archivo '{}' enviado exitosamente ({} bytes)",
                file.name,
                file_bytes.len()
            );
        }

        let success_msg = format!(
            "{} archivo(s) enviados correctamente a {}",
            args.files.len(),
            addr
        );
        write_log(&log_state, &format!("✓ {}", success_msg));
        Ok(success_msg)
    } else if args.protocol.to_uppercase() == "UDP" {
        // Crear y conectar el socket UDP
        let socket = match UdpSocket::bind("0.0.0.0:0") {
            Ok(s) => s,
            Err(e) => {
                let error_msg = format!("Error al crear el socket UDP: {}", e);
                write_log(&log_state, &format!("✗ {}", error_msg));
                return Err(error_msg);
            }
        };
        if let Err(e) = socket.connect(&addr) {
            let error_msg = format!("No se pudo conectar al destino UDP {}: {}", addr, e);
            write_log(&log_state, &format!("✗ {}", error_msg));
            return Err(error_msg);
        }

        // Tamaño útil de datos por fragmento:
        // MTU - 20 (header IP) - 8 (header UDP) - 5 (header app: tipo(1) + índice(4))
        let chunk_payload_size = (args.mtu as usize).saturating_sub(33);
        if chunk_payload_size == 0 {
            return Err("MTU demasiado pequeño para fragmentar".to_string());
        }

        println!("[DEBUG] UDP listo. MTU={}, chunk_payload={} bytes", args.mtu, chunk_payload_size);
        write_log(&log_state, &format!("UDP: MTU={} bytes, payload por fragmento={} bytes", args.mtu, chunk_payload_size));

        for file in &args.files {
            write_log(&log_state, &format!("Enviando archivo: {}", file.name));

            let file_bytes = match base64::decode(&file.base64Content) {
                Ok(b) => b,
                Err(e) => {
                    let error_msg = format!("No se pudo decodificar el archivo base64: {}", e);
                    write_log(&log_state, &format!("✗ {}", error_msg));
                    return Err(error_msg);
                }
            };

            let total_chunks = ((file_bytes.len() + chunk_payload_size - 1) / chunk_payload_size).max(1) as u32;
            let algo_bytes = args.algoritmoChecksum.as_bytes();
            let checksum_bytes = file.checksum.as_bytes();
            let name_bytes = file.name.as_bytes();

            if name_bytes.len() > u16::MAX as usize {
                return Err("Nombre de archivo demasiado largo".to_string());
            }

            // --- Datagrama 0x01: Metadatos ---
            // [0x01][algo_len:u8][algo][checksum_len:u8][checksum][name_len:u16][name][total_size:u64][total_chunks:u32]
            let mut meta_packet: Vec<u8> = Vec::new();
            meta_packet.push(0x01u8);
            meta_packet.push(algo_bytes.len() as u8);
            meta_packet.extend_from_slice(algo_bytes);
            meta_packet.push(checksum_bytes.len() as u8);
            meta_packet.extend_from_slice(checksum_bytes);
            meta_packet.extend_from_slice(&(name_bytes.len() as u16).to_be_bytes());
            meta_packet.extend_from_slice(name_bytes);
            meta_packet.extend_from_slice(&(file_bytes.len() as u64).to_be_bytes());
            meta_packet.extend_from_slice(&total_chunks.to_be_bytes());

            socket.send(&meta_packet).map_err(|e| {
                let msg = format!("Error enviando metadatos de '{}': {}", file.name, e);
                write_log(&log_state, &format!("✗ {}", msg));
                msg
            })?;

            println!("[DEBUG] Metadatos enviados para '{}': {} fragmentos", file.name, total_chunks);
            write_log(&log_state, &format!("Metadatos enviados: {} fragmento(s) a enviar", total_chunks));

            // --- Datagramas 0x02: Fragmentos del archivo ---
            // [0x02][chunk_idx:u32][datos]
            let mut rng = rand::thread_rng();
            let mut perdidos = 0u32;
            let mut corrompidos = 0u32;

            for (chunk_idx, chunk) in file_bytes.chunks(chunk_payload_size).enumerate() {
                // Simulación: pérdida de paquete (25% de probabilidad)
                if args.simularPerdida && rng.gen::<f32>() < 0.25 {
                    perdidos += 1;
                    write_log(&log_state, &format!("⚠ [SIM] Fragmento {} descartado (pérdida simulada)", chunk_idx));
                    continue;
                }

                // Transmisor (fragmentación y secuenciación en UDP)
                let mut data_packet: Vec<u8> = Vec::new();
                data_packet.push(0x02u8); // Indicador de "Datagrama de datos"
                data_packet.extend_from_slice(&(chunk_idx as u32).to_be_bytes()); // Número de secuencia
                data_packet.extend_from_slice(chunk); // Bytes del archivo

                // Simulación: corrupción de datos (20% de probabilidad)
                if args.simularCorrupcion && rng.gen::<f32>() < 0.20 {
                    // Flipear un byte en el payload (offset 5 para no tocar el header)
                    let payload_start = 5;
                    if data_packet.len() > payload_start {
                        let byte_idx = payload_start + rng.gen_range(0..data_packet.len() - payload_start);
                        data_packet[byte_idx] ^= 0xFF;
                        corrompidos += 1;
                        write_log(&log_state, &format!("⚠ [SIM] Fragmento {} corrompido en byte {} (corrupción simulada)", chunk_idx, byte_idx));
                    }
                }

                socket.send(&data_packet).map_err(|e| {
                    let msg = format!("Error enviando fragmento {} de '{}': {}", chunk_idx, file.name, e);
                    write_log(&log_state, &format!("✗ {}", msg));
                    msg
                })?;

                // Pausa entre fragmentos para no desbordar el buffer de recepción UDP del receptor
                std::thread::sleep(std::time::Duration::from_millis(1));
            }

            if args.simularPerdida || args.simularCorrupcion {
                write_log(&log_state, &format!("⚠ [SIM] Resumen: {} fragmento(s) perdido(s), {} fragmento(s) corrompido(s)", perdidos, corrompidos));
            }

            println!("[DEBUG] Archivo '{}' enviado en {} fragmento(s) ({} bytes)", file.name, total_chunks, file_bytes.len());
            write_log(&log_state, &format!("✓ Archivo '{}' enviado en {} fragmento(s) ({} bytes)", file.name, total_chunks, file_bytes.len()));
        }

        let success_msg = format!(
            "{} archivo(s) enviados correctamente a {} por UDP",
            args.files.len(),
            addr
        );
        write_log(&log_state, &format!("✓ {}", success_msg));
        Ok(success_msg)
    } else {
        let error_msg = format!("Protocolo no soportado: {}", args.protocol);
        write_log(&log_state, &format!("✗ {}", error_msg));
        Err(error_msg)
    }
}
#[tauri::command]
fn stop_receiver(
    log_state: tauri::State<Mutex<LogState>>,
    stop_flag_state: tauri::State<ReceiverStopFlag>,
) -> Result<String, String> {
    if let Ok(mut guard) = stop_flag_state.0.lock() {
        if let Some(flag) = guard.take() {
            flag.store(true, Ordering::Relaxed);
            write_log(&log_state, "Receptor detenido por el usuario");
            return Ok("Receptor detenido".to_string());
        }
    }
    Err("No hay receptor activo".to_string())
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
fn write_log_entry(
    log_state: tauri::State<Mutex<LogState>>,
    message: String,
) -> Result<(), String> {
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
        }
        Err(e) => {
            let error_msg = format!("Error: {:?}", e);
            write_log(&log_state, &format!("✗ Error en ping: {}", e));
            Err(error_msg)
        }
    }
}

// Función para calcular el hash MD5 de un archivo
fn calcular_md5(file_path: &str) -> Result<String, String> {
    use std::fs::File;
    use std::io::{BufReader, Read};
    println!("[DEBUG] start_transfer llamado con: {}", file_path);
    let file = File::open(file_path).map_err(|e| format!("Error abriendo archivo: {}", e))?;
    let mut reader = BufReader::new(file);
    let mut buffer = Vec::new();
    reader
        .read_to_end(&mut buffer)
        .map_err(|e| format!("Error leyendo archivo: {}", e))?;
    let digest = md5::compute(buffer);
    Ok(format!("{:x}", digest))
}

// Función para calcular el hash SHA-256 de un archivo
fn calcular_sha256(file_path: &str) -> Result<String, String> {
    use std::fs::File;
    use std::io::{BufReader, Read};

    let file = File::open(file_path).map_err(|e| format!("Error abriendo archivo: {}", e))?;
    let mut reader = BufReader::new(file);
    let mut buffer = Vec::new();
    reader
        .read_to_end(&mut buffer)
        .map_err(|e| format!("Error leyendo archivo: {}", e))?;
    let mut hasher = Sha256::new();
    hasher.update(buffer);
    let result = hasher.finalize();
    Ok(format!("{:x}", result))
}

// Función para calcular el hash SHA-3 de un archivo
fn calcular_sha3_256(file_path: &str) -> Result<String, String> {
    use std::fs::File;
    use std::io::{BufReader, Read};

    let file = File::open(file_path).map_err(|e| format!("Error abriendo archivo: {}", e))?;
    let mut reader = BufReader::new(file);
    let mut buffer = Vec::new();
    reader
        .read_to_end(&mut buffer)
        .map_err(|e| format!("Error leyendo archivo: {}", e))?;
    let mut hasher = Sha3_256::new();
    hasher.update(buffer);
    let result = hasher.finalize();
    Ok(format!("{:x}", result))
}

// Función para calcular el hash CRC32 de un archivo
fn calcular_crc32(file_path: &str) -> Result<String, String> {
    use crc32fast::Hasher;
    use std::fs::File;
    use std::io::{BufReader, Read};

    let file = File::open(file_path).map_err(|e| format!("Error abriendo archivo: {}", e))?;
    let mut reader = BufReader::new(file);
    let mut buffer = Vec::new();
    reader
        .read_to_end(&mut buffer)
        .map_err(|e| format!("Error leyendo archivo: {}", e))?;
    let mut hasher = Hasher::new();
    hasher.update(&buffer);
    let checksum = hasher.finalize();
    Ok(format!("{:x}", checksum))
}

#[tauri::command]
fn calcular_checksum(filePath: String, algoritmo: String) -> Result<String, String> {
    match algoritmo.as_str() {
        "MD5" => calcular_md5(&filePath),
        "SHA-256" => calcular_sha256(&filePath),
        "SHA3-256" => calcular_sha3_256(&filePath),
        "CRC32" => calcular_crc32(&filePath),
        _ => Err("Algoritmo no soportado".to_string()),
    }
}
fn main() {
    let log_state = Mutex::new(LogState::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(log_state)
        .manage(ReceiverStopFlag(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            start_transfer,
            get_local_ip,
            ping_ip,
            start_receiver,
            stop_receiver,
            write_log_entry,
            read_logs,
            get_log_file_path,
            calcular_checksum
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

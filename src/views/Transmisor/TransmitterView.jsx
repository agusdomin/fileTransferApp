import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import FormularioTransmisor from "./formulario/FormularioTransmisor";
import PanelArchivos from "./PanelArchivos";
import LogTransmisor from "./LogTransmisor";
    
function TransmitterView({ onBack }) {
    const [ip, setIp] = useState("");
    const [protocol, setProtocol] = useState("TCP");
    const [files, setFiles] = useState([]);
    const [log, setLog] = useState("");
    const [pingExitoso, setPingExitoso] = useState(null);
    const [logFilePath, setLogFilePath] = useState("");
    const [isTestingPing, setIsTestingPing] = useState(false);
    const [isTransferring, setIsTransferring] = useState(false);
    const [transferProgress, setTransferProgress] = useState(0);
    const [currentFileIndex, setCurrentFileIndex] = useState(0);
    const [transferComplete, setTransferComplete] = useState(false);
    const [transferHadErrors, setTransferHadErrors] = useState(false);

    // Obtener la ruta del archivo de log al cargar
    useEffect(() => {
        invoke("get_log_file_path")
            .then(path => setLogFilePath(path))
            .catch(err => console.error("Error obteniendo ruta de log:", err));
    }, []);

    // Leer logs automáticamente cada 2 segundos
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const logs = await invoke("read_logs");
                setLog(logs);
            } catch (err) {
                console.error("Error leyendo logs:", err);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, []);

    const testPing = async (ip) => { 
        setPingExitoso(null);
        setIsTestingPing(true);
        try {
            const result = await invoke("ping_ip", { ip });
            setPingExitoso(true);
            // Los logs se actualizarán automáticamente desde el archivo
        } catch (err) { 
            setPingExitoso(false);
            // Los logs se actualizarán automáticamente desde el archivo
        } finally {
            setIsTestingPing(false);
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files).map((file, index) => ({
                id: Date.now() + index,
                file: file,
                name: file.name,
                size: formatFileSize(file.size),
                path: file.path || file.name,
                loading: false
            }));
            setFiles([...files, ...newFiles]);
        }
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    const closeTransferPanel = () => {
        setTransferComplete(false);
        setTransferHadErrors(false);
        setTransferProgress(0);
        setCurrentFileIndex(0);
    };

    // Función auxiliar para convertir archivo a base64
    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                // Eliminar el prefijo "data:*/*;base64,"
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    };

    const handleStartTransfer = async () => {
        if (files.length === 0) {
            await invoke("write_log_entry", { 
                message: "✗ Error: No hay archivos seleccionados para transferir" 
            });
            return;
        }
        
        if (!ip) {
            await invoke("write_log_entry", { 
                message: "✗ Error: No se ha especificado una IP de destino" 
            });
            return;
        }

        setIsTransferring(true);
        setTransferProgress(0);
        setCurrentFileIndex(0);
        setTransferComplete(false);
        setTransferHadErrors(false);

        try {
            // Log inicial
            await invoke("write_log_entry", { 
                message: `\n${'='.repeat(60)}\n🚀 INICIANDO TRANSFERENCIA\n${'='.repeat(60)}` 
            });
            await invoke("write_log_entry", { 
                message: `📊 Cantidad de archivos: ${files.length}` 
            });
            await invoke("write_log_entry", { 
                message: `🎯 IP destino: ${ip}` 
            });
            await invoke("write_log_entry", { 
                message: `🔌 Protocolo: ${protocol}` 
            });
            await invoke("write_log_entry", { 
                message: `${'='.repeat(60)}\n` 
            });

            const filePaths = files.map((fileObj) => fileObj.path);
            
            // Transferir archivos uno por uno para mejor seguimiento
            let successCount = 0;
            let failCount = 0;
            
            for (let i = 0; i < files.length; i++) {
                setCurrentFileIndex(i);
                const fileObj = files[i];
                const fileName = fileObj.name;
                
                try {
                    await invoke("write_log_entry", { 
                        message: `📤 [${i + 1}/${files.length}] Transfiriendo: ${fileName}` 
                    });
                    
                    // Convertir el archivo a base64
                    const base64Content = await fileToBase64(fileObj.file);
                    
                    await invoke("start_transfer", {
                        args: {
                            ip,
                            protocol,
                            files: [{
                                name: fileName,
                                content_base64: base64Content
                            }]
                        }
                    });
                    
                    await invoke("write_log_entry", { 
                        message: `✓ [${i + 1}/${files.length}] Transferido exitosamente: ${fileName}` 
                    });
                    successCount++;
                } catch (fileError) {
                    await invoke("write_log_entry", { 
                        message: `✗ [${i + 1}/${files.length}] Error al transferir ${fileName}: ${fileError}` 
                    });
                    failCount++;
                }
                
                // Actualizar progreso
                setTransferProgress(((i + 1) / files.length) * 100);
            }
            
            // Log final
            await invoke("write_log_entry", { 
                message: `\n${'='.repeat(60)}\n📋 RESUMEN DE TRANSFERENCIA\n${'='.repeat(60)}` 
            });
            await invoke("write_log_entry", { 
                message: `✓ Archivos exitosos: ${successCount}` 
            });
            if (failCount > 0) {
                await invoke("write_log_entry", { 
                    message: `✗ Archivos fallidos: ${failCount}` 
                });
                setTransferHadErrors(true);
            }
            await invoke("write_log_entry", { 
                message: `${'='.repeat(60)}\n` 
            });
            
        } catch (error) {
            await invoke("write_log_entry", { 
                message: `✗ Error crítico en la transferencia: ${error}` 
            });
            await invoke("write_log_entry", { 
                message: `✗ No se pudo completar el envío de archivos` 
            });
            setTransferHadErrors(true);
        } finally {
            setIsTransferring(false);
            setTransferComplete(true);
        }
    };

    return (
        <div className="flex flex-col justify-center">
            <div className="flex flex-row items-center gap-4 mb-6"> 
                <div className="flex-1 flex justify-start">
                    <button
                        className="cursor-pointer scale-100 transition-transform duration-200 hover:scale-120"
                        onClick={onBack}
                    >
                        <svg fill="#ffffff" height="24" width="24" viewBox="0 0 1024 1024"><g id="SVGRepo_bgCarrier" strokeWidth="0"></g><g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M222.927 580.115l301.354 328.512c24.354 28.708 20.825 71.724-7.883 96.078s-71.724 20.825-96.078-7.883L19.576 559.963a67.846 67.846 0 01-13.784-20.022 68.03 68.03 0 01-5.977-29.488l.001-.063a68.343 68.343 0 017.265-29.134 68.28 68.28 0 011.384-2.6 67.59 67.59 0 0110.102-13.687L429.966 21.113c25.592-27.611 68.721-29.247 96.331-3.656s29.247 68.721 3.656 96.331L224.088 443.784h730.46c37.647 0 68.166 30.519 68.166 68.166s-30.519 68.166-68.166 68.166H222.927z"></path></g></svg>
                    </button>
                </div>
                <div className="flex-2 flex justify-center">
                    <h2 className="text-center text-2xl font-bold">Nodo transmisor</h2>
                </div>
                <div className="flex-1 flex justify-end">
                    {logFilePath && (
                        <span className="text-xs text-gray-400">Log: {logFilePath}</span>
                    )}
                </div>
            </div>
            
            {/* Paneles superiores: Formulario y Archivos */}
            <div className="flex flex-row gap-4 mb-4 relative">
                <FormularioTransmisor
                    ip={ip}
                    setIp={setIp}
                    protocol={protocol}
                    setProtocol={setProtocol}
                    files={files}
                    setFiles={setFiles}
                    testPing={testPing}
                    pingExitoso={pingExitoso}
                    isTestingPing={isTestingPing}
                    isTransferring={isTransferring}
                    handleFileChange={handleFileChange}
                    handleStartTransfer={handleStartTransfer}
                    log={log}
                    setLog={setLog}
                />
                <PanelArchivos 
                    files={files}
                    setFiles={setFiles}
                />
                
                {/* Barra de progreso global - Overlay */}
                {(isTransferring || transferComplete) && (
                    <div 
                        className="absolute inset-0 flex items-center justify-center"
                        style={{
                            backgroundColor: "rgba(0, 0, 0, 0.85)",
                            backdropFilter: "blur(4px)",
                            zIndex: 50,
                            borderRadius: "1rem"
                        }}
                    >
                        <div 
                            className="border-2 p-6 rounded-2xl border-white bg-gray-900 bg-opacity-95"
                            style={{
                                boxShadow: "0 20px 60px 0 rgba(0,0,0,0.9), 0 2px 0 0 rgba(255,255,255,0.15) inset",
                                maxWidth: "500px",
                                width: "80%"
                            }}
                        >
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-base font-semibold text-white">
                                    {isTransferring ? (
                                        <>📤 Transfiriendo archivo {currentFileIndex + 1} de {files.length}</>
                                    ) : transferHadErrors ? (
                                        <>⚠️ Transferencia completada con errores</>
                                    ) : (
                                        <>✅ Transferencia completada exitosamente</>
                                    )}
                                </span>
                                {isTransferring && (
                                    <span className="text-base font-semibold text-blue-400">
                                        {Math.round(transferProgress)}%
                                    </span>
                                )}
                            </div>
                            {isTransferring && (
                                <>
                                    <div className="w-full bg-gray-700 rounded-full h-6 overflow-hidden shadow-inner">
                                        <div 
                                            className="bg-gradient-to-r from-blue-500 to-blue-600 h-6 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg"
                                            style={{ width: `${transferProgress}%` }}
                                        >
                                            {transferProgress > 5 && (
                                                <span className="text-sm text-white font-bold">
                                                    {Math.round(transferProgress)}%
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-3 text-sm text-gray-300 text-center font-medium">
                                        {files[currentFileIndex]?.name || 'Procesando...'}
                                    </div>
                                </>
                            )}
                            {!isTransferring && transferComplete && (
                                <>
                                    <div className={`mt-3 text-sm text-center font-medium ${
                                        transferHadErrors ? 'text-red-400' : 'text-green-400'
                                    }`}>
                                        {transferHadErrors 
                                            ? 'Algunos archivos no pudieron ser transferidos. Revisa el log para más detalles.'
                                            : 'Todos los archivos se transfirieron correctamente.'
                                        }
                                    </div>
                                    <div className="flex justify-end mt-4">
                                        <button
                                            onClick={closeTransferPanel}
                                            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                                        >
                                            OK
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
            
            {/* Panel inferior: Log */}
            <div className="w-full">
                <LogTransmisor log={log}/>
            </div>
        </div>
    );
}

export default TransmitterView;

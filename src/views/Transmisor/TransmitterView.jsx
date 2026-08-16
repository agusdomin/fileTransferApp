import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from '@tauri-apps/plugin-dialog';
import { stat, readFile } from '@tauri-apps/plugin-fs';

function TransmitterView({ onBack }) {
    const [files, setFiles] = useState([]);
    const [algoritmoChecksum, setAlgoritmoChecksum] = useState("MD5");
    const [log, setLog] = useState("");
    const [pingExitoso, setPingExitoso] = useState(null);
    const [logFilePath, setLogFilePath] = useState("");
    const [isTestingPing, setIsTestingPing] = useState(false);
    const [isTransferring, setIsTransferring] = useState(false);
    const [transferProgress, setTransferProgress] = useState(0);
    const [currentFileIndex, setCurrentFileIndex] = useState(0);
    const [transferComplete, setTransferComplete] = useState(false);
    const [transferHadErrors, setTransferHadErrors] = useState(false);
    const [ip, setIp] = useState("");
    const [protocol, setProtocol] = useState("UDP");
    const [mtu, setMtu] = useState(1500);
    const [uploadProgress, setUploadProgress] = useState({});
    const [isRecalculating, setIsRecalculating] = useState(false);
    const [recalculatingProgress, setRecalculatingProgress] = useState(0);
    const [recalculatingIndex, setRecalculatingIndex] = useState(0);
    const [simularAlteraciones, setSimularAlteraciones] = useState(false);
    const [simularPerdida, setSimularPerdida] = useState(false);
    const [simularCorrupcion, setSimularCorrupcion] = useState(false);
    
    const logEndRef = useRef(null);
    const isFirstRender = useRef(true);

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

    // Auto-scroll del log
    useEffect(() => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [log]);

    // Recalcular checksums cuando cambia el algoritmo
    useEffect(() => {
        // Evitar ejecutar en el primer render
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        // Solo recalcular si hay archivos cargados y el protocolo es UDP
        if (files.length === 0 || protocol !== "UDP") {
            return;
        }

        const recalcularChecksums = async () => {
            setIsRecalculating(true);
            setRecalculatingProgress(0);
            setRecalculatingIndex(0);
            
            const updatedFiles = [];
            
            for (let i = 0; i < files.length; i++) {
                const fileObj = files[i];
                setRecalculatingIndex(i);
                
                try {
                    const newChecksum = await invoke("calcular_checksum", {
                        filePath: fileObj.path,
                        algoritmo: algoritmoChecksum
                    });
                    
                    updatedFiles.push({
                        ...fileObj,
                        checksum: newChecksum
                    });
                } catch (err) {
                    console.error(`Error recalculando checksum para ${fileObj.name}:`, err);
                    updatedFiles.push(fileObj); // Mantener el archivo sin cambios si hay error
                }
                
                setRecalculatingProgress(((i + 1) / files.length) * 100);
            }
            
            setFiles(updatedFiles);
            setIsRecalculating(false);
            setRecalculatingProgress(0);
            setRecalculatingIndex(0);
        };

        recalcularChecksums();
    }, [algoritmoChecksum, protocol]);

    const testPing = async () => { 
        setPingExitoso(null);
        setIsTestingPing(true);
        try {
            const result = await invoke("ping_ip", { ip });
            setPingExitoso(true);
        } catch (err) { 
            setPingExitoso(false);
        } finally {
            setIsTestingPing(false);
        }
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    // Función auxiliar para convertir archivo a base64
    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    };

    const handleAddFiles = async () => {
        const selected = await open({
            multiple: true,
            directory: false
        });
        
        if (selected && selected.length > 0) {
            const newFiles = await Promise.all(selected.map(async (filePath, index) => {
                const fileStats = await stat(filePath);
                const fileContent = await readFile(filePath);
                const base64Content = await fileToBase64(new File([fileContent], filePath.split('\\').pop().split('/').pop()));

                const hash = protocol === "UDP"
                    ? await invoke("calcular_checksum", {
                        filePath: filePath,
                        algoritmo: algoritmoChecksum
                    }).catch(err => {
                        console.error("Error al calcular checksum:", err);
                        return null;
                    })
                    : null;

                const fileName = filePath.split('\\').pop().split('/').pop();

                return {
                    id: Date.now() + index,
                    name: fileName,
                    size: formatFileSize(fileStats.size),
                    base64Content: base64Content,
                    path: filePath,
                    loading: false,
                    checksum: hash
                };
            }));

            setFiles([...files, ...newFiles]);
            
            newFiles.forEach(fileObj => {
                simulateUpload(fileObj.id);
            });
        }
    };

    const simulateUpload = (fileId) => {
        setUploadProgress(prev => ({ ...prev, [fileId]: 0 }));
        
        const interval = setInterval(() => {
            setUploadProgress(prev => {
                const currentProgress = prev[fileId] || 0;
                if (currentProgress >= 100) {
                    clearInterval(interval);
                    return { ...prev, [fileId]: 100 };
                }
                return { ...prev, [fileId]: currentProgress + 10 };
            });
        }, 100);
    };

    const handleRemoveFile = (fileId) => {
        setFiles(files.filter(f => f.id !== fileId));
        setUploadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[fileId];
            return newProgress;
        });
    };

    const closeTransferPanel = () => {
        setTransferComplete(false);
        setTransferHadErrors(false);
        setTransferProgress(0);
        setCurrentFileIndex(0);
    };

    const iniciarTransferencia = async () => {
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
            await invoke("write_log_entry", { 
                message: `\n${'='.repeat(60)}\n🚀 INICIANDO TRANSFERENCIA\n${'='.repeat(60)}` 
            });
            await invoke("write_log_entry", { 
                message: `Cantidad de archivos: ${files.length}` 
            });
            await invoke("write_log_entry", { 
                message: `IP destino: ${ip}` 
            });
            await invoke("write_log_entry", { 
                message: `Protocolo: ${protocol}` 
            });
            await invoke("write_log_entry", { 
                message: `${'='.repeat(60)}\n` 
            });

            let successCount = 0;
            let failCount = 0;
            
            for (let index = 0; index < files.length; index++) {
                const fileObj = files[index];
                setCurrentFileIndex(index);
                const fileName = fileObj.name;
                
                try {
                    await invoke("write_log_entry", { 
                        message: `📤 [${index + 1}/${files.length}] Transfiriendo: ${fileName}` 
                    });
                    
                    await invoke("start_transfer", {
                        args: {
                            ip: ip,
                            protocol: protocol,
                            algoritmoChecksum: algoritmoChecksum,
                            mtu: mtu,
                            simularPerdida: protocol === "UDP" && simularAlteraciones && simularPerdida,
                            simularCorrupcion: protocol === "UDP" && simularAlteraciones && simularCorrupcion,
                            files: [{
                                name: fileName,
                                base64Content: fileObj.base64Content,
                                checksum: fileObj.checksum
                            }]
                        }
                    });
                    
                    await invoke("write_log_entry", { 
                        message: `✓ [${index + 1}/${files.length}] Transferido exitosamente: ${fileName}` 
                    });
                    successCount++;
                } catch (fileError) {
                    await invoke("write_log_entry", { 
                        message: `✗ [${index + 1}/${files.length}] Error al transferir ${fileName}: ${fileError}` 
                    });
                    failCount++;
                }
                
                setTransferProgress(((index + 1) / files.length) * 100);
            }
            
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
        <div className="flex flex-col h-screen w-full px-8 py-4">
            {/* Header */}
            <div className="flex flex-row items-center gap-4 mb-4"> 
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
                <div className="flex-1"></div>
            </div>

            {/* Contenido principal en dos columnas */}
            <div className="flex flex-row gap-4 flex-1 min-h-0 overflow-hidden">
                {/* COLUMNA IZQUIERDA: Configuración + Log */}
                <div className="flex flex-col w-1/2 gap-4 min-h-0">
                    {/* Panel de Configuración */}
                    <div 
                        className="flex flex-col border-2 p-4 rounded-2xl border-white"
                        style={{
                            boxShadow: "0 12px 32px 0 rgba(0,0,0,0.7), 0 1.5px 0 0 rgba(255,255,255,0.08) inset",
                            zIndex: 1,
                        }}
                    >
                        <h3 className="text-lg font-bold mb-3 text-center">Configuración</h3>
                        
                        <div className="flex flex-col mb-3">
                            <label className="block mb-1 text-sm">IP del receptor</label> 
                            <div className="flex gap-2 items-center">
                                <input
                                    type="text"
                                    value={ip}
                                    onChange={e => setIp(e.target.value)}
                                    className="px-3 py-2 border rounded flex-1 text-sm bg-white text-gray-900"
                                    placeholder="Ej: 192.168.1.100"
                                />
                                <button
                                    onClick={testPing}
                                    disabled={isTestingPing || !ip}
                                    className={`px-3 py-2 border-2 rounded transition-colors text-xs ${
                                        isTestingPing || !ip 
                                            ? 'border-gray-500 text-gray-500 bg-gray-700 cursor-not-allowed' 
                                            : 'border-blue-600 text-blue-600 bg-transparent hover:bg-blue-600 hover:text-white'
                                    }`}
                                >
                                    {isTestingPing ? "..." : "Test"}
                                </button>
                                <div
                                    className={`w-5 h-5 rounded-full border-2 ${
                                        pingExitoso === null ? "border-gray-400 bg-gray-200" : 
                                        pingExitoso ? "border-green-600 bg-green-500" : 
                                        "border-red-600 bg-red-500"
                                    }`}
                                    title={pingExitoso === null ? "Sin test" : pingExitoso ? "Ping exitoso" : "Ping fallido"}
                                />
                            </div>
                        </div>
                        
                        <div className="flex flex-col mb-3">
                            <label className="block mb-1 text-sm">Socket</label>
                            <select
                                value={protocol}
                                onChange={e => setProtocol(e.target.value)}
                                className="px-3 py-2 border rounded text-sm bg-white text-gray-900"
                            >
                                <option value="TCP">TCP</option>
                                <option value="UDP">UDP</option>
                            </select>
                        </div>
                        
                        {protocol === "UDP" && (
                            <>
                                <div className="flex flex-col mb-3">
                                    <label className="block mb-1 text-sm">Algoritmo de checksum</label>
                                    <select
                                        value={algoritmoChecksum}
                                        onChange={e => setAlgoritmoChecksum(e.target.value)}
                                        className="px-3 py-2 border rounded text-sm bg-white text-gray-900"
                                        disabled={isRecalculating}
                                    >
                                        <option value="MD5">MD5</option>
                                        <option value="SHA-256">SHA-256</option>
                                        <option value="SHA3-256">SHA3-256</option>
                                        <option value="CRC32">CRC32</option>
                                    </select>
                                </div>
                                <div className="flex flex-col mb-3">
                                    <label className="block mb-1 text-sm">MTU (bytes)</label>
                                    <input
                                        type="number"
                                        value={mtu}
                                        min={100}
                                        max={65535}
                                        onChange={e => setMtu(parseInt(e.target.value) || 1500)}
                                        className="px-3 py-2 border rounded text-sm bg-white text-gray-900"
                                        placeholder="1500"
                                    />
                                    <span className="text-xs text-gray-400 mt-1">Estándar Ethernet: 1500 bytes</span>
                                </div>

                                {/* Sección de simulación de errores */}
                                <div className="border border-yellow-600 rounded-lg p-3 bg-yellow-950 bg-opacity-40">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={simularAlteraciones}
                                            onChange={e => {
                                                setSimularAlteraciones(e.target.checked);
                                                if (!e.target.checked) {
                                                    setSimularPerdida(false);
                                                    setSimularCorrupcion(false);
                                                }
                                            }}
                                            className="w-4 h-4 accent-yellow-400"
                                        />
                                        <span className="text-sm font-semibold text-yellow-400">⚠ Simular alteraciones</span>
                                    </label>

                                    {simularAlteraciones && (
                                        <div className="mt-2 ml-1 flex flex-col gap-2">
                                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={simularPerdida}
                                                    onChange={e => setSimularPerdida(e.target.checked)}
                                                    className="w-4 h-4 accent-orange-400"
                                                />
                                                <span className="text-xs text-orange-300">Pérdida de paquetes <span className="text-gray-400">(~25% por fragmento)</span></span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={simularCorrupcion}
                                                    onChange={e => setSimularCorrupcion(e.target.checked)}
                                                    className="w-4 h-4 accent-red-400"
                                                />
                                                <span className="text-xs text-red-300">Corrupción de datos <span className="text-gray-400">(~20% por fragmento)</span></span>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Panel de Log */}
                    <div 
                        className="flex flex-col border-2 p-4 rounded-2xl border-white flex-1 min-h-0"
                        style={{
                            boxShadow: "0 12px 32px 0 rgba(0,0,0,0.7), 0 1.5px 0 0 rgba(255,255,255,0.08) inset",
                            zIndex: 1,
                        }}
                    >
                        <h3 className="text-lg font-bold mb-3 text-center">Log</h3>
                        <div 
                            className="bg-black text-green-400 font-mono text-xs p-3 rounded-lg overflow-y-auto flex-1"
                        >
                            {!log || log.trim() === "" ? (
                                <div className="text-gray-500">Esperando actividad...</div>
                            ) : (
                                log.split('\n').map((line, index) => (
                                    <div 
                                        key={index} 
                                        className={`mb-1 ${
                                            line.includes('✓') ? 'text-green-400' : 
                                            line.includes('✗') ? 'text-red-400' : 
                                            line.includes('===') ? 'text-cyan-400 font-bold' : 
                                            'text-green-400'
                                        }`}
                                    >
                                        {line}
                                    </div>
                                ))
                            )}
                            <div ref={logEndRef} />
                        </div>
                    </div>
                </div>

                {/* COLUMNA DERECHA: Archivos */}
                <div className="flex flex-col w-1/2 min-h-0">
                    <div 
                        className="flex flex-col border-2 p-4 rounded-2xl border-white h-full min-h-0 relative overflow-hidden"
                        style={{
                            boxShadow: "0 12px 32px 0 rgba(0,0,0,0.7), 0 1.5px 0 0 rgba(255,255,255,0.08) inset",
                            zIndex: 1,
                        }}
                    >
                        <h3 className="text-lg font-bold mb-3 text-center">Archivos</h3>
                        
                        <button 
                            onClick={handleAddFiles}
                            disabled={isRecalculating}
                            className={`px-4 py-2 rounded-lg font-semibold mb-3 transition-colors text-sm ${
                                isRecalculating 
                                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                    : 'bg-gray-700 text-white hover:bg-gray-600'
                            }`}
                        >
                            + Agregar Archivos
                        </button>
                        
                        <div className="overflow-y-auto flex-1 min-h-0 mb-3">
                            {files.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                                    <p>No hay archivos seleccionados</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {files.map((fileObj) => (
                                        <div 
                                            key={fileObj.id}
                                            className="border border-gray-600 rounded-lg p-3 bg-gray-800 bg-opacity-50"
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex-1 mr-2 min-w-0">
                                                    <p className="text-sm font-semibold truncate" title={fileObj.name}>
                                                        {fileObj.name}
                                                    </p>
                                                    <p className="text-xs text-gray-400">
                                                        {fileObj.size}
                                                    </p>
                                                </div>
                                                <button 
                                                    onClick={() => handleRemoveFile(fileObj.id)}
                                                    className="text-red-500 hover:text-red-700 font-bold text-lg leading-none"
                                                    title="Eliminar archivo"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                            
                                            <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                                                <div 
                                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                                    style={{ 
                                                        width: `${uploadProgress[fileObj.id] || 0}%` 
                                                    }}
                                                ></div>
                                            </div>
                                            <div className="flex flex-row justify-between items-center">
                                                {protocol === "UDP" ? (
                                                    <p className="text-xs text-gray-400 mt-1 truncate flex-1" title={fileObj.checksum}>
                                                        {fileObj.checksum || 'N/A'}
                                                    </p>
                                                ) : (
                                                    <p className="text-xs text-gray-500 mt-1 flex-1 italic">
                                                        Checksum gestionado por TCP
                                                    </p>
                                                )}
                                                <p className="text-xs text-gray-400 mt-1 ml-2">
                                                    {uploadProgress[fileObj.id] || 0}%
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Botón Iniciar */}
                        <button 
                            className={`px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center ${
                                isTransferring || files.length === 0 || !ip || isRecalculating
                                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                            onClick={iniciarTransferencia}
                            disabled={isTransferring || files.length === 0 || !ip || isRecalculating}
                        >
                            {isTransferring ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Transfiriendo...
                                </>
                            ) : (
                                'INICIAR'
                            )}
                        </button>

                        {/* Overlay de progreso de transferencia */}
                        {transferComplete && (
                            <div 
                                className="absolute inset-0 flex items-center justify-center rounded-2xl"
                                style={{
                                    backgroundColor: "rgba(0, 0, 0, 0.85)",
                                    backdropFilter: "blur(4px)",
                                    zIndex: 10,
                                }}
                            >
                                <div 
                                    className="border-2 p-6 rounded-2xl border-white bg-gray-900 bg-opacity-95 mx-4 w-full"
                                    style={{
                                        boxShadow: "0 20px 60px 0 rgba(0,0,0,0.9), 0 2px 0 0 rgba(255,255,255,0.15) inset",
                                    }}
                                >
                                    <div className="flex justify-center items-center mb-3">
                                        <span className="text-base font-semibold text-white">
                                            {transferHadErrors ? (
                                                <>⚠️ Transferencia completada con errores</>
                                            ) : (
                                                <>✅ Transferencia completada exitosamente</>
                                            )}
                                        </span>
                                    </div>
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
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Overlay de recálculo de checksums */}
            {isRecalculating && (
                <div 
                    className="fixed inset-0 flex items-center justify-center"
                    style={{
                        backgroundColor: "rgba(0, 0, 0, 0.85)",
                        backdropFilter: "blur(4px)",
                        zIndex: 100,
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
                                🔄 Recalculando checksums
                            </span>
                            <span className="text-base font-semibold text-blue-400">
                                {Math.round(recalculatingProgress)}%
                            </span>
                        </div>
                        
                        <div className="w-full bg-gray-700 rounded-full h-6 overflow-hidden shadow-inner">
                            <div 
                                className="bg-gradient-to-r from-yellow-500 to-yellow-600 h-6 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg"
                                style={{ width: `${recalculatingProgress}%` }}
                            >
                                {recalculatingProgress > 5 && (
                                    <span className="text-sm text-white font-bold">
                                        {Math.round(recalculatingProgress)}%
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        <div className="mt-3 text-sm text-gray-300 text-center font-medium">
                            Procesando archivo {recalculatingIndex + 1} de {files.length}
                        </div>
                        
                        <div className="mt-2 text-xs text-gray-400 text-center">
                            {files[recalculatingIndex]?.name || 'Procesando...'}
                        </div>
                        
                        <div className="mt-3 text-xs text-yellow-400 text-center">
                            Algoritmo: {algoritmoChecksum}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

export default TransmitterView;

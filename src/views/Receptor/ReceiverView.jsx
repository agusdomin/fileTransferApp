import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import React, { useEffect, useState, useRef } from "react";

function ReceiverView({ onBack }) { 

  const [ip, setIp] = useState("");
  const [destinationFolder, setDestinationFolder] = useState("");
  const [protocol, setProtocol] = useState("TCP");
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [log, setLog] = useState("");
  const [pingExitoso, setPingExitoso] = useState(null);
  const [isReceiverActive, setIsReceiverActive] = useState(false);
  const logEndRef = useRef(null);

  async function getIpAndSet() {
    const ip = await invoke("get_local_ip");
    setIp(ip);
  } 
  
  // Llamada en un useEffect:
  useEffect(() => {
    getIpAndSet();
  }, []);

  // Escuchar eventos de archivos recibidos desde el backend
  useEffect(() => {
    let active = true;
    let unlisten = null;
    listen("file_received", (event) => {
      if (!active) return;
      const file = event.payload;
      setReceivedFiles(prev => [...prev, {
        id: Date.now() + Math.random(),
        name: file.name,
        extension: file.extension,
        size: file.size,
        path: file.path,
        status: file.checksum_valid ? "OK" : "ERROR",
        checksumValid: file.checksum_valid,
      }]);
    }).then(fn => {
      if (active) {
        unlisten = fn;
      } else {
        fn(); // efecto ya fue desmontado, desregistrar inmediatamente
      }
    });
    return () => {
      active = false;
      if (unlisten) unlisten();
    };
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

  // Función para seleccionar carpeta destino
  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Seleccionar carpeta de destino"
      });
      
      if (selected) {
        setDestinationFolder(selected);
      }
    } catch (error) {
      console.error("Error al seleccionar carpeta:", error);
    }
  };

  // Verificar si el botón debe estar habilitado
  const isButtonEnabled = ip.trim() !== "" && destinationFolder.trim() !== "";

  const testPing = async (ip) => { 
      try {
          const result = await invoke("ping_ip", { ip });
          setPingExitoso(true);
      } catch (err) { 
          setPingExitoso(false);
      }
  };

  const handleStopReceiver = async () => {
    try {
      await invoke("stop_receiver");
      setIsReceiverActive(false);
    } catch (error) {
      console.error("Error al detener el receptor:", error);
    }
  };

  const handleStartReceiver = async () => {
      try {
        setIsReceiverActive(true);
        const result = await invoke("start_receiver", { savePath: destinationFolder });
        setLog(prevLog => prevLog + `\n✓ ${result}`);
        
        // Simulación: agregar archivo recibido (esto debería venir del backend)
        // TODO: Implementar escucha de eventos desde Rust para agregar archivos
        // setReceivedFiles(prev => [...prev, { 
        //   id: Date.now(), 
        //   name: "ejemplo.txt", 
        //   extension: "txt", 
        //   status: "OK",
        //   checksumValid: true
        // }]);
      } catch (error) {
        setLog(prevLog => prevLog + `\n✗ Error: ${error}`);
        setIsReceiverActive(false);
      }
  };

  // Función para obtener el icono según el estado
  const getStatusIcon = (status, checksumValid) => {
    if (status === "ERROR" || checksumValid === false) {
      return "✗";
    }
    return "✓";
  };

  // Función para obtener el color según el estado
  const getStatusColor = (status, checksumValid) => {
    if (status === "ERROR" || checksumValid === false) {
      return "text-red-500";
    }
    return "text-green-500";
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
                    <h2 className="text-center text-2xl font-bold">Nodo receptor</h2>
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
                            <input
                                type="text"
                                value={ip}
                                disabled
                                className="px-3 py-2 border rounded bg-gray-100 text-gray-700 text-sm"
                                placeholder="Cargando..."
                            /> 
                        </div>
                        
                        <div className="flex flex-col mb-3">
                            <label className="block mb-1 text-sm">Carpeta de destino</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={destinationFolder}
                                    disabled
                                    className="px-3 py-2 border rounded flex-1 bg-gray-100 text-gray-700 text-xs"
                                    placeholder="Seleccionar carpeta..."
                                />
                                <button
                                    onClick={handleSelectFolder}
                                    className="px-3 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                                    title="Seleccionar carpeta"
                                >
                                    📁
                                </button>
                            </div>
                        </div>

                        {isReceiverActive ? (
                            <button
                                className="px-4 py-2 text-white rounded-lg font-semibold transition-all text-sm bg-red-600 hover:bg-red-700 cursor-pointer"
                                onClick={handleStopReceiver}
                            >
                                Desconectar receptor
                            </button>
                        ) : (
                            <button 
                                className={`px-4 py-2 text-white rounded-lg font-semibold transition-all text-sm ${
                                    isButtonEnabled 
                                        ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer' 
                                        : 'bg-gray-400 cursor-not-allowed opacity-50'
                                }`}
                                onClick={handleStartReceiver}
                                disabled={!isButtonEnabled}
                            >
                                Activar receptor
                            </button>
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

                {/* COLUMNA DERECHA: Archivos recibidos */}
                <div className="flex flex-col w-1/2 min-h-0">
                    <div 
                        className="flex flex-col border-2 p-4 rounded-2xl border-white h-full min-h-0"
                        style={{
                            boxShadow: "0 12px 32px 0 rgba(0,0,0,0.7), 0 1.5px 0 0 rgba(255,255,255,0.08) inset",
                            zIndex: 1,
                        }}
                    >
                        <h3 className="text-lg font-bold mb-3 text-center">Archivos recibidos</h3>

                        {receivedFiles.some(f => f.checksumValid) && (
                            <button
                                onClick={() => openPath(destinationFolder).catch(err => console.error("Error abriendo carpeta:", err))}
                                className="px-4 py-2 mb-3 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded-lg transition-colors"
                            >
                                📂 Ver archivos recibidos
                            </button>
                        )}

                        <div className="overflow-y-auto flex-1 min-h-0">
                            {receivedFiles.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                                    <p>No se han recibido archivos aún</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {receivedFiles.map((file) => (
                                        <div 
                                            key={file.id}
                                            onClick={() => file.checksumValid && openPath(file.path).catch(err => console.error("Error abriendo archivo:", err))}
                                            className={`flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700 transition-colors ${
                                                file.checksumValid
                                                    ? 'hover:border-green-500 hover:bg-gray-700 cursor-pointer'
                                                    : 'hover:border-gray-600'
                                            }`}
                                            title={file.checksumValid ? "Abrir archivo" : undefined}
                                        >
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <div className="text-xl">
                                                    📄
                                                </div>
                                                <div className="flex flex-col flex-1 min-w-0">
                                                    <span className="font-semibold truncate text-sm">{file.name}</span>
                                                    <span className="text-xs text-gray-400">.{file.extension}</span>
                                                </div>
                                            </div>
                                            <div className={`flex items-center gap-2 font-bold text-sm ${getStatusColor(file.status, file.checksumValid)}`}>
                                                <span>{getStatusIcon(file.status, file.checksumValid)}</span>
                                                <span>{file.checksumValid === false ? "ERROR" : "OK"}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
  );
}

export default ReceiverView;

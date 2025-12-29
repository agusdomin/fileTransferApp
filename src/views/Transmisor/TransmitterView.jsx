import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import FormularioTransmisor from "./formulario/FormularioTransmisor";
import LogTransmisor from "./LogTransmisor";
    
function TransmitterView({ onBack }) {
    const [ip, setIp] = useState("");
    const [protocol, setProtocol] = useState("TCP");
    const [files, setFiles] = useState([]);
    const [log, setLog] = useState("");
    const [pingExitoso, setPingExitoso] = useState(null);
    const [logFilePath, setLogFilePath] = useState("");

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
        try {
            const result = await invoke("ping_ip", { ip });
            setPingExitoso(true);
            // Los logs se actualizarán automáticamente desde el archivo
        } catch (err) { 
            setPingExitoso(false);
            // Los logs se actualizarán automáticamente desde el archivo
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files) {
        setFiles(Array.from(e.target.files));
        }
    };

    const handleStartTransfer = async () => {
        try {
            const filePaths = files.map((file) => file.path || file.name);
            const result = await invoke("start_transfer", {
                ip,
                protocol,
                files: filePaths,
            });
            // Los logs se actualizarán automáticamente desde el archivo
        } catch (error) {
            // Los logs se actualizarán automáticamente desde el archivo
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
            <div className="flex flex-row gap-4">
            <FormularioTransmisor
                ip={ip}
                setIp={setIp}
                protocol={protocol}
                setProtocol={setProtocol}
                files={files}
                setFiles={setFiles}
                testPing={testPing}
                pingExitoso={pingExitoso}
                handleFileChange={handleFileChange}
                handleStartTransfer={handleStartTransfer}
                log={log}
                setLog={setLog}
            />
            <LogTransmisor log={log}/>
            </div>
        </div>
    );
}

export default TransmitterView;

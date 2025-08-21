import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
    
function TransmitterView({ onBack }) {
    const [ip, setIp] = useState("");
    const [protocol, setProtocol] = useState("TCP");
    const [files, setFiles] = useState([]);
    const [log, setLog] = useState("");
    const [pingExitoso, setPingExitoso] = useState(null);

    const testPing = async (ip) => { 
        try {
            const result = await invoke("ping_ip", { ip });
            setPingExitoso(true);
        } catch (err) { 
            setPingExitoso(false);
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
        setLog(result);
        } catch (error) {
        setLog(`Error: ${error}`);
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
                <div className="flex-1"></div>
            </div>
            <div 
                className="flex flex-col justify-center items-center border-2 p-20 mb-4 mt-4 rounded-2xl border-white mx-auto"
                style={{
                    boxShadow: "0 12px 32px 0 rgba(0,0,0,0.7), 0 1.5px 0 0 rgba(255,255,255,0.08) inset",
                    zIndex: 1,
                }}
            >
                <div className="flex flex-col items-center mb-4">
                    <div className="flex flex-col items-start">
                        <label className="block mb-2 text-lg">IP del receptor</label> 
                        <input
                            type="text"
                            value={ip}
                            onChange={e => setIp(e.target.value)}
                            className="px-4 py-2 border rounded w-64"
                            placeholder="Ej: 192.168.1.100"
                        /> 
                    </div>
                    <div className="flex flex-row items-center justify-start mt-4">
                        <button
                            onClick={() => testPing(ip)}
                            className="signal-icon  flex flex-row items-center ml-2 px-4 py-2 border-2 border-blue-600 text-blue-600 bg-transparent rounded transition-colors duration-200 hover:bg-blue-600 hover:text-white"
                        >
                            Testear nodo
                            <svg height="24" width="24" version="1.1" viewBox="0 0 283.824 283.824" fill="#ffffff">
                            <g>
                                <path style={{ fill: "#ffffff" }} d="M249.798,263.962l-45.067-83.529c3.306-2.759,6.445-5.741,9.391-8.938 c18.069-19.604,27.423-45.071,26.337-71.71c-1.086-26.64-12.481-51.261-32.085-69.33l-5.515-5.083l-62.563,67.879l-31.517-29.049 c0.667-4.301-0.748-8.849-4.182-12.014c-2.5-2.305-5.749-3.574-9.148-3.574c-3.761,0-7.38,1.585-9.928,4.349 c-2.445,2.651-3.711,6.097-3.564,9.701c0.146,3.603,1.688,6.934,4.339,9.377c2.501,2.305,5.75,3.575,9.15,3.575 c1.073,0,2.13-0.143,3.159-0.392l31.525,29.057L67.566,172.16l5.515,5.083c18.485,17.038,42.501,26.421,67.625,26.421 c0.31,0,0.619-0.009,0.928-0.012l-32.54,60.311c-2.529,4.689-2.622,9.653-0.255,13.62c2.367,3.967,6.78,6.242,12.108,6.242h117 c5.328,0,9.741-2.275,12.108-6.242C252.421,273.615,252.328,268.651,249.798,263.962z M94.343,61.1 c0.279-0.302,0.69-0.483,1.101-0.483c0.373,0,0.744,0.145,1.018,0.396c0.161,0.148,0.281,0.332,0.364,0.532 c-0.357,0.269-0.698,0.569-1.012,0.909c-0.309,0.336-0.575,0.694-0.812,1.066c-0.211-0.06-0.41-0.153-0.572-0.303 C93.822,62.657,93.784,61.707,94.343,61.1z M88.985,171.054L203.503,46.807c13.409,14.705,21.148,33.469,21.968,53.589 c0.923,22.636-7.025,44.276-22.379,60.934c-16.01,17.371-38.749,27.334-62.387,27.334 C121.873,188.664,103.773,182.458,88.985,171.054z M123.514,268.824l36.146-66.994c11.588-2.251,22.69-6.536,32.76-12.623 l42.957,79.617H123.514z"></path>
                                {/* barra 1 */}
                                <path className="signal-bar bar1" style={{ fill: "#ffffff" }} d="M80.004,14.973c4.127-0.356,7.184-3.989,6.828-8.116c-0.355-4.127-3.984-7.189-8.116-6.828 c-11.725,1.01-24.291,7.368-32.792,16.593c-8.423,9.138-13.735,22.047-13.864,33.69c-0.046,4.142,3.275,7.537,7.417,7.582 c0.028,0,0.056,0,0.084,0c4.103,0,7.452-3.304,7.497-7.417c0.086-7.843,4.063-17.362,9.894-23.689 C62.839,20.402,72.102,15.654,80.004,14.973z"></path>
                                {/* barra 2 */}
                                <path className="signal-bar bar2" style={{ fill: "#ffffff" }} d="M73.696,42.162c3.327-3.607,8.842-6.587,12.829-6.93c4.127-0.355,7.185-3.988,6.829-8.115 c-0.355-4.126-3.99-7.193-8.115-6.829c-8.835,0.76-17.702,6.427-22.571,11.708c-4.822,5.233-9.732,14.441-9.831,23.216 c-0.047,4.142,3.273,7.537,7.415,7.584c0.029,0,0.057,0,0.086,0c4.102,0,7.451-3.303,7.498-7.416 C67.879,51.487,70.454,45.68,73.696,42.162z"></path>
                            </g>
                            </svg>
                        </button>
                        <div className="ml-4 flex items-center">
                            <div
                                className={`w-6 h-6 rounded-full border-2 ${pingExitoso === null ? "border-gray-400 bg-gray-200" : pingExitoso ? "border-green-600 bg-green-500" : "border-red-600 bg-red-500"}`}
                                    title={pingExitoso === null ? "Sin test" : pingExitoso ? "Ping exitoso" : "Ping fallido"}
                                ></div>
                                <span className={`ml-2 text-lg ${pingExitoso === null ? "text-white" : pingExitoso ? "text-green-600" : "text-red-600"}`}>{pingExitoso === null ? "Sin test" : pingExitoso ? "Ping exitoso" : "Ping fallido"}</span>
                        </div>
                    </div>
                </div>
                <div className="flex-col items-start mb-6">
                    <label className="block mb-2 text-lg">Socket</label>
                    <select
                        value={protocol}
                        onChange={e => setProtocol(e.target.value)}
                        className="px-4 py-2 border rounded w-64"
                    >
                        <option value="TCP">TCP</option>
                        <option value="UDP">UDP</option>
                    </select>
                </div>
                <div className="mb-6">
                    <label className="block mb-2 text-lg">Seleccionar Archivos:</label>
                    <input type="file" multiple onChange={handleFileChange} className="mb-2" />
                    <ul>
                        {files.map((file) => (
                            <li key={file.name}>{file.name}</li>
                        ))}
                    </ul>
                </div>
            </div>    
            <button className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold mb-4" onClick={handleStartTransfer}>Iniciar transferencia</button>
            <p className="text-gray-700 mt-2">{log}</p>
        </div>
    );
}

export default TransmitterView;

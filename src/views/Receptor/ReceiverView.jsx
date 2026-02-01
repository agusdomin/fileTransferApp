import { invoke } from "@tauri-apps/api/core";
import React, { useEffect, useState } from "react";

function ReceiverView({ onBack }) { 

  const [ip, setIp] = useState("");

  async function getIpAndSet() {
    const ip = await invoke("get_local_ip");
    setIp(ip); // setIp es tu useState setter
  } 
  
  // Llamada en un useEffect:
  useEffect(() => {
    getIpAndSet();
  }, []);
  
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

  // const handleFileChange = (e) => {
  //     if (e.target.files) {
  //     setFiles(Array.from(e.target.files));
  //     }
  // };

  const handleStartReceiver = async () => {
      try { 
        const result = await invoke("start_receiver", { savePath: "C:\\Usuarios\\Agustin\\Documentos\\archivosRecibidos" });
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
                    <h2 className="text-center text-2xl font-bold">Nodo receptor</h2>
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
                            disabled
                            className="px-4 py-2 border rounded w-64"
                            placeholder="Ej: 192.168.1.100"
                        /> 
                    </div>
                </div>
                <div className="flex-col items-start mb-6">
                    <label className="block mb-2 text-lg">Socket</label>
                    {/* <select
                        value={protocol}
                        onChange={e => setProtocol(e.target.value)}
                        className="px-4 py-2 border rounded w-64"
                    >
                        <option value="TCP">TCP</option>
                        <option value="UDP">UDP</option>
                    </select> */}
                </div>
                <div className="mb-6">
                    <label className="block mb-2 text-lg">Archivos recibidos:</label>
                    {/* <input type="file" multiple onChange={handleFileChange} className="mb-2" />
                    <ul>
                        {files.map((file) => (
                            <li key={file.name}>{file.name}</li>
                        ))}
                    </ul> */}
                </div>
            </div>    
            <button className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold mb-4" onClick={handleStartReceiver}>Activar receptor</button>
            <p className="text-gray-700 mt-2">{log}</p>
        </div>
  );
}

export default ReceiverView;

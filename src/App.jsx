import { useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [mode, setMode] = useState('tx'); // ó RX
  const [protocol, setProtocol] = useState('tcp'); // ó UDP
  const [files, setFiles] = useState([]);
  const [log, setLog] = useState('');

  // Manejador para el cambio de archivos
  const handleFileChange = (e) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  // Manejador para el inicio de la transferencia
  const handleStartTransfer = async () => {
    try {
      const filePaths = files.map(file => file.path); // Asegúrate de que tu sistema de archivos de Tauri pueda acceder a estas rutas
      const result = await invoke('start_transfer', {
        mode,
        protocol,
        files: filePaths,
      });
      setLog(result);
    } catch (error) {
      setLog(`Error: ${error}`);
    }
  };

  return (
    <div className="container">
      <h1>Tauri File Transfer</h1>
      <p>{log}</p>

      {/* Selector de modo */}
      <div>
        <label>
          <input
            type="radio"
            name="mode"
            value="tx"
            checked={mode === 'tx'}
            onChange={() => setMode('tx')}
          />
          Transmisor (Tx)
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            value="rx"
            checked={mode === 'rx'}
            onChange={() => setMode('rx')}
          />
          Receptor (Rx)
        </label>
      </div>

      {/* Selector de protocolo */}
      <div>
        <label>
          <input
            type="radio"
            name="protocol"
            value="tcp"
            checked={protocol === 'tcp'}
            onChange={() => setProtocol('tcp')}
          />
          TCP
        </label>
        <label>
          <input
            type="radio"
            name="protocol"
            value="udp"
            checked={protocol === 'udp'}
            onChange={() => setProtocol('udp')}
          />
          UDP
        </label>
      </div>

      {/* Subida de archivos */}
      {mode === 'tx' && (
        <div>
          <h3>Seleccionar Archivos</h3>
          <input type="file" multiple onChange={handleFileChange} />
          <ul>
            {files.map((file) => (
              <li key={file.name}>{file.name}</li>
            ))}
          </ul>
        </div>
      )}

      <button onClick={handleStartTransfer}>Iniciar Transferencia</button>
    </div>
  );
}

export default App;
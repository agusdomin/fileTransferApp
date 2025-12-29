
import { useEffect, useState } from "react";
import "./App.css";
import TransmitterView from "./views/Transmisor/TransmitterView";
import ReceiverView from "./views/Receptor/ReceiverView"; 
import {animate} from 'animejs'; 
import BoxSvg from "./components/boxSvg";

function App() {
  const [mode, setMode] = useState(null);

  useEffect(() => {
    if (mode !== null) return; 
    const animation = animate(
      "#paper-plane",
      {
        keyframes: [
          {translateX: 0, translateY: 0, duration: 1000},
          {translateX: 0, translateY: 100, duration: 1500},
          {translateX: 250, translateY: 100, duration: 1500},
          {translateX: 250, translateY: 0, duration: 1000},
        ],
        duration: 2000,
        loop: true, 
    });
    return () => animation.pause(); // Cleanup on unmount
  }, [mode]);

  if (mode === "tx") {
    return <TransmitterView onBack={() => setMode(null)} />;
  }
  if (mode === "rx") {
    return <ReceiverView onBack={() => setMode(null)} />;
  } 
  
  return (
    <>
      <h1 className="text-3xl font-bold mb-8 text-gray-100 drop-shadow-lg">File Transfer App</h1>
      <h1 className="text-2xl font-semibold mb-8 text-gray-100 drop-shadow-lg">Seleccione perfil</h1>
      <div className="flex gap-24 flex-row items-center justify-center relative" style={{ minHeight: "220px" }}>
        {/* Paper plane SVG */}
        <BoxSvg />
        <button
          className="w-48 h-48 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 text-white text-2xl font-semibold rounded-xl shadow-2xl hover:scale-105 transition-transform duration-200 border border-blue-300"
          style={{
            boxShadow: "0 12px 32px 0 rgba(0,0,0,0.7), 0 1.5px 0 0 rgba(255,255,255,0.08) inset",
            zIndex: 1,
          }}
          onClick={() => setMode("tx")}
        >
          Transmisor
          <br /> (Tx)
        </button>
        <button
          className="w-48 h-48 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 text-white text-2xl font-semibold rounded-xl shadow-2xl hover:scale-105 transition-transform duration-200 border border-green-300"
          style={{
            boxShadow: "0 12px 32px 0 rgba(0,0,0,0.7), 0 1.5px 0 0 rgba(255,255,255,0.08) inset",
            zIndex: 1,
          }}
          onClick={() => setMode("rx")}
        >
          Receptor 
          <br /> (Rx)
        </button>
      </div>
    </>
  );
}

export default App;
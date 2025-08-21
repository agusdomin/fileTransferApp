
import { useEffect, useState } from "react";
import "./App.css";
import TransmitterView from "./TransmitterView";
import ReceiverView from "./ReceiverView"; 
import {animate} from 'animejs'; 

function App() {
  const [mode, setMode] = useState(null);

  
  // Animate the paper plane moving from transmitter to receiver
  useEffect(() => {
  
    // Animate the paper plane
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
  }, []);

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
         <svg style={{ position: "absolute", left: "calc(50% - 144px)", top: "140px", zIndex: 0 }}>
          {/* Puedes usar <polyline> para definir múltiples puntos */}
          <polyline
            points="20,0 20,100 270,100 270,0"
            stroke="#ffffffff"
            strokeWidth="4"
            strokeDasharray="12,8"
            fill="none"
          />
          </svg>
          <svg id="paper-plane"
          height="48"
          width="48" 
          viewBox="0 0 512 512"
          fill="#e0e7ef"
          style={{
            position: "absolute",
            left: "calc(50% - 144px)", // Start under Transmitter button
            top: "120px",
            zIndex: 0,
          }}>
            <g>
              <polygon style={{ fill: "#E0B76E" }} points="376.808,187.877 256,512 28.996,384.006 28.996,127.994" />
              <polygon style={{ fill: "#F4CE8F" }} points="256,0 28.996,127.994 256,256 256,512 483.004,384.006 483.004,127.994" />
              <polygon style={{ fill: "#F2CA7F" }} points="256,256 256,512 483.004,384.006 483.004,127.994" />
              <polyline style={{ fill: "#8CC1EA" }} points="174.431,466.018 174.431,210.006 268.189,157.134 268.201,157.134 268.199,157.134 191.405,157.134 191.794,121.013 191.8,121.008 104.201,170.4 104.201,425.526" />
              <polyline style={{ fill: "#79B1D6" }} points="174.431,466.018 174.431,210.006 104.201,170.4 104.201,425.526" />
              <polyline style={{ fill: "#8CC1EA" }} points="331.708,42.166 237.949,95.039 237.937,95.039 237.94,95.039 314.734,95.039 314.345,131.16 314.339,131.164 401.937,81.773" />
              <g>
                <polygon style={{ fill: "#898686" }} points="374.872,292.189 340.931,268.603 305.907,330.967 331.691,316.469 331.691,422.122 349.634,412.002 349.634,306.381" />
                <polygon style={{ fill: "#898686" }} points="370.318,361.73 404.259,385.316 439.283,322.952 413.498,337.45 413.498,231.797 395.555,241.917 395.555,347.54" />
              </g>
            </g>
          </svg>
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
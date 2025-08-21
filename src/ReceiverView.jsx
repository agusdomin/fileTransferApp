import React from "react";

function ReceiverView({ onBack }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-green-50 relative">
      <button className="absolute top-8 left-8 px-4 py-2 bg-gray-300 rounded" onClick={onBack}>&larr; Volver</button>
      <h2 className="text-2xl font-bold mb-6">Modo Receptor</h2>
      {/* Aquí irán los controles para recibir archivos */}
      <p className="text-lg">Esperando archivos...</p>
    </div>
  );
}

export default ReceiverView;

import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
    

export default function FormularioTransmisor({ip,setIp,protocol,setProtocol,files,setFiles,testPing,pingExitoso,isTestingPing,isTransferring,handleFileChange,handleStartTransfer}) {

    return (
        <div 
                className="flex flex-col justify-start items-start border-2 p-4 mb-4 mt-4 rounded-2xl border-white mx-auto"
                style={{
                    boxShadow: "0 12px 32px 0 rgba(0,0,0,0.7), 0 1.5px 0 0 rgba(255,255,255,0.08) inset",
                    zIndex: 1,
                    maxWidth: "30vw",
                    minWidth: "30vw"
                }}
            >
                <div className="flex flex-row">
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
                    <div className="flex flex-col items-center justify-center mt-4">
                        <button
                            onClick={() => testPing(ip)}
                            disabled={isTestingPing || !ip}
                            className={`signal-icon flex flex-row items-center ml-2 px-4 py-2 border-2 rounded transition-colors duration-200 ${
                                isTestingPing || !ip 
                                    ? 'border-gray-500 text-gray-500 bg-gray-700 cursor-not-allowed' 
                                    : 'border-blue-600 text-blue-600 bg-transparent hover:bg-blue-600 hover:text-white'
                            }`}
                        >
                            {isTestingPing ? (
                                <>
                                    <span>Testeando...</span>
                                    <svg className="animate-spin ml-2 h-5 w-5" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                </>
                            ) : (
                                <>
                                    Testear nodo
                                    <svg height="24" width="24" version="1.1" viewBox="0 0 283.824 283.824" fill="currentColor">
                                    <g>
                                        <path d="M249.798,263.962l-45.067-83.529c3.306-2.759,6.445-5.741,9.391-8.938 c18.069-19.604,27.423-45.071,26.337-71.71c-1.086-26.64-12.481-51.261-32.085-69.33l-5.515-5.083l-62.563,67.879l-31.517-29.049 c0.667-4.301-0.748-8.849-4.182-12.014c-2.5-2.305-5.749-3.574-9.148-3.574c-3.761,0-7.38,1.585-9.928,4.349 c-2.445,2.651-3.711,6.097-3.564,9.701c0.146,3.603,1.688,6.934,4.339,9.377c2.501,2.305,5.75,3.575,9.15,3.575 c1.073,0,2.13-0.143,3.159-0.392l31.525,29.057L67.566,172.16l5.515,5.083c18.485,17.038,42.501,26.421,67.625,26.421 c0.31,0,0.619-0.009,0.928-0.012l-32.54,60.311c-2.529,4.689-2.622,9.653-0.255,13.62c2.367,3.967,6.78,6.242,12.108,6.242h117 c5.328,0,9.741-2.275,12.108-6.242C252.421,273.615,252.328,268.651,249.798,263.962z M94.343,61.1 c0.279-0.302,0.69-0.483,1.101-0.483c0.373,0,0.744,0.145,1.018,0.396c0.161,0.148,0.281,0.332,0.364,0.532 c-0.357,0.269-0.698,0.569-1.012,0.909c-0.309,0.336-0.575,0.694-0.812,1.066c-0.211-0.06-0.41-0.153-0.572-0.303 C93.822,62.657,93.784,61.707,94.343,61.1z M88.985,171.054L203.503,46.807c13.409,14.705,21.148,33.469,21.968,53.589 c0.923,22.636-7.025,44.276-22.379,60.934c-16.01,17.371-38.749,27.334-62.387,27.334 C121.873,188.664,103.773,182.458,88.985,171.054z M123.514,268.824l36.146-66.994c11.588-2.251,22.69-6.536,32.76-12.623 l42.957,79.617H123.514z"></path>
                                        <path className="signal-bar bar1" d="M80.004,14.973c4.127-0.356,7.184-3.989,6.828-8.116c-0.355-4.127-3.984-7.189-8.116-6.828 c-11.725,1.01-24.291,7.368-32.792,16.593c-8.423,9.138-13.735,22.047-13.864,33.69c-0.046,4.142,3.275,7.537,7.417,7.582 c0.028,0,0.056,0,0.084,0c4.103,0,7.452-3.304,7.497-7.417c0.086-7.843,4.063-17.362,9.894-23.689 C62.839,20.402,72.102,15.654,80.004,14.973z"></path>
                                        <path className="signal-bar bar2" d="M73.696,42.162c3.327-3.607,8.842-6.587,12.829-6.93c4.127-0.355,7.185-3.988,6.829-8.115 c-0.355-4.126-3.99-7.193-8.115-6.829c-8.835,0.76-17.702,6.427-22.571,11.708c-4.822,5.233-9.732,14.441-9.831,23.216 c-0.047,4.142,3.273,7.537,7.415,7.584c0.029,0,0.057,0,0.086,0c4.102,0,7.451-3.303,7.498-7.416 C67.879,51.487,70.454,45.68,73.696,42.162z"></path>
                                    </g>
                                    </svg>
                                </>
                            )}
                        </button>
                        <div className="ml-4 flex items-center">
                            <div
                                className={`w-6 h-6 rounded-full border-2 ${pingExitoso === null ? "border-gray-400 bg-gray-200" : pingExitoso ? "border-green-600 bg-green-500" : "border-red-600 bg-red-500"}`}
                                title={pingExitoso === null ? "Sin test" : pingExitoso ? "Ping exitoso" : "Ping fallido"}
                            />
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
                <button 
                    className={`px-6 py-3 rounded-lg font-semibold mb-4 transition-colors flex items-center justify-center ${
                        isTransferring || files.length === 0 || !ip
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                    onClick={handleStartTransfer}
                    disabled={isTransferring || files.length === 0 || !ip}
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
                        'Iniciar transferencia'
                    )}
                </button>
            </div> 

    )
    
};

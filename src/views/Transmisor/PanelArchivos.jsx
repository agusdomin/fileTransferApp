import React, { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from '@tauri-apps/plugin-dialog';
import { stat, readFile } from '@tauri-apps/plugin-fs';

export default function PanelArchivos({ files, algoritmoChecksum ,setFiles }) {
    
    const fileInputRef = useRef(null);
    const [uploadProgress, setUploadProgress] = useState({});

    // Función auxiliar para convertir archivo a base64
    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                // Eliminar el prefijo "data:*/*;base64,"
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    };  

    const handleAddFiles = async (e) => {
        const selected = await open({
            multiple: true,
            directory: false
        });
        
        if (selected && selected.length > 0) {
            const newFiles = await Promise.all(selected.map(async (filePath, index) => {
                
                // Obtener metadatos del archivo
                const fileStats = await stat(filePath);
                const fileContent = await readFile(filePath);
                const base64Content = await fileToBase64(new File([fileContent], filePath.split('\\').pop().split('/').pop()));

                // Calcular checksum segun el algoritmo
                const hash = await invoke("calcular_checksum", {
                    filePath: filePath,
                    algoritmo: algoritmoChecksum
                }).catch(err => {
                    console.error("Error al calcular checksum:", err);
                    return null;
                });

                // Extraer nombre del archivo desde la ruta
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
            
            // Simular proceso de carga
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

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    const handleRemoveFile = (fileId) => {
        setFiles(files.filter(f => f.id !== fileId));
        setUploadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[fileId];
            return newProgress;
        });
    };

    const handleButtonClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <div 
            className="flex flex-col border-2 p-4 mb-4 mt-4 rounded-2xl border-white"
            style={{
                boxShadow: "0 12px 32px 0 rgba(0,0,0,0.7), 0 1.5px 0 0 rgba(255,255,255,0.08) inset",
                zIndex: 1,
                maxWidth: "30vw",
                minWidth: "30vw"
            }}
        >
            <h3 className="text-xl font-bold mb-4 text-center">Archivos Seleccionados</h3>
            
            <button 
                onClick={handleAddFiles}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold mb-4 hover:bg-blue-700 transition-colors"
            >
                + Agregar Archivos
            </button>
            
            {/* <input 
                ref={fileInputRef}
                type="file" 
                multiple 
                onChange={handleAddFiles}
                className="hidden"
            />
             */}
            <div 
                className="overflow-y-auto space-y-3"
                style={{ 
                    maxHeight: "320px" // Aproximadamente 4 archivos (80px cada uno)
                }}
            >
                {files.length === 0 ? (
                    <div className="text-gray-400 text-center py-8">
                        No hay archivos seleccionados
                    </div>
                ) : (
                    files.map((fileObj) => (
                        <div 
                            key={fileObj.id}
                            className="border border-gray-600 rounded-lg p-3 bg-gray-800 bg-opacity-50"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex-1 mr-2">
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
                            
                            {/* Barra de progreso */}
                            <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                                <div 
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{ 
                                        width: `${uploadProgress[fileObj.id] || 0}%` 
                                    }}
                                ></div>
                            </div>
                            <div className="flex flex-row justify-between">
                                <p className="text-xs text-gray-400 mt-1 text-right">
                                    Checksum asociado: {fileObj.checksum || 'N/A'}
                                </p>
                                <p className="text-xs text-gray-400 mt-1 text-right">
                                    {uploadProgress[fileObj.id] || 0}%
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

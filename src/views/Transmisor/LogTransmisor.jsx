import { useEffect, useRef } from "react";

export default function LogTransmisor({log}) {
    const logEndRef = useRef(null);

    // Auto-scroll al último log
    useEffect(() => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [log]);

    return (
        <div 
            className="flex flex-col border-2 p-4 mb-4 mt-4 rounded-2xl border-white mx-auto w-11/12"
            style={{
                boxShadow: "0 12px 32px 0 rgba(0,0,0,0.7), 0 1.5px 0 0 rgba(255,255,255,0.08) inset",
                zIndex: 1,
            }}
        >
            <h3 className="text-xl font-bold mb-4 text-center">Registro de Transmisión</h3>
            <div 
                className="bg-black text-green-400 font-mono text-sm p-4 rounded-lg overflow-y-auto"
                style={{ 
                    minWidth: "30vw",
                    height: '100%',
                    maxWidth: "30vw"
                }}
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
    )
    
};

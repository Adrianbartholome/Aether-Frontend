import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { RefreshCw, X, Zap } from 'lucide-react';

// --- THE STAR FIELD (YOUR NODES) ---
const NodeCloud = ({ nodes }) => {
    const meshRef = useRef();

    // Convert the raw data into Three.js BufferAttributes
    const { positions, colors, sizes } = useMemo(() => {
        const count = nodes.length;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            // Data Format: [id, x, y, z, r, g, b, size]
            const n = nodes[i];
            
            // XYZ
            positions[i * 3] = n[1];     // x
            positions[i * 3 + 1] = n[2]; // y
            positions[i * 3 + 2] = n[3]; // z

            // RGB (Normalize 0-255 to 0.0-1.0)
            colors[i * 3] = n[4] / 255;
            colors[i * 3 + 1] = n[5] / 255;
            colors[i * 3 + 2] = n[6] / 255;

            // Size
            sizes[i] = n[7] || 1.0;
        }

        return { positions, colors, sizes };
    }, [nodes]);

    // Animate the cloud slowly rotating
    useFrame((state) => {
        if (meshRef.current) {
            meshRef.current.rotation.y += 0.001; // Slow spin
            // Optional: breathing effect
            // meshRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 0.5) * 0.02);
        }
    });

    return (
        <points ref={meshRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={positions.length / 3}
                    array={positions}
                    itemSize={3}
                />
                <bufferAttribute
                    attach="attributes-color"
                    count={colors.length / 3}
                    array={colors}
                    itemSize={3}
                />
                {/* Note: WebGL PointsMaterial size is uniform by default. 
                    To vary size per-particle requires a custom shader, 
                    so for simplicity we use a fixed size here or scale the whole cloud. 
                    If you want per-node sizing, we can add a shader later. */}
            </bufferGeometry>
            <pointsMaterial
                size={2.5} // Base size
                vertexColors
                sizeAttenuation
                transparent
                opacity={0.8}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
            />
        </points>
    );
};

// --- MAIN COMPONENT ---
const TitanGraph = ({ workerEndpoint, onClose }) => {
    const [nodes, setNodes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [remapping, setRemapping] = useState(false);
    const [error, setError] = useState(null);

    // 1. Fetch the Map
    const fetchMap = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${workerEndpoint}cortex/map`); // New Endpoint
            const data = await res.json();
            
            if (data.status === "SUCCESS") {
                setNodes(data.points);
            } else {
                setError("Failed to load Star Map.");
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    // 2. Trigger Re-Calculation (Python)
    const handleRemap = async () => {
        if (!window.confirm("Initiate Cortex Re-Cartography? This asks the Core to recalculate 3D physics for all nodes.")) return;
        
        setRemapping(true);
        try {
            // Trigger the Python script
            await fetch(`${workerEndpoint}admin/recalculate_map`, { method: 'POST' }); // Ensure this matches your route
            
            // Poll for completion (Simple version: just wait 5s then reload)
            // Ideally, your backend would tell you when it's done via websocket
            setTimeout(() => {
                setRemapping(false);
                fetchMap(); // Reload the new coordinates
            }, 5000); 
            
        } catch (e) {
            alert("Remap trigger failed: " + e.message);
            setRemapping(false);
        }
    };

    useEffect(() => {
        fetchMap();
    }, []);

    return (
        <div className="fixed inset-0 z-[100] bg-black animate-fade-in">
            {/* --- HUD / UI OVERLAY --- */}
            <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-10 pointer-events-none">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-widest uppercase font-mono flex items-center gap-3">
                        <Zap className="text-cyan-400" /> Cortex Visualizer
                    </h1>
                    <p className="text-xs text-cyan-500/60 font-mono mt-1">
                        NODES: {nodes.length.toLocaleString()} | RENDER MODE: GPU INSTANCED
                    </p>
                </div>
                
                <div className="flex gap-2 pointer-events-auto">
                    <button 
                        onClick={handleRemap}
                        disabled={remapping}
                        className={`px-4 py-2 bg-slate-800 border border-white/10 text-white text-xs font-bold rounded hover:bg-slate-700 transition flex items-center gap-2 ${remapping ? 'animate-pulse text-yellow-400' : ''}`}
                    >
                        <RefreshCw size={14} className={remapping ? "animate-spin" : ""} />
                        {remapping ? "CALCULATING PHYSICS..." : "REGENERATE MAP"}
                    </button>
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 bg-red-900/20 border border-red-500/50 text-red-400 text-xs font-bold rounded hover:bg-red-900/50 transition"
                    >
                        <X size={14} /> CLOSE
                    </button>
                </div>
            </div>

            {/* --- LOADING STATE --- */}
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                    <div className="text-cyan-500 font-mono animate-pulse">DOWNLOADING STAR MAP...</div>
                </div>
            )}

            {/* --- 3D CANVAS --- */}
            <Canvas camera={{ position: [0, 0, 100], fov: 60 }}>
                {/* Lighting */}
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} />
                
                {/* Background Stars (Far away) */}
                <Stars radius={300} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

                {/* The Neural Cloud */}
                {!loading && <NodeCloud nodes={nodes} />}

                {/* Controls */}
                <OrbitControls 
                    enablePan={true} 
                    enableZoom={true} 
                    enableRotate={true} 
                    autoRotate={true}
                    autoRotateSpeed={0.5}
                />
            </Canvas>
        </div>
    );
};

export default TitanGraph;
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { RefreshCw, X, Zap, Sliders, MousePointer2, Terminal } from 'lucide-react';

// --- 1. THE NODES (Visuals) ---
const NodeCloud = ({ nodes, onHover }) => {
    const meshRef = useRef();
    const hoverRef = useRef(null);
    const { raycaster, camera, mouse } = useThree();

    const { positions, colors, sizes } = useMemo(() => {
        const count = nodes.length;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const n = nodes[i];
            positions[i * 3] = n[1];
            positions[i * 3 + 1] = n[2];
            positions[i * 3 + 2] = n[3];
            colors[i * 3] = n[4] / 255;
            colors[i * 3 + 1] = n[5] / 255;
            colors[i * 3 + 2] = n[6] / 255;
            sizes[i] = n[7] || 1.5;
        }
        return { positions, colors, sizes };
    }, [nodes]);

    useFrame(() => {
        if (!meshRef.current) return;
        raycaster.setFromCamera(mouse, camera);
        raycaster.params.Points.threshold = 2.0; 
        const intersects = raycaster.intersectObject(meshRef.current);

        if (intersects.length > 0) {
            const index = intersects[0].index;
            if (hoverRef.current !== index) {
                hoverRef.current = index;
                // n[8] is the label
                onHover(nodes[index], [nodes[index][1], nodes[index][2], nodes[index][3]]);
            }
        } else {
            if (hoverRef.current !== null) {
                hoverRef.current = null;
                onHover(null, null);
            }
        }
    });

    return (
        <points ref={meshRef}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-color" count={colors.length / 3} array={colors} itemSize={3} />
            </bufferGeometry>
            <pointsMaterial size={3.5} vertexColors sizeAttenuation transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
    );
};

// --- 2. THE SYNAPSES (Visuals) ---
const SynapseNetwork = ({ nodes, synapses }) => {
    const geometry = useMemo(() => {
        if (!nodes.length || !synapses.length) return null;
        const nodeMap = new Map();
        nodes.forEach(n => nodeMap.set(n[0], [n[1], n[2], n[3]]));
        
        const vertices = [];
        synapses.forEach(([sourceId, targetId]) => {
            const start = nodeMap.get(sourceId);
            const end = nodeMap.get(targetId);
            if (start && end) vertices.push(...start, ...end);
        });
        
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        return geo;
    }, [nodes, synapses]);

    if (!geometry) return null;
    return (
        <lineSegments geometry={geometry}>
            <lineBasicMaterial color="#6366f1" transparent opacity={0.06} blending={THREE.AdditiveBlending} depthWrite={false} />
        </lineSegments>
    );
};

// --- 3. MAIN COMPONENT (Logic + UI) ---
const TitanGraph = ({ workerEndpoint, onClose }) => {
    const [nodes, setNodes] = useState([]);
    const [synapses, setSynapses] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // UI State
    const [remapping, setRemapping] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [logMessage, setLogMessage] = useState("System Ready."); // LIVE LOGS
    
    // Physics State
    const [spacing, setSpacing] = useState(1.5);
    const [clusterStrength, setClusterStrength] = useState(2.0);
    const [hoveredNode, setHoveredNode] = useState(null);

    // FETCH DATA
    const loadCortex = async () => {
        try {
            setLoading(true);
            const [nodeRes, synRes] = await Promise.all([
                fetch(`${workerEndpoint}cortex/map`),
                fetch(`${workerEndpoint}cortex/synapses`)
            ]);
            const nodeData = await nodeRes.json();
            const synData = await synRes.json();
            if (nodeData.status === "SUCCESS") setNodes(nodeData.points);
            if (synData.status === "SUCCESS") setSynapses(synData.synapses);
        } catch (e) { setLogMessage("Connection Failed."); } 
        finally { setLoading(false); }
    };

    // POLL FOR LOGS (The Live Wire)
    useEffect(() => {
        let interval;
        if (remapping) {
            interval = setInterval(async () => {
                try {
                    const res = await fetch(`${workerEndpoint}cortex/status`);
                    const data = await res.json();
                    if (data.message) setLogMessage(data.message);
                    
                    // Auto-refresh if done
                    if (data.message.includes("Done") || data.message.includes("Success")) {
                        setRemapping(false);
                        loadCortex();
                    }
                } catch (e) { /* silent fail */ }
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [remapping, workerEndpoint]);

    // TRIGGER REMAP
    const handleRemap = async () => {
        setRemapping(true);
        setLogMessage("Initiating Protocol...");
        try {
            await fetch(`${workerEndpoint}admin/recalculate_map`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ spacing, cluster_strength: clusterStrength })
            });
            // The useEffect above handles the rest!
        } catch (e) { 
            setRemapping(false); 
            setLogMessage("Trigger Failed.");
        }
    };

    useEffect(() => { loadCortex(); }, []);

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950 animate-fade-in cursor-crosshair font-mono">
            
            {/* TOP BAR */}
            <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-10 pointer-events-none">
                <div className="pointer-events-auto">
                    <h1 className="text-xl font-bold text-white tracking-widest uppercase flex items-center gap-2">
                        <Zap size={18} className="text-cyan-400" /> Cortex Visualizer
                    </h1>
                    <p className="text-[10px] text-cyan-500/60 mt-1">
                        NODES: {nodes.length} | SYNAPSES: {synapses.length}
                    </p>
                </div>
                
                <div className="flex gap-2 pointer-events-auto">
                    {/* RESTORED TOP BUTTON */}
                    <button onClick={handleRemap} disabled={remapping} className={`px-3 py-1.5 bg-slate-900 border border-cyan-500/30 text-cyan-400 text-[10px] font-bold rounded hover:bg-slate-800 transition flex items-center gap-2 ${remapping ? 'animate-pulse text-yellow-400' : ''}`}>
                        <RefreshCw size={12} className={remapping ? "animate-spin" : ""} /> 
                        {remapping ? "PROCESSING..." : "REMAP"}
                    </button>
                    <button onClick={onClose} className="px-3 py-1.5 bg-red-950/30 border border-red-500/30 text-red-400 text-[10px] font-bold rounded hover:bg-red-900/50 transition">
                        <X size={12} /> CLOSE
                    </button>
                </div>
            </div>

            {/* CONTROL PANEL */}
            <div className={`absolute bottom-8 left-8 z-20 w-72 bg-slate-900/95 border border-white/10 rounded-xl p-4 backdrop-blur-md transition-all shadow-2xl ${showControls ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-10'}`}>
                <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                    <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                        <Sliders size={12} /> Physics Engine
                    </h3>
                    <button onClick={() => setShowControls(!showControls)} className="text-slate-500 hover:text-white"><X size={12}/></button>
                </div>

                <div className="space-y-5">
                    {/* Sliders */}
                    <div>
                        <div className="flex justify-between text-[10px] text-cyan-400 mb-1 uppercase">
                            <span>Island Spacing</span>
                            <span>{spacing}x</span>
                        </div>
                        <input type="range" min="0.1" max="5.0" step="0.1" value={spacing} onChange={(e) => setSpacing(parseFloat(e.target.value))} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"/>
                    </div>
                    <div>
                        <div className="flex justify-between text-[10px] text-purple-400 mb-1 uppercase">
                            <span>Cluster Gravity</span>
                            <span>{clusterStrength}x</span>
                        </div>
                        <input type="range" min="0.1" max="10.0" step="0.5" value={clusterStrength} onChange={(e) => setClusterStrength(parseFloat(e.target.value))} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"/>
                    </div>

                    <button onClick={handleRemap} disabled={remapping} className={`w-full py-2 bg-slate-800 border border-white/10 text-white text-[10px] font-bold rounded hover:bg-slate-700 transition flex items-center justify-center gap-2 ${remapping ? 'border-yellow-500/50 text-yellow-400' : ''}`}>
                        <RefreshCw size={12} className={remapping ? "animate-spin" : ""} /> 
                        {remapping ? "RUNNING SIMULATION..." : "APPLY PHYSICS"}
                    </button>

                    {/* LIVE TERMINAL WINDOW */}
                    <div className="bg-black/50 rounded p-2 border border-white/5 font-mono text-[10px] h-16 flex flex-col justify-end overflow-hidden">
                        <div className="text-slate-500 mb-1 flex items-center gap-1"><Terminal size={8}/> SYSTEM LOG:</div>
                        <div className={`break-words ${remapping ? 'text-yellow-400 animate-pulse' : 'text-green-400'}`}>
                            {'>'} {logMessage}
                        </div>
                    </div>
                </div>
            </div>

            {/* HOVER TOOLTIP */}
            {hoveredNode && (
                <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none max-w-sm w-full">
                    <div className="bg-slate-900/90 border border-cyan-500/30 rounded-lg p-3 backdrop-blur-md shadow-2xl text-center">
                        <div className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase mb-1 flex items-center justify-center gap-2">
                            <MousePointer2 size={10} /> Node Signal
                        </div>
                        <div className="text-sm text-white font-light italic leading-relaxed">"{hoveredNode.label || hoveredNode[8] || 'Unknown'}"</div>
                        <div className="text-[9px] text-slate-500 mt-2 font-mono uppercase">ID: {String(hoveredNode[0] || '').split('-')[0]}...</div>
                    </div>
                </div>
            )}

            {loading && !remapping && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-cyan-500 font-mono animate-pulse">Initializing...</div>}

            <Canvas camera={{ position: [0, 0, 140], fov: 45 }}>
                <color attach="background" args={['#020617']} />
                <Stars radius={300} depth={50} count={3000} factor={4} saturation={0} fade />
                {/* NodeCloud and SynapseNetwork */}
                {!loading && <group><NodeCloud nodes={nodes} onHover={setHoveredNode} /><SynapseNetwork nodes={nodes} synapses={synapses} /></group>}
                <OrbitControls enablePan={true} enableZoom={true} autoRotate={false} />
            </Canvas>
        </div>
    );
};

export default TitanGraph;
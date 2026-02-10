import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { X, Zap, Sliders, MousePointer2, Terminal, Play, Pause, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { forceSimulation, forceManyBody, forceCenter, forceLink } from 'd3-force-3d'; 

// --- HELPER: TEXTURE GENERATOR ---
const createCircleTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)'); 
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.4)'); 
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)'); 
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  
  return new THREE.CanvasTexture(canvas);
};

// --- 1. THE NODES (Reflex Engine) ---
const NodeCloud = ({ nodes, synapses, onHover, onSelect, physics, isLive, simRef }) => {
    const meshRef = useRef();
    const { raycaster, camera, mouse } = useThree();
    const starTexture = useMemo(() => createCircleTexture(), []);
    const hoverRef = useRef(null);

    // 1. INITIALIZE ENGINE (Run Once)
    useEffect(() => {
        simRef.current = forceSimulation()
            .numDimensions(3)
            .stop(); 
        return () => simRef.current?.stop();
    }, []); 

    // 2. DATA LOADER
    useEffect(() => {
        const sim = simRef.current;
        if (!sim || !nodes.length) return;

        const simNodes = nodes.map(n => ({
            id: String(n[0]),
            x: n[1], y: n[2], z: n[3],
            r: n[4], g: n[5], b: n[6], 
            size: n[7], 
            label: n[8] 
        }));

        sim.nodes(simNodes);

        const nodeIds = new Set(simNodes.map(n => n.id));
        const validLinks = synapses
            .map(s => ({ source: String(s[0]), target: String(s[1]) }))
            .filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));

        sim.force('link', forceLink(validLinks).id(d => d.id));

        sim.alpha(1).restart();
        if (!isLive) sim.stop();

    }, [nodes, synapses]); 

    // 3. PHYSICS TUNER (Run when Sliders/Toggle change)
    useEffect(() => {
        const sim = simRef.current;
        if (!sim) return;

        // --- NEW: MODE SWITCHING LOGIC ---
        // You'll need a 'mode' state variable eventually, 
        // for now let's assume standard is default.
        
        if (mode === 'PRISM') {
            // A. PRISM MODE (Emotions)
            
            // 1. Disable Standard Forces
            sim.force('link', null);   // Cut the synapses
            sim.force('center', null); // Release the center pull
            
            // 2. Apply "Emotional Gravity" (The Nebula Effect)
            // (We will implement the detailed math for this later)
            sim.force('x', forceX(node => node.pathos?.valence > 0 ? 500 : -500).strength(0.5));
            
        } else {
            // B. SYNAPTIC MODE (Standard)
            
            // 1. Clear Prism Forces (Clean up if we just switched back)
            sim.force('x', null);
            sim.force('y', null);

            // 2. Apply Standard Forces
            sim.force('charge', forceManyBody().strength(-physics.spacing * 30));
            
            const centerStrength = physics.scale > 0 ? (100 / physics.scale) : 0.05;
            sim.force('center', forceCenter().strength(centerStrength));

            // We need to re-initialize the link force if it was nullified
            // (Note: This requires validLinks to be accessible or stored in a ref)
            // For now, we just update the strength assuming the force exists:
            const linkForce = sim.force('link');
            if (linkForce) {
                linkForce.strength(physics.clusterStrength * 0.1).distance(30);
            }
        }

        // --- C. EXECUTION (Always Last) ---
        if (isLive) {
            sim.alpha(1).restart(); // Wake up!
        } else {
            sim.stop(); // Freeze
        }

    }, [physics, isLive, mode]); // Add 'mode' to dependencies

    // RENDER LOOP
    useFrame(() => {
        if (!meshRef.current || !simRef.current) return;

        if (isLive) simRef.current.tick();

        const positions = meshRef.current.geometry.attributes.position.array;
        const currentNodes = simRef.current.nodes();
        const count = Math.min(currentNodes.length, positions.length / 3);

        for (let i = 0; i < count; i++) {
            const node = currentNodes[i];
            positions[i * 3] = node.x;
            positions[i * 3 + 1] = node.y;
            positions[i * 3 + 2] = node.z;
        }
        
        meshRef.current.geometry.attributes.position.needsUpdate = true;

        // Hover Logic
        raycaster.setFromCamera(mouse, camera);
        raycaster.params.Points.threshold = 1.5; 
        const intersects = raycaster.intersectObject(meshRef.current);

        if (intersects.length > 0) {
            const index = intersects[0].index;
            if (hoverRef.current !== index) {
                hoverRef.current = index;
                const n = currentNodes[index];
                if (n) onHover(n);
            }
        } else {
            if (hoverRef.current !== null) {
                hoverRef.current = null;
                onHover(null);
            }
        }
    });

    const { positions, colors } = useMemo(() => {
        const count = nodes.length;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const n = nodes[i];
            positions[i * 3] = n[1];
            positions[i * 3 + 1] = n[2];
            positions[i * 3 + 2] = n[3];

            const intensity = n[7] > 2.0 ? 2.0 : 1.0; 
            colors[i * 3] = Math.min((n[4] / 255) * intensity, 1.0);
            colors[i * 3 + 1] = Math.min((n[5] / 255) * intensity, 1.0);
            colors[i * 3 + 2] = Math.min((n[6] / 255) * intensity, 1.0);
        }
        return { positions, colors };
    }, [nodes]);

    // Handle Click Selection
    const handleClick = (e) => {
        e.stopPropagation(); // Don't let the canvas clear the selection
        const index = e.index;
        const currentNodes = simRef.current.nodes();
        if (currentNodes[index]) {
            onSelect(currentNodes[index]);
        }
    };

    return (
        <points ref={meshRef} onClick={handleClick}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-color" count={colors.length / 3} array={colors} itemSize={3} />
            </bufferGeometry>
            <pointsMaterial 
                size={15.0}
                vertexColors 
                map={starTexture}        
                transparent={true} 
                alphaTest={0.001}        
                opacity={0.9}            
                depthWrite={false} 
                blending={THREE.AdditiveBlending} 
                sizeAttenuation={true}
            />
        </points>
    );
};

// --- 2. THE SYNAPSES ---
const SynapseNetwork = ({ nodes, synapses, isLive, simRef, hideLinesOnMove }) => {
    const lineRef = useRef();

    const { geometry, indexMap } = useMemo(() => {
        if (!nodes.length || !synapses.length) return { geometry: null, indexMap: null };
        
        const indexMap = new Map();
        nodes.forEach((n, i) => indexMap.set(String(n[0]), i));

        const vertices = [];
        const validSynapses = [];

        synapses.forEach(([source, target]) => {
            const sId = String(source);
            const tId = String(target);
            const sNode = nodes.find(n => String(n[0]) === sId);
            const tNode = nodes.find(n => String(n[0]) === tId);
            
            if (sNode && tNode) {
                vertices.push(sNode[1], sNode[2], sNode[3]); 
                vertices.push(tNode[1], tNode[2], tNode[3]); 
                validSynapses.push({ source: sId, target: tId });
            }
        });
        
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        
        return { geometry: geo, indexMap: validSynapses }; 
    }, [nodes, synapses]);

    useFrame(() => {
        if (isLive && hideLinesOnMove) return;
        if (!lineRef.current || !simRef.current || !indexMap) return;
        
        if (isLive) {
            const currentNodes = simRef.current.nodes();
            const positions = lineRef.current.geometry.attributes.position.array;
            
            const nodeLookup = new Map();
            currentNodes.forEach(n => nodeLookup.set(n.id, n));

            let posIndex = 0;
            indexMap.forEach(link => {
                const s = nodeLookup.get(link.source);
                const t = nodeLookup.get(link.target);

                if (s && t) {
                    positions[posIndex++] = s.x;
                    positions[posIndex++] = s.y;
                    positions[posIndex++] = s.z;
                    positions[posIndex++] = t.x;
                    positions[posIndex++] = t.y;
                    positions[posIndex++] = t.z;
                }
            });

            lineRef.current.geometry.attributes.position.needsUpdate = true;
        }
    });

    if (isLive && hideLinesOnMove) return null;
    if (!geometry) return null;

    return (
        <lineSegments ref={lineRef} geometry={geometry}>
            <lineBasicMaterial color="#6366f1" transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} />
        </lineSegments>
    );
};

// --- 3. MAIN COMPONENT ---
const TitanGraph = ({ workerEndpoint, onClose }) => {
    const [nodes, setNodes] = useState([]);
    const [synapses, setSynapses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showControls, setShowControls] = useState(true);
    const [logMessage, setLogMessage] = useState("System Ready.");
    
    // Physics State
    const [isLive, setIsLive] = useState(false); 
    const [hideLinesOnMove, setHideLinesOnMove] = useState(true); 
    const [physics, setPhysics] = useState({ spacing: 2.0, clusterStrength: 1.0, scale: 2000 });
    
    // Selection State
    const simRef = useRef(null);
    const [hoveredNode, setHoveredNode] = useState(null); 
    const [selectedNode, setSelectedNode] = useState(null); // The "Pinned" Node

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

    useEffect(() => { loadCortex(); }, []);

    // Active Node Logic: Selection > Hover
    const activeNode = selectedNode || hoveredNode;
    const isPinned = !!selectedNode;

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950 animate-fade-in cursor-crosshair font-mono">
            {/* ... Top Bar omitted for brevity, same as before ... */}
            <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-10 pointer-events-none">
                <div className="pointer-events-auto">
                    <h1 className="text-xl font-bold text-white tracking-widest uppercase flex items-center gap-2">
                        <Zap size={18} className="text-cyan-400" /> Cortex Visualizer
                    </h1>
                    <p className="text-[10px] text-cyan-500/60 mt-1">
                        NODES: {nodes.length} | SYNAPSES: {synapses.length} | PHYSICS: {isLive ? "LIVE" : "STATIC"}
                    </p>
                </div>
                <div className="flex gap-2 pointer-events-auto">
                    <button onClick={onClose} className="px-3 py-1.5 bg-red-950/30 border border-red-500/30 text-red-400 text-[10px] font-bold rounded hover:bg-red-900/50 transition">
                        <X size={12} /> CLOSE
                    </button>
                </div>
            </div>

            {/* Controls */}
            <div className={`absolute bottom-8 left-8 z-20 w-72 bg-slate-900/95 border border-white/10 rounded-xl p-4 backdrop-blur-md transition-all shadow-2xl ${showControls ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-10'}`}>
                <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                    <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                        <Sliders size={12} /> Reflex Engine
                    </h3>
                    <button onClick={() => setShowControls(!showControls)} className="text-slate-500 hover:text-white"><X size={12}/></button>
                </div>

                <div className="space-y-5">
                    <div className="space-y-2">
                        <button 
                            onClick={() => setIsLive(!isLive)} 
                            className={`w-full py-3 border rounded-xl font-bold tracking-widest transition-all flex items-center justify-center gap-2 text-xs ${isLive ? 'bg-emerald-900/50 border-emerald-500 text-emerald-400 animate-pulse' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-white'}`}
                        >
                            {isLive ? <Pause size={14} /> : <Play size={14} />}
                            {isLive ? "PHYSICS: LIVE" : "PHYSICS: FROZEN"}
                        </button>

                        <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Motion Quality</span>
                            <button 
                                onClick={() => setHideLinesOnMove(!hideLinesOnMove)}
                                className={`text-[9px] px-2 py-1 rounded border transition-all flex items-center gap-1 ${!hideLinesOnMove ? 'bg-indigo-900/50 border-indigo-400 text-indigo-300' : 'bg-slate-800 border-white/10 text-slate-500'}`}
                            >
                                {!hideLinesOnMove ? <Eye size={10} /> : <EyeOff size={10} />}
                                {hideLinesOnMove ? "HIDE LINES (FAST)" : "SHOW LINES (HEAVY)"}
                            </button>
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between text-[10px] text-cyan-400 mb-1 uppercase">
                            <span>Island Spacing</span>
                            <span>{physics.spacing}x</span>
                        </div>
                        <input type="range" min="0.1" max="10.0" step="0.1" value={physics.spacing} onChange={(e) => setPhysics({...physics, spacing: parseFloat(e.target.value)})} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"/>
                    </div>
                    <div>
                        <div className="flex justify-between text-[10px] text-purple-400 mb-1 uppercase">
                            <span>Cluster Gravity</span>
                            <span>{physics.clusterStrength}x</span>
                        </div>
                        <input type="range" min="0.1" max="5.0" step="0.1" value={physics.clusterStrength} onChange={(e) => setPhysics({...physics, clusterStrength: parseFloat(e.target.value)})} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"/>
                    </div>
                    <div>
                        <div className="flex justify-between text-[10px] text-emerald-400 mb-1 uppercase">
                            <span>Universe Scale</span>
                            <span>{physics.scale}</span>
                        </div>
                        <input type="range" min="100" max="5000" step="100" value={physics.scale} onChange={(e) => setPhysics({...physics, scale: parseFloat(e.target.value)})} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"/>
                    </div>

                    <div className="bg-black/50 rounded p-2 border border-white/5 font-mono text-[10px] h-16 flex flex-col justify-end overflow-hidden">
                        <div className="text-slate-500 mb-1 flex items-center gap-1"><Terminal size={8}/> SYSTEM LOG:</div>
                        <div className={`break-words ${isLive ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {'>'} {isLive ? "Engine Running..." : "Engine Standby."}
                        </div>
                    </div>
                </div>
            </div>

            {/* --- UPDATED INFO WINDOW (STICKY & SELECTABLE) --- */}
            {activeNode && (
                <div className={`absolute top-24 left-1/2 -translate-x-1/2 z-20 max-w-sm w-full transition-all duration-300 ${isPinned ? 'pointer-events-auto' : 'pointer-events-none'}`}>
                    <div className={`bg-slate-900/95 border backdrop-blur-xl rounded-xl p-5 shadow-2xl relative ${isPinned ? 'border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.2)]' : 'border-cyan-500/30'}`}>
                        
                        {/* Pin Indicator / Close Button */}
                        {isPinned && (
                            <button 
                                onClick={() => setSelectedNode(null)} 
                                className="absolute top-2 right-2 text-slate-500 hover:text-white transition bg-black/20 p-1 rounded-full"
                            >
                                <X size={14} />
                            </button>
                        )}

                        <div className="flex flex-col items-center text-center">
                            <div className={`text-[10px] font-bold tracking-[0.2em] uppercase mb-3 flex items-center gap-2 ${isPinned ? 'text-cyan-300' : 'text-cyan-500'}`}>
                                {isPinned ? <Lock size={12} /> : <Unlock size={12} />} 
                                {isPinned ? "SIGNAL LOCKED" : "NODE SIGNAL"}
                            </div>
                            
                            {/* Synthesis / Label */}
                            <div className="text-base text-white font-light italic leading-relaxed mb-4">
                                "{activeNode.label || activeNode[8] || 'Unknown'}"
                            </div>

                            {/* Full ID (Selectable & Wrappable) */}
                            <div className="w-full bg-black/40 rounded p-2 border border-white/5 text-left">
                                <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Hologram ID:</div>
                                <div className="text-[10px] text-cyan-400/80 font-mono break-all select-all hover:text-cyan-300 transition cursor-text">
                                    {activeNode.id || String(activeNode[0] || '')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {loading && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-cyan-500 font-mono animate-pulse">Initializing...</div>}

            {/* --- CANVAS (WITH BACKGROUND CLICK HANDLER) --- */}
            <Canvas 
                camera={{ position: [0, 0, 140], fov: 45, near: 0.1, far: 20000 }}
                onPointerMissed={() => setSelectedNode(null)} // Click empty space to unpin
            >
                <color attach="background" args={['#020617']} />
                <fog attach="fog" args={['#020617', 2000, 20000]} /> 
                <Stars radius={50000} depth={50} count={5000} factor={4} saturation={0} fade />
                
                {!loading && (
                    <group>
                        <NodeCloud 
                            nodes={nodes} 
                            synapses={synapses} 
                            onHover={setHoveredNode} 
                            onSelect={setSelectedNode} // Connect the click
                            physics={physics} 
                            isLive={isLive}
                            simRef={simRef}
                        />
                        <SynapseNetwork 
                            nodes={nodes} 
                            synapses={synapses} 
                            isLive={isLive} 
                            simRef={simRef}
                            hideLinesOnMove={hideLinesOnMove}
                        />
                    </group>
                )}
                
                <OrbitControls enablePan={true} enableZoom={true} autoRotate={false} />
            </Canvas>
        </div>
    );
};

export default TitanGraph;
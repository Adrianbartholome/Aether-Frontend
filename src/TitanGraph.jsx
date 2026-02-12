import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { X, Zap, Sliders, MousePointer2, Terminal, Play, Pause, Eye, EyeOff, Lock, Unlock, Aperture, Activity } from 'lucide-react';

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
const NodeCloud = ({ nodes, synapses, onHover, onSelect, physics, isLive, viewMode, simRef }) => {
    const meshRef = useRef();
    const { raycaster, camera, mouse } = useThree();
    const starTexture = useMemo(() => createCircleTexture(), []);
    const hoverRef = useRef(null);

    // Smooth transition state
    const lerpNodesRef = useRef([]);

    // 1. DATA PREPROCESSOR (Geometric Base)
    const processedNodes = useMemo(() => {
        if (!nodes.length) return [];

        const nodeMap = new Map();
        const results = nodes.map(n => {
            const safeValence = (n[9] !== undefined && n[9] !== null) ? n[9] : 0.0;
            const safeArousal = (n[10] !== undefined && n[10] !== null) ? n[10] : 0.0;
            const node = {
                id: String(n[0]),
                baseX: n[1] || 0, baseY: n[2] || 0, baseZ: n[3] || 0,
                r: n[4] || 100, g: n[5] || 100, b: n[6] || 100,
                size: n[7] || 1,
                label: n[8] || "Unknown",
                valence: safeValence,
                arousal: safeArousal,
                emotion: n[11] || "neutral",
                links: []
            };
            nodeMap.set(node.id, node);

            // Convert "Archetype Name" -> Number (-1.0 to 1.0)
            let hash = 0;
            for (let i = 0; i < mythos.length; i++) {
                hash = mythos.charCodeAt(i) + ((hash << 5) - hash);
            }
            const layerZ = (hash % 100) / 100;

            return {
                id: String(n[0]),
                // ... x, y, z, r, g, b, size ...
                label: n[8],
                valence: n[9],
                arousal: n[10],
                emotion: n[11],
                ethos: n[12] || "",   // Added safety fallback
                mythos: mythos,
                layerZ: layerZ, // [NEW]
                links: []
            };
            return node;
        });

        // Pre-calculate neighbor map for "Gravity"
        synapses.forEach(s => {
            const sId = String(s[0]);
            const tId = String(s[1]);
            if (nodeMap.has(sId) && nodeMap.has(tId)) {
                nodeMap.get(sId).links.push(tId);
                nodeMap.get(tId).links.push(sId);
            }
        });

        return results;
    }, [nodes, synapses]);

    // Update simRef (selection/lines lookup)
    useEffect(() => {
        if (!simRef.current) simRef.current = { nodes: () => [] };

        simRef.current.nodes = () => processedNodes.map((n, i) => ({
            ...n,
            x: lerpNodesRef.current[i]?.x || n.baseX,
            y: lerpNodesRef.current[i]?.y || n.baseY,
            z: lerpNodesRef.current[i]?.z || n.baseZ
        }));

        // Initialize/Resize lerp positions
        if (lerpNodesRef.current.length !== processedNodes.length) {
            lerpNodesRef.current = processedNodes.map(n => {
                // Try to preserve existing lerp if resizing
                return { x: n.baseX, y: n.baseY, z: n.baseZ };
            });
        }
    }, [processedNodes]);

    // RENDER LOOP (Geometric Layout Engine)
    // Inside NodeCloud component in TitanGraph.js

    // RENDER LOOP (Geometric Layout Engine)
    useFrame((state, delta) => {
        if (!meshRef.current || !processedNodes.length) return;

        const p = physics;
        const positions = meshRef.current.geometry.attributes.position.array;
        const lerpSpeed = 0.08;

        // --- PRISM CONFIGURATION ---
        const PRISM_SCALE = 250; // Increased from 120 to fill more space
        const CORE_SPREAD = 0.6; // Lower number = More spread from center (0.5 is square root)

        for (let i = 0; i < processedNodes.length; i++) {
            const node = processedNodes[i];
            let targetX, targetY, targetZ;

            if (viewMode === 'PRISM') {
                // --- PRISM MATH UPDATE ---

                // 1. Get raw values
                let v = node.valence || 0;
                let a = node.arousal || 0;

                // 2. CLAMP OUTLIERS (Fixes "Stray nodes")
                v = Math.max(-1, Math.min(1, v));
                a = Math.max(-1, Math.min(1, a));

                // 3. SPREAD CORE (Using 'Island Spacing' slider as Gamma)
                // Lower value (0.5) = pushes center nodes out. 
                // Higher value (1.0) = linear distribution.
                const gamma = p.spacing || 0.6;

                v = Math.sign(v) * Math.pow(Math.abs(v), gamma);
                a = Math.sign(a) * Math.pow(Math.abs(a), gamma);

                // 4. SCALE (Using 'Universal Scale' slider)
                // We divide by 4 because the slider goes up to 2000+
                const prismScale = (p.scale || 1000) / 4;
                targetX = v * prismScale;
                targetY = a * prismScale;
                // [NEW] Z-AXIS STRATIFICATION
                // We use the "Soul Stratification" slider (p.clusterStrength) to multiply height
                // 0 = Flat, 5 = Tall Skyscrapers
                targetZ = node.layerZ * (p.clusterStrength * 500);

            } else if (isLive) {
                // ... (Existing Synaptic Logic - UNTOUCHED) ...
                const scaleFactor = (p.scale / 1000);
                let x = node.baseX * scaleFactor;
                let y = node.baseY * scaleFactor;
                let z = node.baseZ * scaleFactor;

                if (p.clusterStrength > 0 && node.links.length > 0) {
                    // ... (Your existing cluster logic) ...
                    // [Truncated for brevity - keep your existing code here]
                    // Copy your existing cluster logic block exactly as it was
                    let avgX = 0, avgY = 0, avgZ = 0;
                    let count = 0;
                    node.links.forEach(linkId => {
                        const neighborIndex = processedNodes.findIndex(n => n.id === linkId);
                        if (neighborIndex !== -1) {
                            const neighbor = processedNodes[neighborIndex];
                            avgX += neighbor.baseX * scaleFactor;
                            avgY += neighbor.baseY * scaleFactor;
                            avgZ += neighbor.baseZ * scaleFactor;
                            count++;
                        }
                    });
                    if (count > 0) {
                        const pullX = (avgX / count) - x;
                        const pullY = (avgY / count) - y;
                        const pullZ = (avgZ / count) - z;
                        const gravityFactor = Math.min(p.clusterStrength * 0.33, 0.95);
                        x += pullX * gravityFactor;
                        y += pullY * gravityFactor;
                        z += pullZ * gravityFactor;
                    }
                }

                const distFromCenter = Math.sqrt(x * x + y * y + z * z) || 1;
                const spacingForce = p.spacing * 60;
                x += (x / distFromCenter) * spacingForce;
                y += (y / distFromCenter) * spacingForce;
                z += (z / distFromCenter) * spacingForce;

                targetX = x; targetY = y; targetZ = z;
            } else {
                targetX = lerpNodesRef.current[i]?.x || node.baseX;
                targetY = lerpNodesRef.current[i]?.y || node.baseY;
                targetZ = lerpNodesRef.current[i]?.z || node.baseZ;
            }

            // ... (Existing Lerp Logic - UNTOUCHED) ...
            const lerp = lerpNodesRef.current[i];
            if (lerp) {
                lerp.x += (targetX - lerp.x) * lerpSpeed;
                lerp.y += (targetY - lerp.y) * lerpSpeed;
                lerp.z += (targetZ - lerp.z) * lerpSpeed;

                positions[i * 3] = lerp.x;
                positions[i * 3 + 1] = lerp.y;
                positions[i * 3 + 2] = lerp.z;
            }
        }

        meshRef.current.geometry.attributes.position.needsUpdate = true;
        // --- HOVER LOGIC (RAYCASTER) ---
        // 1. Update Raycaster with current mouse position
        raycaster.setFromCamera(mouse, camera);

        // 2. Adjust threshold (make it easier to hit small dots)
        raycaster.params.Points.threshold = 1.5; // Tweak this if it's too hard/easy

        // 3. Check for intersections
        const intersects = raycaster.intersectObject(meshRef.current);

        if (intersects.length > 0) {
            // Get the index of the specific point we hit
            const index = intersects[0].index;

            // Only update if it's a NEW hover (performance)
            if (hoverRef.current !== index) {
                hoverRef.current = index;

                // CRITICAL: We must look up the REAL node data using the index
                const currentNodes = simRef.current.nodes();
                const n = currentNodes[index];

                if (n) onHover(n); // Send data up to parent
            }
        } else {
            // If we hit nothing, clear the hover
            if (hoverRef.current !== null) {
                hoverRef.current = null;
                onHover(null);
            }
        }
    });

    const { positions, colors } = useMemo(() => {
        const count = nodes.length;
        const posArr = new Float32Array(count * 3);
        const colArr = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const n = nodes[i];
            posArr[i * 3] = n[1];
            posArr[i * 3 + 1] = n[2];
            posArr[i * 3 + 2] = n[3];

            if (viewMode === 'PRISM') {
                const val = n[9] || 0;
                const aro = n[10] || 0;
                if (val > 0.1) {
                    colArr[i * 3] = 0.0; colArr[i * 3 + 1] = 1.2 + aro; colArr[i * 3 + 2] = 2.0 + aro;
                } else if (val < -0.1) {
                    colArr[i * 3] = 2.0 + aro; colArr[i * 3 + 1] = 0.0; colArr[i * 3 + 2] = 1.2 + aro;
                } else {
                    colArr[i * 3] = 0.05; colArr[i * 3 + 1] = 0.05; colArr[i * 3 + 2] = 0.2;
                }
            } else {
                const intensity = n[7] > 2.0 ? 2.0 : 1.0;
                colArr[i * 3] = (n[4] / 255) * intensity;
                colArr[i * 3 + 1] = (n[5] / 255) * intensity;
                colArr[i * 3 + 2] = (n[6] / 255) * intensity;
            }
        }
        return { positions: posArr, colors: colArr };
    }, [nodes, viewMode]);

    useEffect(() => {
        if (meshRef.current) {
            if (meshRef.current.geometry.attributes.color) meshRef.current.geometry.attributes.color.needsUpdate = true;
            if (meshRef.current.geometry.attributes.position) meshRef.current.geometry.attributes.position.needsUpdate = true;
        }
    }, [colors, positions, viewMode]);

    const handleClick = (e) => {
        e.stopPropagation();
        const index = e.index;
        const currentNodes = simRef.current.nodes();
        if (currentNodes[index]) onSelect(currentNodes[index]);
    };

    return (
        <points ref={meshRef} onClick={handleClick}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-color" count={colors.length / 3} array={colors} itemSize={3} />
            </bufferGeometry>
            <pointsMaterial
                map={starTexture}
                transparent={true}
                alphaTest={0.01}
                depthWrite={false}
                vertexColors={true}
                blending={THREE.AdditiveBlending}
                size={viewMode === 'PRISM' ? 40.0 : 18.0}
                opacity={viewMode === 'PRISM' ? 0.9 : 1.0}
            />
        </points>
    );
};

// --- 2. THE SYNAPSES ---
const SynapseNetwork = ({ nodes, synapses, viewMode, simRef, showSynapses }) => {
    const lineRef = useRef();

    // PERFORMANCE: Pre-calculate index lookup
    const nodeLookup = useMemo(() => {
        if (!nodes) return new Map();
        return new Map(nodes.map((n, index) => [String(n[0]), index]));
    }, [nodes]);

    const { colors } = useMemo(() => {
        if (!synapses || !nodes) return { colors: new Float32Array(0) };
        const nodeMap = new Map(nodes.map(n => [String(n[0]), n]));
        const colArray = new Float32Array(synapses.length * 6);

        for (let i = 0; i < synapses.length; i++) {
            const [sourceId, targetId] = synapses[i];
            const nodeA = nodeMap.get(String(sourceId));
            const nodeB = nodeMap.get(String(targetId));

            if (nodeA && nodeB) {
                const getColor = (n) => {
                    if (viewMode === 'PRISM') return [0.05, 0.05, 0.1];
                    return [0.1, 0.2, 0.4]; // Translucent Blue
                };
                const cA = getColor(nodeA);
                const cB = getColor(nodeB);
                colArray.set([...cA, ...cB], i * 6);
            }
        }
        return { colors: colArray };
    }, [nodes, synapses, viewMode]);

    useFrame(() => {
        if (!lineRef.current || !simRef.current) return;

        // --- CRITICAL FIX: Use the LERPED coordinates from simRef ---
        const simNodes = simRef.current.nodes();
        if (!simNodes.length) return;

        const positions = lineRef.current.geometry.attributes.position.array;

        for (let i = 0; i < synapses.length; i++) {
            const [sourceId, targetId] = synapses[i];
            const idxA = nodeLookup.get(String(sourceId));
            const idxB = nodeLookup.get(String(targetId));

            const nodeA = simNodes[idxA];
            const nodeB = simNodes[idxB];

            if (nodeA && nodeB) {
                const posIdx = i * 6;
                positions[posIdx + 0] = nodeA.x;
                positions[posIdx + 1] = nodeA.y;
                positions[posIdx + 2] = nodeA.z;
                positions[posIdx + 3] = nodeB.x;
                positions[posIdx + 4] = nodeB.y;
                positions[posIdx + 5] = nodeB.z;
            }
        }
        lineRef.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <lineSegments ref={lineRef} visible={showSynapses}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={synapses.length * 2} array={new Float32Array(synapses.length * 6)} itemSize={3} />
                <bufferAttribute attach="attributes-color" count={colors.length / 3} array={colors} itemSize={3} />
            </bufferGeometry>
            <lineBasicMaterial vertexColors={true} transparent={true} opacity={0.15} blending={THREE.AdditiveBlending} depthWrite={false} />
        </lineSegments>
    );
};

// --- 3. MAIN COMPONENT ---
const TitanGraph = ({ workerEndpoint, onClose }) => {
    const [nodes, setNodes] = useState([]);
    const [synapses, setSynapses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showControls, setShowControls] = useState(true);

    const [isLive, setIsLive] = useState(true);
    const [viewMode, setViewMode] = useState('SYNAPTIC');
    const [showSynapses, setShowSynapses] = useState(true);
    const [physics, setPhysics] = useState({ spacing: 2.0, clusterStrength: 1.0, scale: 2000 });

    const simRef = useRef({ nodes: () => [] });
    const [hoveredNode, setHoveredNode] = useState(null);
    const [selectedNode, setSelectedNode] = useState(null);

    const loadCortex = async () => {
        try {
            setLoading(true);
            const [nodeRes, synRes] = await Promise.all([
                fetch(`${workerEndpoint}cortex/map`),
                fetch(`${workerEndpoint}cortex/synapses`)
            ]);

            // Safety check: Did the server actually reply with OK?
            if (!nodeRes.ok || !synRes.ok) {
                throw new Error(`Server Error: Map ${nodeRes.status} / Synapses ${synRes.status}`);
            }

            const nodeData = await nodeRes.json();
            const synData = await synRes.json();

            // Safety check: Is the data null?
            if (nodeData && nodeData.status === "SUCCESS") {
                setNodes(nodeData.points);
            }
            if (synData && synData.status === "SUCCESS") {
                setSynapses(synData.synapses);
            }
        } catch (e) {
            console.error("Load Failed:", e);
            // Optional: Set empty nodes to prevent crash
            setNodes([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadCortex(); }, []);

    const activeNode = selectedNode || hoveredNode;
    const isPinned = !!selectedNode;

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950 animate-fade-in cursor-crosshair font-mono">
            <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-10 pointer-events-none">
                <div className="pointer-events-auto">
                    <h1 className="text-xl font-bold text-white tracking-widest uppercase flex items-center gap-2">
                        <Zap size={18} className="text-cyan-400" /> Cortex Visualizer
                    </h1>
                    <p className="text-[10px] text-cyan-500/60 mt-1">
                        NODES: {nodes.length} | MODE: {viewMode} | ENGINE: GEOMETRIC (v2)
                    </p>
                </div>
                <div className="flex gap-2 pointer-events-auto">
                    <button id="regen-btn" onClick={loadCortex} className="px-3 py-1.5 bg-cyan-950/30 border border-cyan-500/30 text-cyan-400 text-[10px] font-bold rounded hover:bg-cyan-900/50 transition flex items-center gap-2">
                        ♻️ REFRESH
                    </button>
                    <button onClick={onClose} className="px-3 py-1.5 bg-red-950/30 border border-red-500/30 text-red-400 text-[10px] font-bold rounded hover:bg-red-900/50 transition">
                        <X size={12} /> CLOSE
                    </button>
                </div>
            </div>

            <div className={`absolute bottom-8 left-8 z-20 w-72 bg-slate-900/95 border border-white/10 rounded-xl p-4 backdrop-blur-md transition-all shadow-2xl ${showControls ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-10'}`}>
                <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                    <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                        <Sliders size={12} /> Reflex Engine
                    </h3>
                    <button onClick={() => setShowControls(!showControls)} className="text-slate-500 hover:text-white"><X size={12} /></button>
                </div>

                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setViewMode('SYNAPTIC')} className={`py-2 border rounded-lg text-[10px] font-bold tracking-widest flex items-center justify-center gap-2 transition-all ${viewMode === 'SYNAPTIC' ? 'bg-cyan-900/50 border-cyan-500 text-cyan-300' : 'bg-slate-800 border-white/5 text-slate-500 hover:text-white'}`}>
                            <Activity size={12} /> SYNAPTIC
                        </button>
                        <button onClick={() => setViewMode('PRISM')} className={`py-2 border rounded-lg text-[10px] font-bold tracking-widest flex items-center justify-center gap-2 transition-all ${viewMode === 'PRISM' ? 'bg-purple-900/50 border-purple-500 text-purple-300' : 'bg-slate-800 border-white/5 text-slate-500 hover:text-white'}`}>
                            <Aperture size={12} /> PRISM
                        </button>
                    </div>

                    <div className="pt-2 border-t border-white/5">
                        <button
                            onClick={() => setShowSynapses(!showSynapses)}
                            className={`w-full py-2 rounded-lg text-[10px] font-bold tracking-widest flex items-center justify-center gap-2 transition-all ${showSynapses ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300' : 'bg-slate-800 border border-white/5 text-slate-500 hover:text-white'}`}
                        >
                            {showSynapses ? <Eye size={12} /> : <EyeOff size={12} />}
                            {showSynapses ? "SYNAPSES: ON" : "SYNAPSES: OFF"}
                        </button>
                    </div>

                    {viewMode === 'SYNAPTIC' ? (
                        /* --- ORIGINAL SYNAPTIC SLIDERS --- */
                        <div className="space-y-3 pt-2 border-t border-white/5">
                            <div>
                                <div className="flex justify-between text-[10px] text-cyan-400 mb-1 uppercase"><span>Island Spacing</span><span>{physics.spacing}x</span></div>
                                <input type="range" min="0.1" max="10.0" step="0.1" value={physics.spacing} onChange={(e) => setPhysics({ ...physics, spacing: parseFloat(e.target.value) })} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                            </div>
                            <div>
                                <div className="flex justify-between text-[10px] text-purple-400 mb-1 uppercase"><span>Cluster Gravity</span><span>{physics.clusterStrength}x</span></div>
                                <input type="range" min="0.0" max="5.0" step="0.1" value={physics.clusterStrength} onChange={(e) => setPhysics({ ...physics, clusterStrength: parseFloat(e.target.value) })} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                            </div>
                            <div>
                                <div className="flex justify-between text-[10px] text-emerald-400 mb-1 uppercase"><span>Universe Scale</span><span>{physics.scale}</span></div>
                                <input type="range" min="100" max="5000" step="100" value={physics.scale} onChange={(e) => setPhysics({ ...physics, scale: parseFloat(e.target.value) })} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                            </div>
                        </div>
                    ) : (
                        /* --- NEW PRISM SLIDERS --- */
                        <div className="space-y-3 pt-2 border-t border-white/5">
                            {/* 1. SCALE (Reused) */}
                            <div>
                                <div className="flex justify-between text-[10px] text-emerald-400 mb-1 uppercase">
                                    <span>Prism Scale</span><span>{physics.scale}</span>
                                </div>
                                <input
                                    type="range" min="100" max="3000" step="50"
                                    value={physics.scale}
                                    onChange={(e) => setPhysics({ ...physics, scale: parseFloat(e.target.value) })}
                                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                />
                            </div>

                            {/* 2. SPREAD (Reused Spacing) */}
                            <div>
                                <div className="flex justify-between text-[10px] text-cyan-400 mb-1 uppercase">
                                    <span>Core Spread (Gamma)</span><span>{physics.spacing}</span>
                                </div>
                                <input
                                    type="range" min="0.1" max="1.5" step="0.05"
                                    value={physics.spacing}
                                    onChange={(e) => setPhysics({ ...physics, spacing: parseFloat(e.target.value) })}
                                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                />
                            </div>

                            {/* 3. Z-AXIS (Locked/Disabled) */}
                            <div className="opacity-30 pointer-events-none grayscale">
                                <div className="flex justify-between text-[10px] text-purple-400 mb-1 uppercase">
                                    <span>Z-Axis (Locked)</span><span>--</span>
                                </div>
                                <input type="range" disabled value={0} className="w-full h-1 bg-slate-800 rounded-lg appearance-none" />
                            </div>
                        </div>
                    )}

                    <div className="bg-black/50 rounded p-2 border border-white/5 font-mono text-[10px] h-16 flex flex-col justify-end overflow-hidden">
                        <div className="text-slate-500 mb-1 flex items-center gap-1"><Terminal size={8} /> SYSTEM LOG:</div>
                        <div className="text-slate-400">
                            {'>'} {viewMode === 'PRISM' ? "Spectral Projection Active." : "Geometric Lattice Stable."}
                        </div>
                    </div>
                </div>
            </div>

            {activeNode && (
                <div className={`absolute top-24 left-1/2 -translate-x-1/2 z-20 max-w-sm w-full transition-all duration-300 ${isPinned ? 'pointer-events-auto' : 'pointer-events-none'}`}>
                    <div className={`bg-slate-900/95 border backdrop-blur-xl rounded-xl p-5 shadow-2xl relative ${isPinned ? 'border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.2)]' : 'border-cyan-500/30'}`}>
                        {isPinned && <button onClick={() => setSelectedNode(null)} className="absolute top-2 right-2 text-slate-500 hover:text-white transition bg-black/20 p-1 rounded-full"><X size={14} /></button>}
                        <div className="flex flex-col items-center text-center">
                            <div className={`text-[10px] font-bold tracking-[0.2em] uppercase mb-3 flex items-center gap-2 ${isPinned ? 'text-cyan-300' : 'text-cyan-500'}`}>{isPinned ? <Lock size={12} /> : <Unlock size={12} />}{isPinned ? "SIGNAL LOCKED" : "NODE SIGNAL"}</div>
                            <div className="text-base text-white font-light italic leading-relaxed mb-4">"{activeNode.label || activeNode[8] || 'Unknown'}"</div>
                            {activeNode.emotion && activeNode.emotion !== "neutral" && (
                                <div className="grid grid-cols-2 gap-2 w-full mb-3">
                                    <div className="bg-black/30 rounded p-2 border border-white/5 flex flex-col items-center">
                                        <div className="text-[8px] uppercase text-slate-500">Emotion</div>
                                        <div className="text-xs text-purple-300 font-bold uppercase">{activeNode.emotion}</div>
                                    </div>
                                    <div className="bg-black/30 rounded p-2 border border-white/5 flex flex-col items-center">
                                        <div className="text-[8px] uppercase text-slate-500">Intensity</div>
                                        <div className="text-xs text-emerald-300 font-mono">V:{activeNode.valence?.toFixed(2)} A:{activeNode.arousal?.toFixed(2)}</div>
                                    </div>
                                    <div className="text-base text-white font-light italic leading-relaxed mb-4">
                                        "{activeNode.label || activeNode[8] || 'Unknown'}"
                                    </div>

                                    {/* [NEW] SOUL DATA BADGES */}
                                    {(activeNode.mythos || activeNode.ethos) && (
                                        <div className="flex gap-2 mb-4 w-full">
                                            {activeNode.mythos && (
                                                <div className="flex-1 bg-indigo-950/50 border border-indigo-500/30 p-2 rounded text-center">
                                                    <div className="text-[8px] text-indigo-300 uppercase tracking-widest mb-1">Archetype</div>
                                                    <div className="text-xs text-white font-bold">{activeNode.mythos}</div>
                                                </div>
                                            )}
                                            {activeNode.ethos && (
                                                <div className="flex-1 bg-fuchsia-950/50 border border-fuchsia-500/30 p-2 rounded text-center">
                                                    <div className="text-[8px] text-fuchsia-300 uppercase tracking-widest mb-1">Ethos</div>
                                                    <div className="text-xs text-white font-bold">{activeNode.ethos}</div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="w-full bg-black/40 rounded p-2 border border-white/5 text-left"><div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Hologram ID:</div><div className="text-[10px] text-cyan-400/80 font-mono break-all select-all hover:text-cyan-300 transition cursor-text">{activeNode.id || String(activeNode[0] || '')}</div></div>
                        </div>
                    </div>
                </div>
            )}

            {loading && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-cyan-500 font-mono animate-pulse">Initializing...</div>}

            <Canvas camera={{ position: [0, 0, 2000], fov: 45, near: 0.1, far: 20000 }} onPointerMissed={() => setSelectedNode(null)}>
                <color attach="background" args={['#020617']} />
                <fog attach="fog" args={['#020617', 2000, 20000]} />
                <Stars radius={50000} depth={50} count={5000} factor={4} saturation={0} fade />
                {!loading && (
                    <group>
                        <NodeCloud nodes={nodes} synapses={synapses} onHover={setHoveredNode} onSelect={setSelectedNode} physics={physics} isLive={isLive} viewMode={viewMode} simRef={simRef} />
                        <SynapseNetwork nodes={nodes} synapses={synapses} viewMode={viewMode} simRef={simRef} showSynapses={showSynapses} />
                    </group>
                )}
                <OrbitControls enablePan={true} enableZoom={true} autoRotate={false} />
            </Canvas>
        </div>
    );
};

export default TitanGraph;

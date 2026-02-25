import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { X, Zap, Sliders, MousePointer2, Terminal, Play, Pause, Eye, EyeOff, Lock, Unlock, Aperture, Activity, Search, Target, MoreVertical, RefreshCw, Cloud } from 'lucide-react';
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
const NodeCloud = ({ nodes, synapses, onHover, onSelect, physics, isLive, viewMode, simRef, searchQuery, prismVector, isPrismActive }) => {
    const meshRef = useRef();
    const { raycaster, camera, mouse } = useThree();
    const starTexture = useMemo(() => createCircleTexture(), []);

    // THE FIX: Destroy the canvas texture when unmounting to prevent GPU memory leaks
    useEffect(() => {
        return () => starTexture.dispose();
    }, [starTexture]);

    const hoverRef = useRef(null);

    // Smooth transition state
    const lerpNodesRef = useRef([]);

    // --- O(1) LOOKUP MAP FOR EXTREME PERFORMANCE ---
    const nodeIndexMap = useMemo(() => {
        const map = new Map();
        if (nodes) nodes.forEach((n, idx) => map.set(String(n[0]), idx));
        return map;
    }, [nodes]);

    // 1. DATA PREPROCESSOR (Now handles the Prism Math once per slider change)
    const processedNodes = useMemo(() => {
        if (!nodes.length) return [];

        const nodeMap = new Map();
        const prismScale = (physics.scale || 2000) / 4.5;
        const expansionPower = (physics.spacing || 1.0); // We'll fix the "backwards" logic here

        const results = nodes.map(n => {
            const id = String(n[0]);
            const mythos = n[13] || "Unknown";

            // --- CALCULATE BASE PRISM COORDINATES ONCE ---
            let v = Math.max(-1, Math.min(1, n[9] || 0));
            let a = Math.max(-1, Math.min(1, n[10] || 0));

            // Fix the "Backwards" Expansion: 
            // Small spacing slider (0.1) = high exponent (Contract)
            // Large spacing slider (1.9) = small exponent (Expand)
            const exp = 2.0 - expansionPower;
            const pX = Math.sign(v) * Math.pow(Math.abs(v), exp) * prismScale;
            const pY = Math.sign(a) * Math.pow(Math.abs(a), exp) * prismScale;

            // Hash for Z-layer
            let hash = 0;
            for (let i = 0; i < mythos.length; i++) {
                hash = mythos.charCodeAt(i) + ((hash << 5) - hash);
            }
            const layerZ = (hash % 100) / 100;
            const pZ = layerZ * (physics.prismZ * (prismScale * 0.4));

            const node = {
                id,
                baseX: n[1] || 0, baseY: n[2] || 0, baseZ: n[3] || 0,
                prismX: pX, prismY: pY, prismZ: pZ, // PRE-CALCULATED SAVED STATE
                layerZ: layerZ, // For soul stratification
                label: n[8] || "Unknown",
                emotion: n[11] || "neutral",
                valence: n[9], arousal: n[10],
                mythos: mythos, ethos: n[12] || "",
                links: []
            };
            nodeMap.set(id, node);
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
    }, [nodes, synapses, physics.scale, physics.spacing, physics.prismZ]);

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
                // 1. Get raw baseline (prevents drift)
                let v = Math.max(-1, Math.min(1, node.valence || 0));
                let a = Math.max(-1, Math.min(1, node.arousal || 0));

                // 2. Flipped Expansion Logic (Right = More Spread)
                const exp = 2.0 - (p.spacing || 1.0);
                v = Math.sign(v) * Math.pow(Math.abs(v), exp);
                a = Math.sign(a) * Math.pow(Math.abs(a), exp);

                // 3. Master Scale (Baseline 2000)
                const prismScale = (p.scale || 2000) / 4.5;
                targetX = v * prismScale;
                targetY = a * prismScale;

                // 4. Soul Stratification (Z-Axis)
                const zHeight = (p.prismZ || 0) * (prismScale * 0.4);
                targetZ = node.layerZ * zHeight;

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
                        // THE FIX: O(1) Map Lookup instead of O(N) Array Search
                        const neighborIndex = nodeIndexMap.get(linkId);
                        if (neighborIndex !== undefined) {
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

        const searchLower = searchQuery ? searchQuery.toLowerCase() : "";
        let targetV = 0, targetA = 0, matchCount = 0;

        // --- PASS 1: Find the Emotional Center of the Keyword ---
        if (searchLower && isPrismActive) {
            for (let i = 0; i < count; i++) {
                const n = nodes[i];
                const textData = `${n[8] || ""} ${n[11] || ""} ${n[12] || ""} ${n[13] || ""}`.toLowerCase();
                if (textData.includes(searchLower)) {
                    targetV += (n[9] || 0);
                    targetA += (n[10] || 0);
                    matchCount++;
                }
            }
            if (matchCount > 0) {
                targetV /= matchCount;
                targetA /= matchCount;
            }
        }

        // --- PASS 2: Apply Coordinates, Colors, and Polarity ---
        for (let i = 0; i < count; i++) {
            const n = nodes[i];
            posArr[i * 3] = n[1];
            posArr[i * 3 + 1] = n[2];
            posArr[i * 3 + 2] = n[3];

            const val = n[9] || 0;
            const aro = n[10] || 0;
            let r, g, b;

            // 1. CONTINUOUS NEBULA COLORS (Matches the UI Pad exactly)
            if (viewMode === 'PRISM') {
                // Map -1.0 -> 1.0 scale to a 0.0 -> 1.0 scale for color math
                const nV = (val + 1) / 2;
                const nA = (aro + 1) / 2;

                // Cosmic Blending Math
                r = nA * 1.5 + (1 - nV) * 0.5;
                g = nV * 1.2 + nA * 0.3;
                b = 1.5 - (nA * 0.5) + (1 - nV) * 0.8;

                // Clamp to prevent blowout
                r = Math.min(2.0, Math.max(0.1, r));
                g = Math.min(2.0, Math.max(0.1, g));
                b = Math.min(2.0, Math.max(0.1, b));
            } else {
                const intensity = n[7] > 2.0 ? 2.0 : 1.0;
                r = (n[4] / 255) * intensity;
                g = (n[5] / 255) * intensity;
                b = (n[6] / 255) * intensity;
            }

            // 2. PRISM FILTRATION & HIGHLIGHTS
            if (isPrismActive) {
                let resonance = 0.02; // DEEP dim for the background (2% opacity)
                let isMatch = false;

                if (searchLower) {
                    const textData = `${n[8] || ""} ${n[11] || ""} ${n[12] || ""} ${n[13] || ""}`.toLowerCase();

                    if (textData.includes(searchLower)) {
                        // DIRECT MATCH: Pure Bright White/Gold to pop off the screen
                        resonance = 2.0;
                        r = 2.0; g = 2.0; b = 1.8;
                        isMatch = true;
                    }
                    else if (matchCount > 0) {
                        // INVERSE MATCH: Tight laser spotlight on the opposite side
                        const invV = targetV * -1;
                        const invA = targetA * -1;
                        const distToInverse = Math.sqrt(Math.pow(val - invV, 2) + Math.pow(aro - invA, 2));

                        if (distToInverse < 0.25) { // Tightened from 0.6
                            const intensity = 1.0 - (distToInverse / 0.25);
                            resonance = 0.1 + (intensity * 2.0);
                            // Keeps its natural nebula color, just glows brighter
                        }
                    }
                } else {
                    // AFFECTIVE SONAR (The Puck Flashlight)
                    const dist = Math.sqrt(Math.pow(val - prismVector.x, 2) + Math.pow(aro - prismVector.y, 2));
                    if (dist < 0.25) { // Tightened from 0.6
                        const intensity = 1.0 - (dist / 0.25);
                        resonance = 0.1 + (intensity * 2.5);
                        // Keeps its natural nebula color, just glows brighter
                    }
                }

                // Apply dimming if it wasn't specifically highlighted
                if (!isMatch) {
                    r *= resonance;
                    g *= resonance;
                    b *= resonance;
                }
            }

            colArr[i * 3] = r;
            colArr[i * 3 + 1] = g;
            colArr[i * 3 + 2] = b;
        }
        return { positions: posArr, colors: colArr };
    }, [nodes, viewMode, searchQuery, prismVector, isPrismActive]);

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

    // THE FIX: Memoize the massive coordinate array so WebGL doesn't rebuild it on hover
    const positions = useMemo(() => {
        return new Float32Array(synapses.length * 6);
    }, [synapses.length]);

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
                <bufferAttribute attach="attributes-position" count={synapses.length * 2} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-color" count={colors.length / 3} array={colors} itemSize={3} />
            </bufferGeometry>
            <lineBasicMaterial vertexColors={true} transparent={true} opacity={0.15} blending={THREE.AdditiveBlending} depthWrite={false} />
        </lineSegments>
    );
};

// --- PRISM QUERY PANEL (The Diagnostic Dashboard) ---
const PrismQueryPanel = ({ searchQuery, setSearchQuery, prismVector, setPrismVector, isPrismActive, setIsPrismActive }) => {
    const padRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);

    // Translates Mouse X/Y to Valence/Arousal (-1.0 to 1.0)
    const handlePointerEvent = (e) => {
        if (!padRef.current) return;
        const rect = padRef.current.getBoundingClientRect();

        // Clamp values to stay inside the box
        let x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        let y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

        // Convert to -1.0 to 1.0 scale
        // Valence: Left (-1) to Right (+1)
        const valence = ((x / rect.width) * 2) - 1;
        // Arousal: Bottom (-1) to Top (+1) -> Note: Y is inverted in DOM
        const arousal = (((rect.height - y) / rect.height) * 2) - 1;

        setPrismVector({ x: valence, y: arousal });
        setIsPrismActive(true);
    };

    return (
        <div className="absolute bottom-8 right-8 z-20 w-80 bg-slate-900/95 border border-cyan-500/30 rounded-2xl p-4 backdrop-blur-xl shadow-[0_0_30px_rgba(8,145,178,0.2)] animate-fade-in-up">

            {/* 1. SEMANTIC POLARIZER (Search) */}
            <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                        <Search size={12} /> Semantic Query
                    </h3>
                    <button
                        onClick={() => { setSearchQuery(""); setIsPrismActive(false); }}
                        className="text-[9px] text-slate-500 hover:text-rose-400 uppercase font-bold transition"
                    >
                        Clear
                    </button>
                </div>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                        setSearchQuery(e.target.value);
                        if (e.target.value.trim() !== "") setIsPrismActive(true);
                    }}
                    placeholder="Search Ethos, Mythos, Emotion..."
                    className="w-full bg-slate-950/50 border border-white/10 rounded-lg p-2.5 text-xs text-cyan-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
                />
            </div>

            {/* 2. AFFECTIVE SONAR (X/Y Pad) */}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">
                        <Target size={12} /> Affective Sonar
                    </h3>
                    <div className="text-[9px] font-mono text-slate-400">
                        V: {prismVector.x.toFixed(2)} | A: {prismVector.y.toFixed(2)}
                    </div>
                </div>

                {/* THE PAD */}
                <div
                    ref={padRef}
                    className="relative w-full h-48 rounded-xl border border-white/10 overflow-hidden cursor-crosshair shadow-inner group"
                    style={{
                        // Hermetic Cosmic Gradient (Purple -> Blue -> Gold)
                        background: 'radial-gradient(circle at top right, rgba(250, 204, 21, 0.4), transparent 60%), radial-gradient(circle at bottom left, rgba(56, 189, 248, 0.4), transparent 60%), radial-gradient(circle at center, rgba(147, 51, 234, 0.5), transparent 100%), #0f172a'
                    }}
                    onPointerDown={(e) => { setIsDragging(true); handlePointerEvent(e); }}
                    onPointerMove={(e) => { if (isDragging) handlePointerEvent(e); }}
                    onPointerUp={() => setIsDragging(false)}
                    onPointerLeave={() => setIsDragging(false)}
                >
                    {/* Grid Overlay */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:16.66%_16.66%] pointer-events-none" />

                    {/* Axis Labels */}
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 text-[8px] text-white/30 uppercase font-bold pointer-events-none tracking-widest">Arousal</span>
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-white/30 uppercase font-bold pointer-events-none tracking-widest">Valence</span>

                    {/* THE PUCK */}
                    <div
                        className="absolute w-6 h-6 -ml-3 -mb-3 rounded-full border-2 border-white bg-white/20 backdrop-blur-md shadow-[0_0_15px_rgba(255,255,255,0.8)] pointer-events-none transition-transform duration-75"
                        style={{
                            left: `${((prismVector.x + 1) / 2) * 100}%`,
                            bottom: `${((prismVector.y + 1) / 2) * 100}%`,
                            boxShadow: isPrismActive ? '0 0 20px rgba(255,255,255,0.9), inset 0 0 10px rgba(255,255,255,0.5)' : '0 0 10px rgba(255,255,255,0.2)'
                        }}
                    >
                        <div className="absolute inset-1 bg-white rounded-full animate-pulse" />
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- 3. MAIN COMPONENT ---
const TitanGraph = ({ workerEndpoint, onClose }) => {
    const [nodes, setNodes] = useState([]);
    const [synapses, setSynapses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showControls, setShowControls] = useState(true);

    // --- PRISM ENGINE STATE ---
    const [searchQuery, setSearchQuery] = useState("");
    const [prismVector, setPrismVector] = useState({ x: 0, y: 0 });
    const [isPrismActive, setIsPrismActive] = useState(false);

    // --- HUD & BLEND CONTROLS ---
    const [uiVisible, setUiVisible] = useState(true);
    const [showTopMenu, setShowTopMenu] = useState(false);
    const [showBlendControls, setShowBlendControls] = useState(false);
    const [blendConfig, setBlendConfig] = useState({ near: 2000, far: 12000 });

    const [isLive, setIsLive] = useState(true);
    const [viewMode, setViewMode] = useState('SYNAPTIC');
    const [showSynapses, setShowSynapses] = useState(true);
    const [physics, setPhysics] = useState({
        spacing: 2.0,
        clusterStrength: 2.0,
        scale: 2000,
        prismZ: 0.0 // <--- ADD THIS: Initialized to 0
    });

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

    const handleRegen = async () => {
        try {
            setLoading(true);
            // 1. Tell Python to start crunching numbers
            const res = await fetch(`${workerEndpoint}admin/recalculate_map`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(physics) // Send current sliders as config
            });

            const data = await res.json();

            if (data.status === "SUCCESS") {
                // 2. Wait a moment for the DB to update, then reload
                setTimeout(() => {
                    loadCortex();
                }, 2000);
            } else {
                console.error("Regen failed:", data);
                setLoading(false);
            }
        } catch (e) {
            console.error("Trigger Error:", e);
            setLoading(false);
        }
    };

    useEffect(() => { loadCortex(); }, []);

    const activeNode = selectedNode || hoveredNode;
    const isPinned = !!selectedNode;

    return (
        <div
            className="fixed inset-0 z-[100] bg-slate-950 animate-fade-in cursor-crosshair font-mono bg-cover bg-center"
            style={{
                backgroundImage: `linear-gradient(to bottom, rgba(2, 6, 23, 0.7), rgba(2, 6, 23, 0.95)), url('/titan/titan_bg.jpg')`
            }}
        >
            <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-10 pointer-events-none">
                <div className="pointer-events-auto">
                    <h1 className="text-xl font-bold text-white tracking-widest uppercase flex items-center gap-2">
                        <Zap size={18} className="text-cyan-400" /> Cortex Visualizer
                    </h1>
                    <p className="text-[10px] text-cyan-500/60 mt-1">
                        NODES: {nodes.length} | MODE: {viewMode} | ENGINE: GEOMETRIC (v2)
                    </p>
                </div>
                <div className="flex gap-2 pointer-events-auto relative">
                    <button
                        onClick={() => setShowTopMenu(!showTopMenu)}
                        className="px-3 py-1.5 bg-slate-900/80 border border-white/10 text-slate-300 hover:text-white text-[10px] font-bold rounded transition flex items-center gap-2 backdrop-blur-md"
                    >
                        <MoreVertical size={12} /> MENU
                    </button>

                    {/* DROPDOWN MENU */}
                    {showTopMenu && (
                        <div className="absolute right-20 top-full mt-2 w-48 bg-slate-900/95 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl animate-fade-in-up">
                            <button onClick={() => { handleRegen(); setShowTopMenu(false); }} className="w-full text-left px-4 py-3 text-[10px] uppercase tracking-widest hover:bg-white/5 flex items-center gap-3 border-b border-white/5 transition text-cyan-400 font-bold">
                                <RefreshCw size={12} /> REFRESH MAP
                            </button>
                            <button onClick={() => { setShowBlendControls(!showBlendControls); setShowTopMenu(false); }} className="w-full text-left px-4 py-3 text-[10px] uppercase tracking-widest hover:bg-white/5 flex items-center gap-3 border-b border-white/5 transition text-slate-300">
                                <Cloud size={12} /> DEPTH BLENDING
                            </button>
                            <button onClick={() => { setUiVisible(!uiVisible); setShowTopMenu(false); }} className="w-full text-left px-4 py-3 text-[10px] uppercase tracking-widest hover:bg-white/5 flex items-center gap-3 transition text-slate-300">
                                {uiVisible ? <EyeOff size={12} /> : <Eye size={12} />} {uiVisible ? "HIDE UI HUD" : "SHOW UI HUD"}
                            </button>
                        </div>
                    )}

                    <button onClick={onClose} className="px-3 py-1.5 bg-red-950/30 border border-red-500/30 text-red-400 text-[10px] font-bold rounded hover:bg-red-900/50 transition flex items-center gap-1 backdrop-blur-md">
                        <X size={12} /> CLOSE
                    </button>
                </div>
            </div>

            {uiVisible && (
                <div className={`absolute bottom-8 left-8 z-20 w-72 bg-slate-900/95 border border-white/10 rounded-xl p-4 backdrop-blur-md transition-all shadow-2xl ${showControls ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-10'}`}>                <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
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
                            < div className="space-y-3 pt-2 border-t border-white/5">
                                {/* 1. SCALE (The one I missed!) */}
                                <div>
                                    <div className="flex justify-between text-[10px] text-emerald-400 mb-1 uppercase">
                                        <span>Prism Scale</span><span>{physics.scale}</span>
                                    </div>
                                    <input
                                        type="range" min="500" max="5000" step="100"
                                        value={physics.scale}
                                        onChange={(e) => setPhysics({ ...physics, scale: parseFloat(e.target.value) })}
                                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                    />
                                </div>

                                {/* 2. EXPANSION (Flipped Logic) */}
                                <div>
                                    <div className="flex justify-between text-[10px] text-cyan-400 mb-1 uppercase">
                                        <span>Core Expansion</span><span>{physics.spacing}</span>
                                    </div>
                                    <input
                                        type="range" min="0.1" max="2" step="0.05"
                                        value={physics.spacing}
                                        onChange={(e) => setPhysics({ ...physics, spacing: parseFloat(e.target.value) })}
                                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                    />
                                </div>

                                {/* 3. SOUL LAYERS */}
                                <div>
                                    <div className="flex justify-between text-[10px] text-purple-400 mb-1 uppercase">
                                        <span>Soul Stratification</span><span>{physics.prismZ}</span>
                                    </div>
                                    <input
                                        type="range" min="0" max="5.0" step="0.1"
                                        value={physics.prismZ}
                                        onChange={(e) => setPhysics({ ...physics, prismZ: parseFloat(e.target.value) })}
                                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                    />
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
            )}

            {
                activeNode && (
                    <div className={`absolute top-24 left-1/2 -translate-x-1/2 z-20 max-w-sm w-full transition-all duration-300 ${isPinned ? 'pointer-events-auto' : 'pointer-events-none'}`}>
                        <div className={`bg-slate-900/95 border backdrop-blur-xl rounded-xl p-5 shadow-2xl relative ${isPinned ? 'border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.2)]' : 'border-cyan-500/30'}`}>
                            {isPinned && <button onClick={() => setSelectedNode(null)} className="absolute top-2 right-2 text-slate-500 hover:text-white transition bg-black/20 p-1 rounded-full"><X size={14} /></button>}

                            <div className="flex flex-col items-center text-center">
                                {/* HEADER */}
                                <div className={`text-[10px] font-bold tracking-[0.2em] uppercase mb-3 flex items-center gap-2 ${isPinned ? 'text-cyan-300' : 'text-cyan-500'}`}>
                                    {isPinned ? <Lock size={12} /> : <Unlock size={12} />}
                                    {isPinned ? "SIGNAL LOCKED" : "NODE SIGNAL"}
                                </div>

                                {/* 1. DESCRIPTION (Static Text - No Click to Copy) */}
                                <div className="text-base text-white font-light italic leading-relaxed mb-4">
                                    "{activeNode.label || activeNode[8] || 'Unknown'}"
                                </div>

                                {/* 2. EMOTION GRID */}
                                {activeNode.emotion && activeNode.emotion !== "neutral" && (
                                    <div className="grid grid-cols-2 gap-2 w-full mb-3">
                                        <div
                                            onClick={() => navigator.clipboard.writeText(activeNode.emotion)}
                                            className="bg-black/30 rounded p-2 border border-white/5 flex flex-col items-center cursor-pointer hover:bg-white/10 transition active:scale-95"
                                            title="Click to Copy"
                                        >
                                            <div className="text-[8px] uppercase text-slate-500">Emotion</div>
                                            <div className="text-xs text-purple-300 font-bold uppercase">{activeNode.emotion}</div>
                                        </div>
                                        <div
                                            onClick={() => navigator.clipboard.writeText(`V:${typeof activeNode.valence === 'number' ? activeNode.valence.toFixed(2) : '0.00'} A:${typeof activeNode.arousal === 'number' ? activeNode.arousal.toFixed(2) : '0.00'}`)}
                                            className="bg-black/30 rounded p-2 border border-white/5 flex flex-col items-center cursor-pointer hover:bg-white/10 transition active:scale-95"
                                            title="Click to Copy"
                                        >
                                            <div className="text-[8px] uppercase text-slate-500">Intensity</div>
                                            <div className="text-xs text-emerald-300 font-mono">
                                                V:{typeof activeNode.valence === 'number' ? activeNode.valence.toFixed(2) : '0.00'}
                                                A:{typeof activeNode.arousal === 'number' ? activeNode.arousal.toFixed(2) : '0.00'}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 3. SOUL DATA BADGES */}
                                {(activeNode.mythos || activeNode.ethos) && (
                                    <div className="flex gap-2 mb-4 w-full">
                                        {activeNode.mythos && (
                                            <div
                                                onClick={() => navigator.clipboard.writeText(activeNode.mythos)}
                                                className="flex-1 bg-indigo-950/50 border border-indigo-500/30 p-2 rounded text-center cursor-pointer hover:bg-indigo-900/50 transition active:scale-95"
                                                title="Click to Copy"
                                            >
                                                <div className="text-[8px] text-indigo-300 uppercase tracking-widest mb-1">Archetype</div>
                                                <div className="text-xs text-white font-bold">{activeNode.mythos}</div>
                                            </div>
                                        )}
                                        {activeNode.ethos && (
                                            <div
                                                onClick={() => navigator.clipboard.writeText(activeNode.ethos)}
                                                className="flex-1 bg-fuchsia-950/50 border border-fuchsia-500/30 p-2 rounded text-center cursor-pointer hover:bg-fuchsia-900/50 transition active:scale-95 overflow-hidden"
                                                title={activeNode.ethos}
                                            >
                                                <div className="text-[8px] text-fuchsia-300 uppercase tracking-widest mb-1">Ethos</div>
                                                <div className="text-[10px] text-white font-medium leading-tight max-h-24 overflow-y-auto pr-1 text-left scrollbar-hide">
                                                    {activeNode.ethos}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* FOOTER ID */}
                                <div
                                    onClick={() => navigator.clipboard.writeText(activeNode.id || String(activeNode[0] || ''))}
                                    className="w-full bg-black/40 rounded p-2 border border-white/5 text-left cursor-pointer hover:bg-white/10 transition active:scale-95"
                                    title="Click to Copy ID"
                                >
                                    <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Hologram ID:</div>
                                    <div className="text-[10px] text-cyan-400/80 font-mono break-all hover:text-cyan-300 transition">
                                        {activeNode.id || String(activeNode[0] || '')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
            {loading && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-cyan-500 font-mono animate-pulse">Initializing...</div>}

            {/* THE NEW DASHBOARD */}
            {uiVisible && !loading && (
                <PrismQueryPanel
                    searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                    prismVector={prismVector} setPrismVector={setPrismVector}
                    isPrismActive={isPrismActive} setIsPrismActive={setIsPrismActive}
                />
            )}

            {/* DEPTH BLENDING PANEL */}
            {uiVisible && showBlendControls && (
                <div className="absolute top-20 right-8 z-20 w-64 bg-slate-900/95 border border-white/10 rounded-xl p-4 backdrop-blur-md shadow-2xl animate-fade-in-up">
                    <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                        <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                            <Cloud size={12} /> Depth Blending
                        </h3>
                        <button onClick={() => setShowBlendControls(false)} className="text-slate-500 hover:text-rose-400 transition"><X size={12} /></button>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-[10px] text-slate-400 mb-1 uppercase tracking-widest">
                                <span>Fade Start</span><span className="font-mono text-cyan-400">{blendConfig.near}</span>
                            </div>
                            <input type="range" min="0" max="5000" step="50" value={blendConfig.near} onChange={(e) => setBlendConfig({ ...blendConfig, near: parseInt(e.target.value) })} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                        </div>
                        <div>
                            <div className="flex justify-between text-[10px] text-slate-400 mb-1 uppercase tracking-widest">
                                <span>Fade End</span><span className="font-mono text-purple-400">{blendConfig.far}</span>
                            </div>
                            <input type="range" min="1000" max="20000" step="100" value={blendConfig.far} onChange={(e) => setBlendConfig({ ...blendConfig, far: parseInt(e.target.value) })} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                        </div>
                    </div>
                </div>
            )}

            <Canvas camera={{ position: [0, 0, 2000], fov: 45, near: 0.1, far: 20000 }} onPointerMissed={() => setSelectedNode(null)}>
                {/* Canvas is now transparent to show the HTML background image */}
                <fog attach="fog" args={['#000000', blendConfig.near, blendConfig.far]} />
                <Stars radius={50000} depth={50} count={5000} factor={4} saturation={0} fade />
                {!loading && (
                    <group>
                        <NodeCloud
                            nodes={nodes} synapses={synapses} onHover={setHoveredNode}
                            onSelect={setSelectedNode} physics={physics} isLive={isLive}
                            viewMode={viewMode} simRef={simRef}
                            searchQuery={searchQuery} prismVector={prismVector} isPrismActive={isPrismActive}
                        />
                        <SynapseNetwork nodes={nodes} synapses={synapses} viewMode={viewMode} simRef={simRef} showSynapses={showSynapses} />
                    </group>
                )}
                <OrbitControls enablePan={true} enableZoom={true} autoRotate={false} />
            </Canvas>
        </div >
    );
};

export default TitanGraph;

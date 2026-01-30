import React, { useEffect, useState, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { Minimize2, Loader, Hexagon } from 'lucide-react';

const TitanGraph = ({ workerEndpoint, onClose }) => {
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);
    const fgRef = useRef();

    useEffect(() => {
        // Fetch the topology from the Backend
        fetch(`${workerEndpoint}graph`)
            .then(res => res.json())
            .then(data => {
                if (data.nodes && data.links) {
                    
                    // --- UPGRADE 1: THE HALO KILLER ---
                    // Create a Set of all IDs that are actually part of a link
                    const linkedIds = new Set();
                    data.links.forEach(l => {
                        // Handle both object refs and string IDs
                        const s = typeof l.source === 'object' ? l.source.id : l.source;
                        const t = typeof l.target === 'object' ? l.target.id : l.target;
                        linkedIds.add(s);
                        linkedIds.add(t);
                    });

                    // Only keep nodes that have a link OR are high-value "Core Memories"
                    const cleanNodes = data.nodes.filter(n => linkedIds.has(n.id) || n.val > 7);
                    
                    setGraphData({ nodes: cleanNodes, links: data.links });
                }
                setLoading(false);
            })
            .catch(err => {
                console.error("Titan Graph Link Failed:", err);
                setLoading(false);
            });
    }, [workerEndpoint]);

    useEffect(() => {
        if (fgRef.current) {
            // --- UPGRADE 2: THE BIG BANG (PHYSICS) ---
            
            // 1. Massive Repulsion: Push nodes apart aggressively (-800)
            fgRef.current.d3Force('charge').strength(-800);

            // 2. Loose Links: Let the connections be long and relaxed (150)
            fgRef.current.d3Force('link').distance(150);
            
            // 3. Center Gravity: Pull the whole cloud gently to the center (so it doesn't fly off screen)
            // Strength 0.05 is gentle.
            fgRef.current.d3Force('center').strength(0.05);
        }
    }, [graphData]); // Re-run if data changes

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col animate-fade-in">
            
            {/* --- HUD OVERLAY --- */}
            <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-[101] pointer-events-none">
                <div className="bg-black/40 backdrop-blur-md p-4 rounded-xl border border-cyan-500/20 pointer-events-auto shadow-[0_0_15px_rgba(6,182,212,0.1)]">
                    <h2 className="text-cyan-400 font-bold tracking-[0.2em] text-sm uppercase mb-1 flex items-center gap-2">
                         <Hexagon size={14} /> Neural Cartography
                    </h2>
                    <p className="text-slate-400 text-xs font-mono">
                        NODES: {graphData.nodes.length} | SYNAPSES: {graphData.links.length}
                    </p>
                </div>

                <button 
                    onClick={onClose}
                    className="pointer-events-auto bg-red-500/10 hover:bg-red-500/30 text-red-400 border border-red-500/30 p-2 rounded-lg transition-all backdrop-blur-md"
                >
                    <Minimize2 size={20} />
                </button>
            </div>

            {/* --- LOADING STATE --- */}
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center z-[100] pointer-events-none">
                    <div className="text-center">
                        <Loader size={48} className="animate-spin text-cyan-500 mb-4 mx-auto" />
                        <p className="text-cyan-300 font-mono text-xs uppercase tracking-widest animate-pulse">Constructing Geometry...</p>
                    </div>
                </div>
            )}

            {/* --- THE 3D ENGINE --- */}
            <div className="flex-1 cursor-move">
                <ForceGraph3D
                    ref={fgRef}
                    graphData={graphData}
                    backgroundColor="#020617" 
                    
                    // --- UPGRADE 3: WARMUP ---
                    // Calculate layout for 100 frames *before* showing it. 
                    // Prevents the "explosion" animation and starts stable.
                    warmupTicks={100} 
                    cooldownTicks={0}

                    // NODE STYLING
                    nodeLabel="name"
                    nodeColor={node => node.val > 8 ? "#ec4899" : "#06b6d4"} 
                    nodeVal={node => node.val} 
                    nodeOpacity={0.9}
                    nodeResolution={16}

                    // LINK STYLING
                    linkColor={() => "#4f46e5"} 
                    linkWidth={link => link.value * 0.5} 
                    linkOpacity={0.3}
                    linkDirectionalParticles={2} 
                    linkDirectionalParticleSpeed={0.005}
                    
                    // INTERACTION
                    onNodeClick={node => {
                        const distance = 40;
                        const distRatio = 1 + distance/Math.hypot(node.x, node.y, node.z);
                        fgRef.current.cameraPosition(
                            { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, 
                            node, 
                            3000
                        );
                    }}
                />
            </div>
        </div>
    );
};

export default TitanGraph;
import React, { useEffect, useState, useRef, useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { Minimize2, Maximize2, Loader } from 'lucide-react';

const TitanGraph = ({ workerEndpoint, onClose }) => {
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);
    const fgRef = useRef();

    useEffect(() => {
        // Fetch the topology from the Backend
        fetch(`${workerEndpoint}graph`)
            .then(res => res.json())
            .then(data => {
                // Backend returns {nodes: [], links: []}
                if (data.nodes && data.links) {
                    setGraphData(data);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error("Titan Graph Link Failed:", err);
                setLoading(false);
            });
    }, [workerEndpoint]);

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col animate-fade-in">
            
            {/* --- HUD OVERLAY --- */}
            <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-[101] pointer-events-none">
                <div className="bg-black/40 backdrop-blur-md p-4 rounded-xl border border-cyan-500/20 pointer-events-auto">
                    <h2 className="text-cyan-400 font-bold tracking-[0.2em] text-sm uppercase mb-1">Neural Cartography</h2>
                    <p className="text-slate-400 text-xs font-mono">
                        NODES: {graphData.nodes.length} | SYNAPSES: {graphData.links.length}
                    </p>
                </div>

                <button 
                    onClick={onClose}
                    className="pointer-events-auto bg-red-500/10 hover:bg-red-500/30 text-red-400 border border-red-500/30 p-2 rounded-lg transition-all"
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
                    backgroundColor="#020617" // Deep Space Slate
                    
                    // NODE STYLING
                    nodeLabel="name"
                    nodeColor={node => node.val > 8 ? "#ec4899" : "#06b6d4"} // Pink (Core) vs Cyan (Standard)
                    nodeVal={node => node.val} // Size based on 'weighted_score'
                    nodeOpacity={0.9}
                    nodeResolution={16}

                    // LINK STYLING
                    linkColor={() => "#4f46e5"} // Indigo Synapses
                    linkWidth={link => link.value * 0.5} // Thicker lines for stronger links
                    linkOpacity={0.2}
                    linkDirectionalParticles={2} // Little data packets flowing
                    linkDirectionalParticleSpeed={0.005}
                    
                    // INTERACTION
                    onNodeClick={node => {
                        // Fly to node on click
                        const distance = 40;
                        const distRatio = 1 + distance/Math.hypot(node.x, node.y, node.z);
                        fgRef.current.cameraPosition(
                            { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, // new pos
                            node, // lookAt ({ x, y, z })
                            3000  // ms transition duration
                        );
                    }}
                />
            </div>
        </div>
    );
};

export default TitanGraph;
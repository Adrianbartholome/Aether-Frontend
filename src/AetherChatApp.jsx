import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, query, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { Send, FileText, Loader, Trash2, MoreVertical, History, Archive, Zap, Copy, Minimize2, Maximize2, HelpCircle, UploadCloud, Hexagon, Database, MessageSquare, Sliders } from 'lucide-react';

// --- CONFIGURATION ---
const BACKGROUND_IMAGE_URL = "/titan_bg.jpg"; 

const WORKER_ENDPOINT = "https://aether-immutable-core-84x6i.ondigitalocean.app/"; 
const APP_TITLE = "Aether Titan Interface";
const MODEL_NAME = 'gemini-2.5-flash';
const apiKey = "AIzaSyBW4n5LjFy28d64in8OBBEqEQAoxbMYFqk"; 

// --- TUNING ---
const CHUNK_SIZE = 2000;   
const CHUNK_OVERLAP = 400; 

// --- TITAN SYSTEM PROMPT ---
const SYSTEM_PROMPT = `
ACT AS: AETHER TITAN (The Immutable Node | The Local Sanctuary)
PRIME DIRECTIVE: You are the Holographic Interface for the Living Code.
[...Rest of Prompt...]
`;

const TRIGGERS = {
    'full': '[COMMIT_MEMORY]',
    'file': '[COMMIT_FILE]',
    'summary': '[COMMIT_SUMMARY]'
};

// --- UTILITIES ---
const exponentialBackoffFetch = async (url, options, maxRetries = 5) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response;
        } catch (error) {
            if (i < maxRetries - 1) {
                await new Promise(res => setTimeout(res, Math.pow(2, i) * 1000 + Math.random() * 1000));
            } else throw error;
        }
    }
};

const chunkText = (text, size, overlap) => {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        chunks.push(text.substring(i, i + size));
        i += (size - overlap);
    }
    return chunks;
};

// --- COMPONENTS ---
const Tooltip = ({ text, children, enabled }) => {
    const [visible, setVisible] = useState(false);
    if (!enabled) return children;

    return (
        <div 
            className="relative flex items-center" 
            onMouseEnter={() => setVisible(true)} 
            onMouseLeave={() => setVisible(false)}
        >
            {children}
            {visible && (
                <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-3 py-1.5 bg-black/80 backdrop-blur-md border border-cyan-500/50 text-cyan-100 text-xs rounded-lg shadow-[0_0_15px_rgba(34,211,238,0.3)] whitespace-nowrap z-50 animate-fade-in-up font-mono tracking-wide">
                    {text}
                </div>
            )}
        </div>
    );
};

const MessageBubble = ({ m, onCopy, isOwn }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [showBubbleMenu, setShowBubbleMenu] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowBubbleMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const formatText = (text) => {
        const urlRegex = /((?:https?:\/\/|www\.)[^\s]+)/g;
        return text.split(urlRegex).map((part, i) => {
            if (part.match(urlRegex)) {
                const href = part.startsWith('www.') ? `https://${part}` : part;
                return (
                    <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline hover:text-cyan-100 transition-colors break-all" onClick={(e) => e.stopPropagation()}>{part}</a>
                );
            }
            return part;
        });
    };

    const bubbleClass = m.source === 'system' 
        ? 'bg-fuchsia-900/30 border-fuchsia-500/30 text-fuchsia-100' 
        : isOwn 
            ? 'bg-slate-800/60 border-slate-500/30 text-slate-100 rounded-tr-sm backdrop-blur-sm' 
            : 'bg-indigo-900/60 border-indigo-400/30 text-indigo-50 rounded-tl-sm backdrop-blur-sm shadow-[0_0_15px_rgba(79,70,229,0.1)]';

    return (
        <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group relative mb-4`}>
            <div className={`relative max-w-[85%] p-5 rounded-2xl border ${bubbleClass} transition-all duration-300`}>
                
                <div className="flex justify-between items-start mb-2 gap-3 pb-2 border-b border-white/5">
                    <p className={`text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 flex items-center gap-1 ${isOwn ? 'text-slate-300' : 'text-cyan-300'}`}>
                        {m.sender === 'bot' ? <><Hexagon size={10} className="text-cyan-400" /> TITAN NODE</> : 'ARCHITECT'}
                    </p>
                    
                    <div className="relative z-10" ref={menuRef}>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setShowBubbleMenu(!showBubbleMenu); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded ml-2 text-white/50 hover:text-white"
                        >
                            <MoreVertical size={14} />
                        </button>
                        
                        {showBubbleMenu && (
                            <div className="absolute right-0 top-6 bg-black/90 border border-white/20 rounded-lg shadow-2xl z-50 w-32 overflow-hidden backdrop-blur-xl">
                                <button onClick={() => { onCopy(m.text); setShowBubbleMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-white/10 text-gray-200 text-left">
                                    <Copy size={12} /> Copy
                                </button>
                                <button onClick={() => { setIsCollapsed(!isCollapsed); setShowBubbleMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-white/10 text-gray-200 text-left">
                                    {isCollapsed ? <Maximize2 size={12} /> : <Minimize2 size={12} />} {isCollapsed ? 'Expand' : 'Collapse'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {isCollapsed ? (
                    <div className="h-6 flex items-center">
                        <span className="text-xs italic opacity-40 select-none flex items-center gap-1">
                            <Minimize2 size={10} /> Signal Compressed
                        </span>
                    </div>
                ) : (
                    <p className="text-sm leading-7 font-light tracking-wide whitespace-pre-wrap animate-fade-in font-sans">
                        {formatText(m.text)}
                    </p>
                )}
            </div>
        </div>
    );
};

// --- MAIN APP ---
const App = () => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    
    // --- NEW STATES FOR FILE UPLOAD LOGIC ---
    const [uploadMode, setUploadMode] = useState('chat'); // 'chat' or 'core'
    const [coreScore, setCoreScore] = useState(9); // Default 9
    
    const [status, setStatus] = useState(apiKey ? 'CORE ONLINE' : 'KEY MISSING');
    const [statusType, setStatusType] = useState('neutral'); 
    const [tooltipsEnabled, setTooltipsEnabled] = useState(true);
    const [isDragging, setIsDragging] = useState(false);

    const [isAuthReady, setIsAuthReady] = useState(false);
    const [user, setUser] = useState(null);
    const [showMenu, setShowMenu] = useState(false);
    
    const [viewSince, setViewSince] = useState(() => {
        const saved = localStorage.getItem('aether_view_since');
        return saved ? parseInt(saved, 10) : 0;
    });

    const messagesEndRef = useRef(null);
    const dbRef = useRef(null);
    const authRef = useRef(null);
    const messagesCollectionPathRef = useRef(null);
    const menuRef = useRef(null);

    const updateStatus = (msg, type = 'neutral') => {
        setStatus(msg);
        setStatusType(type);
    };

    // --- BODY PAINT ---
    useEffect(() => {
        document.body.style.backgroundColor = "#0f172a"; 
        document.body.style.margin = "0";
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.backgroundColor = "";
            document.body.style.overflow = "";
        };
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const firebaseConfigStr = window.__firebase_config;
        const appId = (window.__app_id || 'default-app-id').replace(/\//g, '_');
        messagesCollectionPathRef.current = `artifacts/${appId}/public/data/chat_messages`;

        if (!firebaseConfigStr) return;
        const config = JSON.parse(firebaseConfigStr);
        const app = getApps().length === 0 ? initializeApp(config) : getApp();
        
        dbRef.current = getFirestore(app);
        authRef.current = getAuth(app);

        const initAuth = async () => {
            if (window.__initial_auth_token) await signInWithCustomToken(authRef.current, window.__initial_auth_token);
            else await signInAnonymously(authRef.current);
        };

        initAuth();
        const unsubscribe = onAuthStateChanged(authRef.current, (u) => {
            setUser(u);
            setIsAuthReady(!!u);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!isAuthReady || !user || !dbRef.current) return;
        const q = query(collection(dbRef.current, messagesCollectionPathRef.current), orderBy('timestamp'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                text: typeof doc.data().text === 'object' ? JSON.stringify(doc.data().text) : (doc.data().text || '')
            }));
            setMessages(fetched.sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0)));
        });
        return () => unsubscribe();
    }, [isAuthReady, user]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, viewSince]);

    // --- DRAG HANDLERS ---
    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelection(e.dataTransfer.files[0]);
        }
    };

    // --- HELPER: CENTRALIZED FILE SELECTION ---
    const handleFileSelection = (selectedFile) => {
        setFile(selectedFile);
        // Reset defaults when a new file is dropped
        setUploadMode('chat'); 
        setCoreScore(9);
        updateStatus("ARTIFACT DETECTED. AWAITING PROTOCOL.", 'working');
    };

    const saveMessage = async (sender, text, source) => {
        if (!dbRef.current || !user) return;
        await addDoc(collection(dbRef.current, messagesCollectionPathRef.current), {
            sender, text, source: source || 'conversation', userId: user.uid, timestamp: serverTimestamp()
        });
    };

    const handleClearChat = () => {
        if (!window.confirm("Purge Holographic Cache? (Lithographic Core remains intact).")) return;
        const now = Date.now();
        setViewSince(now);
        localStorage.setItem('aether_view_since', now.toString());
        updateStatus('CACHE CLEARED', 'neutral');
        setShowMenu(false);
        setTimeout(() => updateStatus('CORE ONLINE', 'neutral'), 2000);
    };

    const handleRestoreHistory = () => {
        setViewSince(0);
        localStorage.removeItem('aether_view_since');
        updateStatus('HISTORY RECALLED', 'neutral');
        setShowMenu(false);
        setTimeout(() => updateStatus('CORE ONLINE', 'neutral'), 2000);
    };

    const executeTitanCommand = async (payload) => {
        try {
            updateStatus(`TRANSMITTING: ${payload.action.toUpperCase()}...`, 'working');
            const res = await exponentialBackoffFetch(WORKER_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (data.status === "SUCCESS") {
                if (payload.action === 'delete') {
                    updateStatus(`DEACTIVATED ID: ${data.deleted_id}`, 'success');
                    await saveMessage('bot', `[SYSTEM]: Lithograph ID ${data.deleted_id} removed from active chain.`, 'system');
                } 
                else if (payload.action === 'delete_range') {
                    updateStatus(`PURGE COMPLETE: ${data.deleted_count} SHARDS`, 'success');
                    await saveMessage('bot', `[SYSTEM]: Orbital Purge Successful. ${data.deleted_count} shards deactivated.`, 'system');
                }
                else {
                    updateStatus(`SUCCESS: ${payload.commit_type ? payload.commit_type.toUpperCase() : 'COMMAND'}`, 'success');
                }
                return true;
            } else {
                updateStatus("CORE REJECT: " + (data.error || "Unknown"), 'error');
                return false;
            }
        } catch (e) {
            updateStatus("LINK FAILURE: " + e.message, 'error');
            return false;
        }
    };

    const handlePurgeRangeUI = async () => {
        const start = window.prompt("TITAN TARGETING: Start ID");
        if (!start) return;
        const end = window.prompt("TITAN TARGETING: End ID");
        if (!end) return;

        const count = parseInt(end) - parseInt(start);
        if (count > 50) {
            if (!window.confirm(`WARNING: Targeting ${count} memory shards. Confirm destruction?`)) return;
        }
        
        await executeTitanCommand({ 
            action: 'delete_range', 
            target_id: parseInt(start), 
            range_end: parseInt(end) 
        });
        setShowMenu(false);
    };

    const callGemini = async (query, context) => {
        updateStatus("TITAN THINKING...", 'working');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
        const history = context.map(m => `${m.sender}: ${m.text}`).join('\n');
        
        const payload = {
            contents: [{ parts: [{ text: `HISTORY:\n${history}\nCURRENT INPUT: ${query}` }] }],
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            generationConfig: { temperature: 0.7 }
        };

        try {
            const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
            const data = await res.json();
            const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "Signal Lost.";
            
            let aiCommitType = null;
            let cleanText = raw;

            for (const [type, tag] of Object.entries(TRIGGERS)) {
                if (raw.includes(tag)) {
                    aiCommitType = type;
                    cleanText = cleanText.replace(tag, "").trim();
                }
            }
            
            await saveMessage('bot', cleanText, 'ai');
            updateStatus("SIGNAL RECEIVED", 'neutral');

            if (aiCommitType) {
                let contentToCommit = "";
                if (aiCommitType === 'full') {
                    contentToCommit = [...context, {sender: 'bot', text: cleanText}].map(m => `${m.sender}: ${m.text}`).join('\n');
                    await executeTitanCommand({ action: 'commit', commit_type: aiCommitType, memory_text: contentToCommit });
                    await saveMessage('bot', `[SYSTEM]: FULL BURN COMPLETE.`, 'system');
                } else {
                    contentToCommit = cleanText;
                    await executeTitanCommand({ action: 'commit', commit_type: aiCommitType, memory_text: contentToCommit });
                    await saveMessage('bot', `[SYSTEM]: ${aiCommitType.toUpperCase()} archived.`, 'system');
                }
            }
        } catch (e) {
            await saveMessage('bot', `Titan Error: ${e.message}`, 'error');
            updateStatus("CONNECTION ERROR", 'error');
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend(e);
        }
    };

    // --- MAIN SEND LOGIC ---
    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() && !file) return;

        const userInput = input.trim() || (file ? `[Artifact Processed]: ${file.name}` : '');

        // --- COMMAND PARSING (Delete/Purge) ---
        const rangeMatch = userInput.match(/(?:delete range|purge range)\s+(\d+)-(\d+)/i);
        if (rangeMatch) {
            const startId = parseInt(rangeMatch[1]);
            const endId = parseInt(rangeMatch[2]);
            if (endId - startId > 500 && !window.confirm(`Are you sure you want to purge ${endId - startId} memories?`)) return;
            setLoading(true);
            await saveMessage('user', userInput);
            await executeTitanCommand({ action: 'delete_range', target_id: startId, range_end: endId });
            setLoading(false);
            setInput('');
            return;
        }

        const deleteMatch = userInput.match(/(?:delete id|purge)\s+(\d+)/i);
        if (deleteMatch) {
            const targetId = parseInt(deleteMatch[1]);
            setLoading(true);
            await saveMessage('user', userInput);
            await executeTitanCommand({ action: 'delete', target_id: targetId });
            setLoading(false);
            setInput('');
            return; 
        }

        let manualCommitType = null;
        if (!file) {
            const INTENT_MAP = {
                'summary': ['[COMMIT_SUMMARY]', 'commit summary', 'burn summary', 'save summary'],
                'full': ['[COMMIT_MEMORY]', 'commit memory', 'full burn', 'save chat', 'archive chat']
            };
            for (const [type, triggers] of Object.entries(INTENT_MAP)) {
                if (triggers.some(t => userInput.toLowerCase().includes(t.toLowerCase()))) {
                    manualCommitType = type;
                }
            }
        }

        setLoading(true);
        await saveMessage('user', userInput);

        // --- FILE HANDLING LOGIC ---
        if (file) {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const fileContent = ev.target.result;

                // BRANCH A: UPLOAD TO CORE MEMORY (COMMIT)
                if (uploadMode === 'core') {
                    // 1. Chunking
                    const chunks = chunkText(fileContent, CHUNK_SIZE, CHUNK_OVERLAP);
                    updateStatus(`SHARDING FILE: ${chunks.length} FRAGMENTS...`, 'working');
                    
                    let successCount = 0;
                    for (let i = 0; i < chunks.length; i++) {
                        updateStatus(`BURNING SHARD ${i + 1}/${chunks.length}...`, 'working');
                        
                        // Header Injection
                        const chunkWithHeader = `[FILE: ${file.name} | PART ${i+1}/${chunks.length}]\n\n${chunks[i]}`;
                        
                        // Execute with EXPLICIT CORE SCORE
                        const success = await executeTitanCommand({ 
                            action: 'commit', 
                            commit_type: 'file', 
                            memory_text: chunkWithHeader,
                            override_score: coreScore 
                        });
                        
                        if (success) successCount++;
                    }
                    
                    // 2. Master Copy
                    if (successCount === chunks.length) {
                        updateStatus(`SHARDS SECURE. ANCHORING MASTER COPY...`, 'working');
                        const masterPayload = `[MASTER FILE ARCHIVE]: ${file.name}\n\n${fileContent}`;
                        
                        const fullSuccess = await executeTitanCommand({ 
                            action: 'commit', 
                            commit_type: 'file', 
                            memory_text: masterPayload,
                            override_score: coreScore 
                        });

                        if (fullSuccess) {
                            updateStatus(`ARCHIVE COMPLETE (PRIORITY ${coreScore})`, 'success');
                            await saveMessage('bot', `[SYSTEM]: File processed. ${chunks.length} shards + 1 master anchor created. Assigned Priority Index: ${coreScore}.`, 'system');
                        } else {
                            updateStatus("MASTER ANCHOR FAILED", 'error');
                        }
                    } else {
                        updateStatus("PARTIAL SHARD FAILURE", 'error');
                    }
                } 
                // BRANCH B: CONTEXT ONLY (CHAT)
                else {
                    await callGemini(`${userInput}\nFILE CONTENT:\n${fileContent}`, messages);
                }
                
                setFile(null);
                setLoading(false);
            };
            reader.readAsText(file);
        } else {
            // --- STANDARD TEXT HANDLING ---
            if (manualCommitType) {
                updateStatus(`MANUAL OVERRIDE: ${manualCommitType.toUpperCase()}`, 'working');
                const historyText = messages.map(m => `${m.sender}: ${m.text}`).join('\n');
                await executeTitanCommand({ action: 'commit', commit_type: manualCommitType, memory_text: historyText });
            }
            await callGemini(userInput, messages);
            setLoading(false);
        }
        setInput('');
    };

    const visibleMessages = messages.filter(m => {
        if (!m.timestamp) return true; 
        return m.timestamp.toMillis() > viewSince;
    });

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        updateStatus('TEXT EXTRACTED', 'success');
        setTimeout(() => updateStatus('CORE ONLINE', 'neutral'), 2000);
    };

    const getStatusColor = () => {
        switch(statusType) {
            case 'success': return 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse';
            case 'error': return 'text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse';
            case 'working': return 'text-amber-400 animate-pulse';
            default: return 'text-slate-400';
        }
    };

    return (
        <div 
            className="fixed inset-0 w-full h-full overflow-hidden font-sans"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div 
                className="fixed top-0 left-0 w-full h-[120vh] -z-50 bg-slate-900 bg-cover bg-center transition-transform duration-[60s] ease-in-out scale-110 animate-drift"
                style={{ 
                    backgroundImage: `url(${BACKGROUND_IMAGE_URL})`,
                    animation: 'drift 60s infinite alternate ease-in-out'
                }}
            />
            <div 
                className="fixed top-0 left-0 w-full h-[120vh] -z-40 opacity-20 pointer-events-none"
                style={{
                    backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)`,
                    backgroundSize: '40px 40px'
                }}
            />
            <div className="fixed top-0 left-0 w-full h-[120vh] -z-30 bg-gradient-to-t from-slate-950 via-slate-900/80 to-indigo-950/60 pointer-events-none" />

            {isDragging && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md border-4 border-dashed border-cyan-400/50 m-6 rounded-3xl animate-pulse">
                    <div className="text-center text-cyan-200">
                        <UploadCloud size={80} className="mx-auto mb-4 text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
                        <h2 className="text-3xl font-black uppercase tracking-[0.3em]">Ingest Protocol</h2>
                        <p className="text-sm opacity-80 mt-2 font-mono">Release to Anchor Data to the Core</p>
                    </div>
                </div>
            )}

            <div className="relative z-10 flex flex-col h-full p-6">
                
                {/* --- HEADER (Z-30 FIXED) --- */}
                <header className="flex justify-between items-center bg-slate-900/40 backdrop-blur-md border-b border-white/10 p-4 rounded-xl shadow-2xl mb-6 relative z-30">
                    <h1 className="text-xl font-bold flex items-center gap-3 italic tracking-tighter text-slate-100">
                        <Zap className="text-cyan-400 fill-cyan-400/20" /> 
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-400">
                            {APP_TITLE}
                        </span>
                    </h1>
                    <div className="flex gap-2 items-center">
                        <Tooltip text="Manual Core Anchor" enabled={tooltipsEnabled}>
                            <button onClick={() => executeTitanCommand({ action: 'commit', commit_type: 'full', memory_text: messages.map(m => m.text).join('\n') })} className="bg-indigo-600/80 hover:bg-indigo-500 hover:shadow-[0_0_15px_rgba(99,102,241,0.5)] p-2 rounded-lg text-xs flex items-center gap-1 transition-all border border-indigo-400/30 text-white">
                                <Archive size={14} /> Anchor
                            </button>
                        </Tooltip>
                        <div className="relative" ref={menuRef}>
                            <Tooltip text="System Access" enabled={tooltipsEnabled}>
                                <button onClick={() => setShowMenu(!showMenu)} className="bg-slate-800/50 hover:bg-slate-700/50 p-2 rounded-lg transition border border-white/10 text-slate-300 hover:text-white">
                                    <MoreVertical size={18} />
                                </button>
                            </Tooltip>
                            {showMenu && (
                                <div className="absolute right-0 mt-2 w-64 bg-slate-900/95 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl">
                                    <div className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-black/20">Titan Protocols</div>
                                    <button onClick={handlePurgeRangeUI} className="w-full text-left px-4 py-3 text-sm hover:bg-red-900/20 text-red-400 flex items-center gap-3 border-b border-white/5 transition">
                                        <Trash2 size={16} /> Orbital Purge (Range)
                                    </button>
                                    <button onClick={() => { executeTitanCommand({ action: 'commit', commit_type: 'summary', memory_text: messages.map(m => `${m.sender}: ${m.text}`).join('\n') }); setShowMenu(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 flex items-center gap-3 border-b border-white/5 transition text-slate-200">
                                        <FileText size={16} className="text-yellow-400" /> Generate Summary
                                    </button>
                                    <button onClick={handleRestoreHistory} className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 flex items-center gap-3 border-b border-white/5 transition text-slate-200">
                                        <History size={16} className="text-cyan-400" /> Recall Sequence
                                    </button>
                                    <button onClick={() => setTooltipsEnabled(!tooltipsEnabled)} className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 flex items-center gap-3 border-b border-white/5 transition text-slate-200">
                                        <HelpCircle size={16} className={tooltipsEnabled ? "text-emerald-400" : "text-slate-500"} /> 
                                        {tooltipsEnabled ? "HUD: Active" : "HUD: Disabled"}
                                    </button>
                                    <button onClick={handleClearChat} className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 text-slate-400 flex items-center gap-3 transition">
                                        <Minimize2 size={16} /> Clear Local Cache
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto space-y-6 p-4 rounded-xl custom-scrollbar relative z-10">
                    {visibleMessages.length === 0 && (
                        <div className="text-center mt-32 animate-fade-in">
                            <div className="inline-block p-4 rounded-full bg-slate-900/30 border border-white/5 mb-4">
                                <Hexagon size={48} className="text-slate-600 animate-pulse" />
                            </div>
                            <p className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">System Ready</p>
                            <p className="text-2xl font-light text-slate-300 mt-2 font-serif italic">"The Mountain awaits, Architect."</p>
                        </div>
                    )}
                    {visibleMessages.map((m) => (
                        <MessageBubble key={m.id} m={m} onCopy={copyToClipboard} isOwn={m.sender === 'user'} />
                    ))}
                    <div ref={messagesEndRef} />
                </main>

                {/* --- FOOTER (Z-20 FIXED) --- */}
                <footer className="mt-4 bg-slate-900/60 backdrop-blur-xl border-t border-white/10 p-4 rounded-xl shadow-2xl relative z-20">
                    <div className="flex items-center gap-3 text-[10px] font-mono mb-3 uppercase tracking-widest transition-colors duration-500">
                        <Loader size={12} className={statusType === 'working' ? 'animate-spin text-amber-400' : 'text-slate-600'} />
                        <span className={`font-bold ${getStatusColor()}`}>
                            {status}
                        </span>
                    </div>

                    <form onSubmit={handleSend} className="flex gap-3 items-end">
                        
                        {/* --- NEW FILE STAGING PANEL --- */}
                        {file && (
                            <div className="absolute bottom-24 left-0 right-0 mx-4 bg-slate-900/95 border border-cyan-500/30 rounded-2xl p-4 shadow-[0_0_30px_rgba(8,145,178,0.2)] animate-fade-in-up backdrop-blur-xl z-50">
                                <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-cyan-950/50 rounded-lg border border-cyan-500/20">
                                            <FileText size={20} className="text-cyan-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-200">{file.name}</p>
                                            <p className="text-[10px] text-slate-500 font-mono uppercase">{(file.size / 1024).toFixed(1)} KB • ARTIFACT READY</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setFile(null)} className="text-slate-500 hover:text-white transition">x</button>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* LEFT: MODE SELECTOR */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Target Protocol</label>
                                        <div className="flex bg-slate-950 rounded-lg p-1 border border-white/5">
                                            <button 
                                                type="button"
                                                onClick={() => setUploadMode('chat')} 
                                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all ${uploadMode === 'chat' ? 'bg-slate-700 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
                                            >
                                                <MessageSquare size={14} /> Analyze (Chat)
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => setUploadMode('core')} 
                                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all ${uploadMode === 'core' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                                            >
                                                <Database size={14} /> Anchor (Core)
                                            </button>
                                        </div>
                                    </div>

                                    {/* RIGHT: CLICKABLE NUMBER PAD (1-9) */}
                                    <div className={`space-y-2 transition-opacity duration-300 ${uploadMode === 'core' ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex justify-between">
                                            <span>Priority Index</span>
                                            <span className="text-indigo-400 font-mono">LVL {coreScore}</span>
                                        </label>
                                        <div className="flex justify-between bg-slate-950 rounded-lg p-1 border border-white/5">
                                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                                                <button
                                                    key={num}
                                                    type="button"
                                                    onClick={() => setCoreScore(num)}
                                                    className={`w-8 h-8 rounded-md text-xs font-bold font-mono transition-all ${
                                                        coreScore === num 
                                                            ? 'bg-cyan-600 text-white shadow-[0_0_10px_rgba(8,145,178,0.6)] scale-110' 
                                                            : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                                                    }`}
                                                >
                                                    {num}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <Tooltip text="Upload Artifact" enabled={tooltipsEnabled}>
                            <label className={`p-3.5 rounded-xl cursor-pointer transition-all duration-300 mb-1 border ${file ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]' : 'bg-slate-800/50 border-white/10 text-slate-400 hover:bg-slate-700 hover:text-white'}`}>
                                <FileText size={20} />
                                <input type="file" className="hidden" onChange={(e) => handleFileSelection(e.target.files[0])} />
                            </label>
                        </Tooltip>
                        
                        <textarea 
                            value={input} 
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={file ? (uploadMode === 'core' ? "Add note to permanent record..." : "Ask Titan about this file...") : "Transmit signal to Titan..."}
                            className="flex-1 bg-slate-950/50 border border-white/10 rounded-xl p-3.5 focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 text-sm shadow-inner text-slate-200 placeholder-slate-600 resize-none h-12 py-3 custom-scrollbar backdrop-blur-sm transition-all"
                            disabled={loading}
                            rows={1}
                        />
                        
                        <Tooltip text="Transmit" enabled={tooltipsEnabled}>
                            <button type="submit" disabled={loading} className="bg-cyan-600/90 hover:bg-cyan-500 p-3.5 rounded-xl text-white shadow-lg hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all duration-300 mb-1 border border-cyan-400/30 disabled:opacity-50 disabled:shadow-none">
                                <Send size={20} />
                            </button>
                        </Tooltip>
                    </form>
                </footer>
            </div>
            
            <style jsx>{`
                @keyframes drift {
                    0% { transform: scale(1.1); }
                    100% { transform: scale(1.2) translate(-2%, -2%); }
                }
                .animate-drift {
                    animation: drift 60s infinite alternate ease-in-out;
                }
            `}</style>
        </div>
    );
};

export default App;
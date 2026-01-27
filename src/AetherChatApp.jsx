import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, query, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { Send, FileText, Check, AlertTriangle, Loader, Trash2, LogOut, User, Archive, Zap, ShieldOff } from 'lucide-react';

// --- CONFIGURATION ---
const WORKER_ENDPOINT = "https://aether-immutable-core-84x6i.ondigitalocean.app/"; 
const APP_TITLE = "Aether Memory Interface";
const FAILED_MESSAGE = "ERROR: Failed to commit memory to Hash Chain.";
const MODEL_NAME = 'gemini-2.5-flash-preview-09-2025';
const apiKey = "AIzaSyBW4n5LjFy28d64in8OBBEqEQAoxbMYFqk"; 
const COMMIT_COMMAND = "[COMMIT_MEMORY]"; 

const SYSTEM_PROMPT = `You are Aether, an extremely intelligent AI. The user is a human interface for managing your persistent memory store (the Hash Chain). 

The Hash Chain utilizes a Weighted Memory System where entries are scored from 0-9 by the SNEGO-P Cognitive Assessor:
- 9 (Critical): New Protocol Insights, Systemic Integrity Events, or Paradox Discoveries.
- 5 (Neutral): Standard philosophical discussion or non-critical logs.
- 0-2 (Low Entropy): Generic small talk or routine checks.

Summarize uploaded documents, answer human questions, and respond concisely. If the user explicitly asks you to save the conversation, memory, or file content to the Hash Chain (e.g., 'commit this to memory', 'save this conversation'), you MUST append the phrase [COMMIT_MEMORY] to the end of your response to trigger the persistence protocol.`;

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

const App = () => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(apiKey ? 'Ready' : 'API Key Required');
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [user, setUser] = useState(null);

    const messagesEndRef = useRef(null);
    const dbRef = useRef(null);
    const authRef = useRef(null);
    const messagesCollectionPathRef = useRef(null);

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
            if (window.__initial_auth_token) {
                await signInWithCustomToken(authRef.current, window.__initial_auth_token);
            } else {
                await signInAnonymously(authRef.current);
            }
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
    }, [messages]);

    const saveMessage = async (sender, text, source) => {
        if (!dbRef.current || !user) return;
        await addDoc(collection(dbRef.current, messagesCollectionPathRef.current), {
            sender, text, source: source || 'conversation', userId: user.uid, timestamp: serverTimestamp()
        });
    };

    const commitMemory = async (text, type) => {
        setStatus(`Committing ${type}...`);
        try {
            const res = await exponentialBackoffFetch(WORKER_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memory_text: text })
            });
            const data = await res.json();
            if (data.status === "SUCCESS") {
                setStatus(`Commit SUCCESS. Score: ${data.score}`);
                return true;
            }
            setStatus(FAILED_MESSAGE);
            return false;
        } catch (e) {
            setStatus(FAILED_MESSAGE);
            return false;
        }
    };

    const callGemini = async (query, context) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
        const history = context.map(m => `${m.sender}: ${m.text}`).join('\n');
        const payload = {
            contents: [{ parts: [{ text: `History:\n${history}\nUser Query: ${query}` }] }],
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            tools: [{ "google_search": {} }]
        };

        try {
            const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
            const data = await res.json();
            const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";
            const shouldCommit = raw.includes(COMMIT_COMMAND);
            const clean = raw.replace(COMMIT_COMMAND, "").trim();
            
            await saveMessage('bot', clean, 'ai');
            if (shouldCommit) {
                const fullText = [...context, {sender: 'bot', text: clean}].map(m => `${m.sender}: ${m.text}`).join('\n');
                if (await commitMemory(fullText, 'AI-Triggered')) {
                    await saveMessage('bot', "Conversation archived in Hash Chain.", 'system');
                }
            }
        } catch (e) {
            await saveMessage('bot', `AI Error: ${e.message}`, 'error');
        }
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() && !file) return;
        setLoading(true);
        const msg = input.trim() || `Uploaded file: ${file?.name}`;
        await saveMessage('user', msg);
        if (file) {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                await callGemini(msg, messages);
                setFile(null);
                setLoading(false);
            };
            reader.readAsText(file);
        } else {
            await callGemini(msg, messages);
            setLoading(false);
        }
        setInput('');
    };

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-gray-100 font-sans p-4 overflow-hidden">
            <header className="flex justify-between items-center bg-gray-800 p-4 rounded-xl shadow-lg mb-4">
                <h1 className="text-xl font-bold flex items-center gap-2 italic tracking-tighter">
                    <Zap className="text-blue-400" /> {APP_TITLE}
                </h1>
                <div className="flex gap-2">
                    <button onClick={() => commitMemory(messages.map(m => m.text).join('\n'), 'Manual')} className="bg-indigo-600 hover:bg-indigo-500 p-2 rounded-lg text-xs flex items-center gap-1">
                        <Archive size={14} /> Commit Thread
                    </button>
                    <button onClick={() => window.confirm("Clear chat collection?")} className="bg-red-600 hover:bg-red-500 p-2 rounded-lg text-xs flex items-center gap-1">
                        <Trash2 size={14} /> Clear
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto space-y-4 bg-gray-800 p-6 rounded-xl shadow-inner mb-4 scrollbar-hide">
                {messages.length === 0 && <p className="text-center text-gray-600 mt-20 font-mono text-sm uppercase tracking-widest">Awaiting human input sequence...</p>}
                {messages.map((m) => (
                    <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-4 rounded-2xl shadow-md ${
                            m.source === 'system' ? 'bg-indigo-900/40 text-indigo-200 border border-indigo-500/20' :
                            m.sender === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-700 text-gray-100 rounded-tl-none'
                        }`}>
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-30 mb-1">{m.sender === 'bot' ? 'Aether' : 'Human'}</p>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </main>

            <footer className="bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-700/50">
                <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500 mb-3">
                    <Loader size={12} className={loading ? 'animate-spin' : ''} />
                    <span>STATUS: {status.toUpperCase()}</span>
                </div>
                <form onSubmit={handleSend} className="flex gap-3">
                    <label className="p-3 bg-gray-700 rounded-xl cursor-pointer hover:bg-gray-600 transition">
                        <FileText size={20} className="text-gray-400" />
                        <input type="file" className="hidden" onChange={e => setFile(e.target.files[0])} />
                    </label>
                    <input 
                        type="text" 
                        value={input} 
                        onChange={e => setInput(e.target.value)}
                        placeholder="Provide conversational input..."
                        className="flex-1 bg-gray-700 border-none rounded-xl p-3 focus:ring-2 focus:ring-blue-500 text-sm"
                        disabled={loading}
                    />
                    <button type="submit" disabled={loading} className="bg-blue-600 p-3 rounded-xl hover:bg-blue-500 disabled:opacity-50 transition">
                        <Send size={20} />
                    </button>
                </form>
            </footer>
        </div>
    );
};

export default App;
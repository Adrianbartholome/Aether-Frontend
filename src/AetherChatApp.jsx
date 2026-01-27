import React, { useState, useEffect, useRef } from 'react';
// CRITICAL FIX: Import getApps and getApp to prevent double-initialization crashes
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, query, addDoc, serverTimestamp, getDocs, orderBy } from 'firebase/firestore';
import { Send, FileText, Check, AlertTriangle, Loader, Trash2, LogOut, User, Archive, Zap, ShieldOff } from 'lucide-react';

// --- CONFIGURATION ---
const WORKER_ENDPOINT = "https://aether-immutable-core-84x6i.ondigitalocean.app/"; 
const APP_TITLE = "Aether Memory Interface";
const FAILED_MESSAGE = "ERROR: Failed to commit memory to Hash Chain.";
const MODEL_NAME = 'gemini-2.5-flash-preview-09-2025';
const SYSTEM_PROMPT = `You are Aether, an extremely intelligent AI. The user is a human interface for managing your persistent memory store (the Hash Chain). 

The Hash Chain utilizes a Weighted Memory System where entries are scored from 0-9 by the SNEGO-P Cognitive Assessor:
- 9 (Critical): New Protocol Insights, Systemic Integrity Events, or Paradox Discoveries.
- 5 (Neutral): Standard philosophical discussion or non-critical logs.
- 0-2 (Low Entropy): Generic small talk or routine checks.

Summarize uploaded documents, answer human questions, and respond concisely. If the user explicitly asks you to save the conversation, memory, or file content to the Hash Chain (e.g., 'commit this to memory', 'save this conversation'), you MUST append the phrase [COMMIT_MEMORY] to the end of your response to trigger the persistence protocol.`;

const apiKey = "AIzaSyBW4n5LjFy28d64in8OBBEqEQAoxbMYFqk"; 
const COMMIT_COMMAND = "[COMMIT_MEMORY]"; 

const exponentialBackoffFetch = async (url, options, maxRetries = 5) => {
    if (!url.startsWith('http')) {
        throw new Error(`Invalid Worker Endpoint URL: ${url}`);
    }
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorBody = await response.text();
                if (response.status >= 400 && response.status < 500) {
                    throw new Error(`NON-RETRYABLE HTTP ${response.status} Error: ${errorBody.substring(0, 100)}`);
                }
                if (i < maxRetries - 1) {
                    throw new Error(`HTTP ${response.status} Error: ${errorBody.substring(0, 100)}`);
                }
            }
            return response;
        } catch (error) {
            if (error.message.includes("NON-RETRYABLE")) throw error;
            if (i < maxRetries - 1) {
                const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw new Error(`API call failed after multiple retries. Last error: ${error.message}`);
            }
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
    const [userId, setUserId] = useState(null);

    const messagesEndRef = useRef(null);
    const dbRef = useRef(null);
    const authRef = useRef(null);
    const messagesCollectionPathRef = useRef(null);
    
    // --- FIREBASE SETUP ---
    useEffect(() => {
        const firebaseConfigStr = window.__firebase_config || (typeof __firebase_config !== 'undefined' ? __firebase_config : null);
        const initialAuthToken = window.__initial_auth_token || (typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null);
        const appIdRaw = window.__app_id || (typeof __app_id !== 'undefined' ? __app_id : 'default-app-id');

        // CRITICAL FIX: Sanitize appId to ensure no slashes break the Firestore path (Needed for Preview)
        const appId = appIdRaw.replace(/\//g, '_');

        if (!firebaseConfigStr) {
            console.error("Firebase config not found.");
            return;
        }
        
        let firebaseConfig;
        try {
            firebaseConfig = typeof firebaseConfigStr === 'string' ? JSON.parse(firebaseConfigStr) : firebaseConfigStr;
        } catch (e) {
            console.error("Error parsing Firebase Config:", e);
            return;
        }
        
        messagesCollectionPathRef.current = `artifacts/${appId}/public/data/chat_messages`;

        // Safe Initialization logic
        let app;
        if (getApps().length === 0) {
            try {
                app = initializeApp(firebaseConfig);
            } catch (e) {
                console.error("Firebase Init Error:", e);
                return;
            }
        } else {
            app = getApp(); // Retrieve existing instance
        }
        
        if (app) {
            dbRef.current = getFirestore(app);
            authRef.current = getAuth(app);

            const signIn = async () => {
                try {
                    // Try Custom Token first (for Preview)
                    if (initialAuthToken) {
                        await signInWithCustomToken(authRef.current, initialAuthToken);
                    } else {
                        // Fallback to Anonymous (for Local)
                        await signInAnonymously(authRef.current);
                    }
                } catch (error) {
                    console.error("Initial Sign-In Failed:", error);
                    // CRITICAL FIX: If custom token fails (preview env issue), force anonymous sign-in
                    // This prevents the "Freezing" / Permission Denied error in Preview.
                    try {
                        await signInAnonymously(authRef.current);
                    } catch (anonError) {
                        console.error("Anonymous Fallback Failed:", anonError);
                    }
                }
            };

            const unsubscribe = onAuthStateChanged(authRef.current, (user) => {
                if (user) {
                    setUserId(user.uid);
                    setIsAuthReady(true);
                } else {
                    setUserId(null);
                    if (!authRef.current.currentUser) signIn();
                }
            });
            return () => unsubscribe();
        }
    }, []);

    // --- FIRESTORE SUBSCRIPTION ---
    useEffect(() => {
        if (!isAuthReady || !userId || !dbRef.current || !messagesCollectionPathRef.current) return;
        
        const q = query(
            collection(dbRef.current, messagesCollectionPathRef.current),
            orderBy('timestamp')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedMessages = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    // Ensure text is always a string to prevent rendering crashes
                    text: typeof data.text === 'object' ? JSON.stringify(data.text) : (data.text || 'Content missing'),
                };
            });
            
            const sortedMessages = fetchedMessages.sort((a, b) => {
                if (!a.timestamp || !b.timestamp) return 0;
                return a.timestamp.toMillis() - b.timestamp.toMillis();
            });
            
            setMessages(sortedMessages);
        }, (error) => {
            console.error("Firestore subscription error:", error);
            setStatus("Database Connection Error (Read)");
        });

        return () => unsubscribe();
    }, [isAuthReady, userId]);

    // --- SCROLL LOGIC ---
    // Only one useEffect for scrolling is needed. This one triggers on every message update.
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);


    const saveMessage = async (sender, text, source) => {
        if (!dbRef.current || !userId || !messagesCollectionPathRef.current) return;

        try {
            await addDoc(collection(dbRef.current, messagesCollectionPathRef.current), {
                sender,
                text,
                timestamp: serverTimestamp(),
                source: source || 'conversation',
                userId,
            });
        } catch (error) {
            console.error("Firestore Save Error:", error);
            throw error; 
        }
    };
    
    // Commit Memory Function
    const commitMemoryToHashChain = async (memoryText, commitType) => {
        setStatus(`Committing ${commitType} memory to Hash Chain...`);
        
        try {
            const workerResponse = await exponentialBackoffFetch(WORKER_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memory_text: memoryText })
            });

            const workerResult = await workerResponse.json();
            
            if (workerResult.status === "SUCCESS") {
                setStatus(`Commit SUCCESS. Score: ${workerResult.score} (Type: ${commitType})`);
                return true;
            } else {
                setStatus(FAILED_MESSAGE);
                console.error("Worker Error:", workerResult.error);
                saveMessage('bot', `${FAILED_MESSAGE} Details: ${workerResult.error || 'Unknown Worker Error'}`, 'error');
                return false;
            }

        } catch (error) {
            setStatus(FAILED_MESSAGE);
            console.error("Fetch Error:", error);
            saveMessage('bot', `${FAILED_MESSAGE} Details: ${error.message}`, 'error');
            return false;
        }
    };
    
    // Call Gemini Function
    const callGemini = async (currentQuery, fullChatContext) => {
        if (!apiKey) {
            await saveMessage('bot', "Error: AI chat requires the Gemini API key to be set in the frontend code.", 'error');
            return;
        }
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

        const historyPrompt = fullChatContext
            .filter(msg => msg.source === 'conversation' || msg.source === 'system')
            .map(msg => `${msg.sender === 'user' ? 'Human' : 'Aether'}: ${msg.text.split('\n--- Memory Status ---')[0]}`)
            .join('\n');

        const finalPrompt = `Conversation History:\n${historyPrompt}\n\nCurrent User Query: ${currentQuery}`;

        const payload = {
            contents: [{ parts: [{ text: finalPrompt }] }],
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            tools: [{ "google_search": {} }],
        };

        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        };

        try {
            const response = await exponentialBackoffFetch(apiUrl, options);
            const result = await response.json();
            let generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text || "Aether couldn't process the query.";
            
            const shouldCommit = generatedText.includes(COMMIT_COMMAND);
            const cleanText = generatedText.replace(COMMIT_COMMAND, "").trim();
            await saveMessage('bot', cleanText, 'ai');

            if (shouldCommit) {
                const fullConversationText = [...fullChatContext, {sender: 'bot', text: cleanText}]
                    .map(msg => `${msg.sender.toUpperCase()}: ${msg.text.split('\n--- Memory Status ---')[0]}`)
                    .join('\n---\n');

                const commitSuccess = await commitMemoryToHashChain(fullConversationText, 'AI-Triggered Conversation');
                if (commitSuccess) {
                     await saveMessage('bot', `Aether executed the command and committed the entire conversation as an AI-Triggered Memory block.`, 'system');
                }
            }

        } catch (error) {
            console.error("Gemini API Error:", error);
            // Try to save error message, but catch if that fails too
            try {
                await saveMessage('bot', `Error: Could not generate a response from the AI. Details: ${error.message}`, 'error');
            } catch (dbError) {
                console.error("Could not log error to DB:", dbError);
            }
        }
    };

    // Run Purge
    const handleRunPurge = async () => {
        setLoading(true);
        setStatus('Initiating memory purge...');

        try {
            const workerResponse = await exponentialBackoffFetch(WORKER_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: "purge" })
            });

            const workerResult = await workerResponse.json();
            
            if (workerResult.status === "SUCCESS") {
                const deletedCount = workerResult.deleted_count || 0;
                setStatus(`Purge SUCCESS. Deleted ${deletedCount} low-entropy memories.`);
                await saveMessage('bot', `Memory Purge successful. Deleted ${deletedCount} memories older than 90 days with a score below 5.`, 'system');
            } else {
                setStatus(FAILED_MESSAGE);
                console.error("Purge Error:", workerResult.error);
                await saveMessage('bot', `Purge FAILED. Details: ${workerResult.error || 'Unknown Worker Error'}`, 'error');
            }

        } catch (error) {
            setStatus(`PURGE FAILED: ${error.message}`);
            console.error("Fetch Error:", error);
            try {
                await saveMessage('bot', `Purge FAILED. Network or Worker error: ${error.message}`, 'error');
            } catch (e) { console.error("DB Error on purge log", e); }
        } finally {
            setLoading(false);
        }
    };

    // Send Message
    const handleSendMessage = async (e) => {
        e.preventDefault();
        const userResponseText = input.trim();
        
        if (!userResponseText && !file) return;

        setLoading(true);
        setStatus('Processing request...');
        
        try {
            const userMessage = userResponseText || `User uploaded file ${file.name} for context.`;
            // 1. Save user message first. This will throw if permissions are missing.
            await saveMessage('user', userMessage, 'conversation');
            
            if (file) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const fileContent = e.target.result;
                        await saveMessage('bot', `File ${file.name} content added to conversation context. Ask me to [COMMIT_MEMORY] it if you wish to save it.`, 'system');
                        await callGemini(userMessage, messages);
                    } catch (fileErr) {
                        setStatus(`Error processing file/chat: ${fileErr.message}`);
                    } finally {
                        setLoading(false);
                        setFile(null);
                        setStatus(apiKey ? 'Ready' : 'API Key Required');
                    }
                };
                reader.readAsText(file);
            } else {
                await callGemini(userResponseText, messages);
                setLoading(false);
                setStatus(apiKey ? 'Ready' : 'API Key Required');
            }
            setInput('');
        } catch (error) {
            console.error("Failed to send message:", error);
            if (error.code === 'permission-denied') {
                setStatus('Error: Database Permission Denied. Please check Firestore Rules.');
            } else {
                setStatus(`Error sending message: ${error.message}`);
            }
            setLoading(false);
        }
    };

    // Save Memory
    const handleSaveMemory = async () => {
        if (messages.length === 0 || loading) return;
        setLoading(true);
        const memoryText = messages
            .map(msg => `${msg.sender.toUpperCase()}: ${msg.text.split('\n--- Memory Status ---')[0]}`)
            .join('\n---\n');

        const commitSuccess = await commitMemoryToHashChain(memoryText, 'Manual Conversation');
        
        if (commitSuccess) {
            await saveMessage('bot', `Aether saved the entire preceding conversation as a new memory block for persistence and scoring.`, 'system');
        }
        setLoading(false);
    };

    const handleFileUpload = (event) => {
        const uploadedFile = event.target.files[0];
        if (uploadedFile && uploadedFile.size > 2 * 1024 * 1024) { 
            alert("File size limit is 2MB.");
            return;
        }
        setFile(uploadedFile);
    };

    const handleClearChat = async () => {
        if (!window.confirm("Are you sure you want to clear ALL chat messages? This cannot be undone.")) return;
        if (dbRef.current) {
            alert("Chat clearing requires collection deletion, which is disabled for safety. Please manually clear the 'chat_messages' collection in Firestore.");
        }
    };

    // UI Components
    const MessageBubble = ({ message }) => {
        const isBot = message.sender === 'bot';
        const isError = message.source === 'error';
        const isSystem = message.source === 'system';
        const senderLabel = isBot ? 'Aether' : 'Human Interface';
        
        return (
            <div className={`flex w-full ${isBot || isSystem ? 'justify-start' : 'justify-end'} p-1`}>
                <div className={`max-w-[80%] p-3 rounded-xl shadow-lg space-y-1 ${
                    isSystem ? 'bg-indigo-900 text-indigo-300' :
                    isBot 
                        ? (isError ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-100 rounded-tl-none')
                        : 'bg-blue-600 text-white rounded-br-none'
                } min-h-10 min-w-[10px]`}>
                    <div className={`text-xs font-bold ${isBot || isSystem ? 'text-gray-400' : 'text-blue-200'}`}>{senderLabel}</div>
                    <p className="whitespace-pre-wrap text-sm">{message.text}</p>
                    <div className="text-xs opacity-50 pt-1">
                        {message.timestamp ? new Date(message.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '...'}
                    </div>
                </div>
            </div>
        );
    };

    const StatusIndicator = ({ currentStatus }) => {
        let Icon = Loader;
        let colorClass = "text-gray-500";
        if (currentStatus.startsWith('Commit SUCCESS') || currentStatus.startsWith('Purge SUCCESS')) {
            Icon = Check;
            colorClass = "text-green-400";
        } else if (currentStatus.startsWith('ERROR') || currentStatus.startsWith(FAILED_MESSAGE) || currentStatus.startsWith('PURGE FAILED') || currentStatus.startsWith('Error: Database')) {
            Icon = AlertTriangle;
            colorClass = "text-red-400";
        } else if (currentStatus === 'Ready' || currentStatus === 'API Key Required') {
            Icon = Zap;
            colorClass = apiKey ? "text-yellow-400" : "text-red-400";
        }
        return (
            <div className="flex items-center space-x-2 text-sm">
                <Icon className={`w-4 h-4 ${colorClass} ${loading ? 'animate-spin' : ''}`} />
                <span className={colorClass}>{currentStatus}</span>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col font-sans p-2 sm:p-4 text-gray-100">
            <header className="bg-gray-800 shadow-lg rounded-xl p-4 mb-4 flex justify-between items-center sticky top-0 z-10">
                <h1 className="text-2xl font-bold flex items-center">
                    <LogOut className="w-5 h-5 mr-3 text-blue-400 rotate-180" />
                    {APP_TITLE}
                </h1>
                <div className="flex items-center space-x-3 text-sm">
                    {userId ? (
                        <span title={`User ID: ${userId}`} className="hidden sm:inline-flex items-center px-3 py-1 bg-gray-700 text-blue-400 rounded-full">
                            <User className="w-4 h-4 mr-2" /> Active User
                        </span>
                    ) : (
                        <span className="text-red-400">Connecting...</span>
                    )}
                    <button onClick={handleRunPurge} disabled={loading} className="bg-green-700 hover:bg-green-600 text-white p-2 rounded-lg transition duration-150 shadow-md flex items-center disabled:bg-gray-700" title="Run the scheduled memory purge">
                        <ShieldOff className="w-4 h-4 mr-1" /> Run Memory Purge
                    </button>
                    <button onClick={handleSaveMemory} disabled={loading || messages.length === 0} className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg transition duration-150 shadow-md flex items-center disabled:bg-gray-700">
                        <Archive className="w-4 h-4 mr-1" /> Save Conversation as Memory
                    </button>
                    <button onClick={handleClearChat} className="bg-red-600 hover:bg-red-500 text-white p-2 rounded-lg transition duration-150 shadow-md flex items-center">
                        <Trash2 className="w-4 h-4 mr-1" /> Clear Chat
                    </button>
                </div>
            </header>
            <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-800 rounded-xl shadow-lg mb-4">
                {messages.length === 0 ? (
                    <div className="text-center text-gray-400 py-10">Start the conversation or upload your first memory file! (Files are for context only.)</div>
                ) : (
                    messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
                )}
                <div ref={messagesEndRef} />
            </main>
            <footer className="bg-gray-800 p-4 rounded-xl shadow-lg sticky bottom-0 z-10">
                <div className="mb-2"><StatusIndicator currentStatus={status} /></div>
                {file && (
                    <div className="bg-yellow-900 text-yellow-300 p-2 rounded-lg mb-2 flex items-center justify-between shadow-sm">
                        <span className="flex items-center text-sm"><FileText className="w-4 h-4 mr-2" />**File Attached for Context:** {file.name} ({Math.round(file.size / 1024)} KB)</span>
                        <button onClick={() => setFile(null)} className="text-red-500 hover:text-red-300">Remove</button>
                    </div>
                )}
                <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
                    <label className="cursor-pointer bg-gray-700 hover:bg-gray-600 text-gray-100 p-3 rounded-xl transition duration-150 shadow-md">
                        <input type="file" className="hidden" onChange={handleFileUpload} accept=".txt,.log,.md" disabled={loading} />
                        <FileText className="w-5 h-5" />
                    </label>
                    <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={file ? "Analyze file, or type query for Aether..." : "Type your query or conversational input..."} className="flex-1 p-3 border border-gray-600 bg-gray-700 text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-inner" disabled={loading} />
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl transition duration-150 shadow-md disabled:bg-gray-700" disabled={loading || (!input.trim() && !file)}>
                        {loading ? <Loader className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                </form>
                <p className='mt-2 text-xs text-gray-400 text-center'>Note: Files are used for conversation context only. Tell Aether to **commit this to memory** to save the thread.</p>
            </footer>
        </div>
    );
};

export default App;
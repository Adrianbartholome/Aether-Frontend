import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './AetherChatApp.jsx';
import './index.css'; 

// --- ENVIRONMENT HOOKS ---
// This identifies your specific "app instance" in the database
window.__app_id = "aether-hash-chain-app-id"; 
window.__initial_auth_token = ""; 

// Your specific Firebase configuration formatted for the application
window.__firebase_config = JSON.stringify({
  "apiKey": "AIzaSyAuZB1KQmF2AvzQ8KrKBxgebpZEuhosOnA",
  "authDomain": "aether-base-e829c.firebaseapp.com",
  "projectId": "aether-base-e829c",
  "storageBucket": "aether-base-e829c.firebasestorage.app",
  "messagingSenderId": "447469239626",
  "appId": "1:447469239626:web:20c05a667827a6ad5495b3",
  "measurementId": "G-HSJ0N337YE"
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './AetherChatApp.jsx';
import './index.css'; 

// Live Environment Configuration
window.__app_id = "aether-hash-chain-app-id"; 
window.__initial_auth_token = ""; 

// !!! REPLACE THESE WITH YOUR ACTUAL FIREBASE CONFIG FROM CONSOLE !!!
window.__firebase_config = JSON.stringify({
  "apiKey": "AIzaSy...", 
  "authDomain": "your-project.firebaseapp.com",
  "projectId": "your-project-id",
  "storageBucket": "your-project.appspot.com",
  "messagingSenderId": "123456...",
  "appId": "1:12345..." 
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
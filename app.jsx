import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Initialize Telegram WebApp
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      window.Telegram.WebApp.setHeaderColor('#0f172a');
      window.Telegram.WebApp.setBackgroundColor('#0f172a');
      
      // Hide back button since this is the main screen
      window.Telegram.WebApp.BackButton.hide();
      
      // Enable closing confirmation
      window.Telegram.WebApp.enableClosingConfirmation();
    }

    const checkDependencies = () => {
      if (window.Web3Provider && window.RaffleApp) {
        setIsReady(true);
      } else {
        // Keep checking every 100ms until components are loaded
        setTimeout(checkDependencies, 100);
      }
    };

    checkDependencies();
  }, []);

  if (!isReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 text-white">
        <svg 
          className="w-32 h-32 mb-6 animate-pulse"
          viewBox="0 0 128 128" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="128" height="128" rx="16" fill="url(#loadingGradient)"/>
          <text x="64" y="75" fontFamily="Arial" fontSize="24" fontWeight="bold" fill="white" textAnchor="middle">
            URIM
          </text>
          <defs>
            <linearGradient id="loadingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366F1"/>
              <stop offset="50%" stopColor="#8B5CF6"/>
              <stop offset="100%" stopColor="#3B82F6"/>
            </linearGradient>
          </defs>
        </svg>
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-blue-400 mb-4"></div>
        <p className="text-lg font-semibold">Loading URIM Raffle...</p>
        <p className="text-sm text-gray-300 mt-2">Connecting to Base network...</p>
      </div>
    );
  }

  return (
    <window.Web3Provider>
      <window.RaffleApp />
    </window.Web3Provider>
  );
}

// Mount the app
const root = createRoot(document.getElementById('renderDiv'));
root.render(<App />);
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
        <img 
          src="https://i.imgur.com/a/FxI9YIo.png" 
          alt="URIM Loading"
          className="w-32 h-32 object-contain mb-6 animate-pulse"
        />
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
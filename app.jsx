import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Initialize Telegram WebApp
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      window.Telegram.WebApp.setHeaderColor('#1a1a2e');
      window.Telegram.WebApp.setBackgroundColor('#0f0f23');
    }

    const checkDependencies = () => {
      if (window.Web3Provider && window.RaffleApp) {
        setIsReady(true);
      }
    };

    checkDependencies();
    const interval = setInterval(checkDependencies, 100);
    return () => clearInterval(interval);
  }, []);

  if (!isReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-400"></div>
        <p className="mt-4 text-white text-lg">Loading URIM Raffle...</p>
      </div>
    );
  }

  return (
    <window.Web3Provider>
      <window.RaffleApp />
    </window.Web3Provider>
  );
}

createRoot(document.getElementById('renderDiv')).render(<App />);
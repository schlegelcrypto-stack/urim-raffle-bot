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
          src="https://i.imgur.com/FxI9YIo.jpg" 
          alt="URIM Loading"
          className="w-32 h-32 object-contain mb-6 animate-pulse"
          onError={(e) => {
            // Fallback to generic logo if imgur image fails
            e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiByeD0iMTYiIGZpbGw9IiM2MzY2ZjEiLz4KPHRleHQgeD0iNjQiIHk9IjcwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMzIiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+VVJJTTwvdGV4dD4KPC9zdmc+';
          }}
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
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Initialize Telegram WebApp immediately
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      window.Telegram.WebApp.setHeaderColor('#0f172a');
      window.Telegram.WebApp.setBackgroundColor('#0f172a');
      
      // Hide back button since this is the main screen
      window.Telegram.WebApp.BackButton.hide();
      
      // Enable closing confirmation
      window.Telegram.WebApp.enableClosingConfirmation();
      
      // Set viewport height for mobile
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
      }
    }

    // Shorter timeout for component checking since they should load quickly
    const maxAttempts = 50; // 5 seconds max
    let attempts = 0;

    const checkDependencies = () => {
      attempts++;
      
      if (window.Web3Provider && window.RaffleApp) {
        console.log('✅ All components loaded successfully');
        setIsReady(true);
      } else if (attempts >= maxAttempts) {
        console.error('❌ Components failed to load, but proceeding anyway');
        setIsReady(true); // Force load even if components aren't ready
      } else {
        // Check every 100ms
        setTimeout(checkDependencies, 100);
      }
    };

    // Start checking immediately
    checkDependencies();
  }, []);

  // Emergency fallback - force load after 3 seconds regardless
  useEffect(() => {
    const emergencyTimeout = setTimeout(() => {
      if (!isReady) {
        console.warn('⚠️ Emergency fallback activated - forcing app load');
        setIsReady(true);
      }
    }, 3000);

    return () => clearTimeout(emergencyTimeout);
  }, [isReady]);

  if (!isReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 text-white p-4">
        <div className="glass-card rounded-xl p-8 text-center max-w-sm w-full">
          <img 
            src="https://www.infinityg.ai/assets/user-upload/1763445354073-ChatGPT Image Nov 12, 2025, 09_22_49 AM.png"
            alt="URIM Loading"
            className="w-24 h-24 object-contain mx-auto mb-6 animate-pulse"
          />
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-blue-400 mb-4 mx-auto"></div>
          <h1 className="text-xl font-bold text-blue-300 mb-2">Loading URIM Raffle...</h1>
          <p className="text-sm text-gray-300 mb-1">Connecting to Base network</p>
          <div className="w-full bg-gray-700 rounded-full h-2 mt-4">
            <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{width: '70%'}}></div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback if components aren't loaded
  if (!window.Web3Provider || !window.RaffleApp) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-red-900 via-purple-900 to-indigo-900 text-white p-4">
        <div className="glass-card rounded-xl p-8 text-center max-w-sm w-full">
          <div className="text-red-400 text-6xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-red-300 mb-4">Component Loading Error</h1>
          <p className="text-sm text-gray-300 mb-4">
            Failed to load Web3 components. Please refresh the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 w-full"
          >
            🔄 Refresh App
          </button>
        </div>
      </div>
    );
  }

  return React.createElement(
    window.Web3Provider,
    null,
    React.createElement(window.RaffleApp)
  );
}

// Ensure DOM is ready before mounting
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

function initApp() {
  const renderDiv = document.getElementById('renderDiv');
  if (renderDiv) {
    const root = createRoot(renderDiv);
    root.render(React.createElement(App));
    console.log('🚀 URIM Raffle App initialized');
  } else {
    console.error('❌ Render div not found');
  }
}
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initializeTelegramWebApp = () => {
      try {
        // More robust Telegram WebApp initialization
        if (window.Telegram?.WebApp) {
          console.log('Initializing Telegram WebApp...');
          
          const tg = window.Telegram.WebApp;
          
          // Set theme and expand
          tg.ready();
          tg.expand();
          
          // Set theme colors
          tg.setHeaderColor('#0f172a');
          tg.setBackgroundColor('#0f172a');
          
          // Configure UI
          tg.BackButton.hide();
          tg.enableClosingConfirmation();
          
          // Handle viewport changes
          tg.onEvent('viewportChanged', () => {
            console.log('Viewport changed:', tg.viewportHeight);
          });
          
          // Handle theme changes
          tg.onEvent('themeChanged', () => {
            console.log('Theme changed');
          });
          
          console.log('Telegram WebApp initialized successfully');
          console.log('WebApp data:', {
            version: tg.version,
            platform: tg.platform,
            colorScheme: tg.colorScheme,
            user: tg.initDataUnsafe?.user
          });
          
        } else {
          console.log('Telegram WebApp not available - running in browser mode');
        }
      } catch (error) {
        console.error('Error initializing Telegram WebApp:', error);
        setError('Failed to initialize Telegram WebApp');
      }
    };

    const checkDependencies = () => {
      try {
        if (window.Web3Provider && window.RaffleApp) {
          console.log('All dependencies loaded successfully');
          setIsReady(true);
          return;
        }
        
        // Check individual components
        if (!window.Web3Provider) {
          console.log('Waiting for Web3Provider...');
        }
        if (!window.RaffleApp) {
          console.log('Waiting for RaffleApp...');
        }
        
        // Keep checking
        setTimeout(checkDependencies, 100);
      } catch (error) {
        console.error('Error checking dependencies:', error);
        setError('Failed to load application components');
      }
    };

    // Initialize Telegram first, then check dependencies
    initializeTelegramWebApp();
    checkDependencies();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-red-900 via-red-800 to-red-900 text-white p-6">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-4">Error Loading App</h1>
          <p className="text-lg text-red-200 mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            🔄 Reload App
          </button>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 text-white p-6">
        <div className="text-center max-w-md">
          <img 
            src="https://i.imgur.com/0v5f4rK.png" 
            alt="URIM Loading"
            className="w-32 h-32 object-contain mb-6 animate-pulse mx-auto"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = "data:image/svg+xml;base64," + btoa(`
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
                  <defs>
                    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" style="stop-color:#3b82f6"/>
                      <stop offset="100%" style="stop-color:#8b5cf6"/>
                    </linearGradient>
                  </defs>
                  <rect width="200" height="200" fill="url(#grad)" rx="20"/>
                  <text x="100" y="110" text-anchor="middle" font-family="Arial" font-size="36" font-weight="bold" fill="white">URIM</text>
                  <text x="100" y="140" text-anchor="middle" font-family="Arial" font-size="16" fill="white">Raffle</text>
                </svg>
              `);
            }}
          />
          
          <div className="flex justify-center mb-6">
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-blue-400"></div>
          </div>
          
          <h1 className="text-2xl font-bold mb-2">Loading URIM Raffle</h1>
          <p className="text-lg text-gray-300 mb-4">Connecting to Base network...</p>
          
          <div className="space-y-2 text-sm text-gray-400">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <span>Loading Web3 components...</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
              <span>Initializing Telegram WebApp...</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span>Preparing raffle interface...</span>
            </div>
          </div>
          
          <div className="mt-8 text-xs text-gray-500">
            <p>Testing Mode - @schlegelcrypto</p>
            <p>Base Network • USDC Raffles</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <window.Web3Provider>
      <window.RaffleApp />
    </window.Web3Provider>
  );
}

// Enhanced error boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('React Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-red-900 via-red-800 to-red-900 text-white p-6">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-4">💥</div>
            <h1 className="text-2xl font-bold mb-4">App Crashed</h1>
            <p className="text-lg text-red-200 mb-2">Something went wrong</p>
            <p className="text-sm text-red-300 mb-6">{this.state.error?.message}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              🔄 Restart App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Mount the app with error boundary
const root = createRoot(document.getElementById('renderDiv'));
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
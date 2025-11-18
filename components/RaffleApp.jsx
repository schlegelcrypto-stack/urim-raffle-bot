import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useReadContract, useConfig } from 'wagmi';
import { writeContract, waitForTransactionReceipt, getBalance } from 'wagmi/actions';
import { parseUnits, formatUnits } from 'viem';

// Contract addresses
const RAFFLE_CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69';
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base USDC

// Contract ABIs
const RAFFLE_ABI = [
  {
    type: 'function',
    name: 'buyTicket',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  }
];

const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'boolean' }],
    stateMutability: 'nonpayable',
  }
];

function RaffleApp() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const wagmiConfig = useConfig();
  
  // State
  const [isTransacting, setIsTransacting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [notification, setNotification] = useState(null);
  const [contractBalance, setContractBalance] = useState(0n);
  const [realTimePot, setRealTimePot] = useState({ balance: '0', participants: 0, lastUpdate: Date.now() });
  const [isSubscribed, setIsSubscribed] = useState(false);

  const TICKET_PRICE = parseUnits('5', 6); // 5 USDC (6 decimals)

  // Read USDC balance
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  });

  // Read USDC allowance
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, RAFFLE_CONTRACT] : undefined,
    query: { enabled: !!address }
  });

  // Check if user has approved enough USDC
  const hasApproval = usdcAllowance && usdcAllowance >= TICKET_PRICE;
  const hasBalance = usdcBalance && usdcBalance >= TICKET_PRICE;

  // Fetch real-time pot data from our API
  const fetchRealTimePot = async () => {
    try {
      const response = await fetch('/api/pot');
      const data = await response.json();
      setRealTimePot(data);
    } catch (error) {
      console.error('Failed to fetch real-time pot:', error);
    }
  };

  // Fetch contract balance (for pot display)
  const fetchContractBalance = async () => {
    try {
      const balance = await getBalance(wagmiConfig, {
        address: USDC_CONTRACT,
        token: USDC_CONTRACT,
        chainId: 8453
      });
      setContractBalance(balance.value);
    } catch (error) {
      console.error('Failed to fetch contract balance:', error);
    }
  };

  // Subscribe/unsubscribe to notifications
  const toggleNotifications = async () => {
    if (!window.Telegram?.WebApp?.initDataUnsafe?.user?.id) return;
    
    const chatId = window.Telegram.WebApp.initDataUnsafe.user.id;
    const endpoint = isSubscribed ? `/api/unsubscribe/${chatId}` : `/api/subscribe/${chatId}`;
    
    try {
      const response = await fetch(endpoint, { method: 'POST' });
      if (response.ok) {
        setIsSubscribed(!isSubscribed);
        showNotification(
          isSubscribed ? 'Notifications disabled' : 'Live notifications enabled!',
          'success'
        );
      }
    } catch (error) {
      console.error('Failed to toggle notifications:', error);
    }
  };

  // Initialize and set up polling
  useEffect(() => {
    if (isConnected) {
      fetchContractBalance();
      fetchRealTimePot();
      
      // Poll for real-time updates more frequently
      const balanceInterval = setInterval(fetchRealTimePot, 5000); // Every 5 seconds
      const contractInterval = setInterval(fetchContractBalance, 30000); // Every 30 seconds
      
      return () => {
        clearInterval(balanceInterval);
        clearInterval(contractInterval);
      };
    }
  }, [wagmiConfig, isConnected]);

  // Countdown timer (mock - replace with actual contract countdown)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const nextHour = new Date();
      nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
      const distance = nextHour.getTime() - now;

      if (distance > 0) {
        setCountdown({
          hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((distance % (1000 * 60)) / 1000)
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Show notification
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Approve USDC spending
  const handleApprove = async () => {
    if (!address) return;

    setIsApproving(true);
    try {
      // Haptic feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
      }

      const hash = await writeContract(wagmiConfig, {
        address: USDC_CONTRACT,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [RAFFLE_CONTRACT, parseUnits('1000000', 6)], // Approve large amount
      });

      showNotification('Approval submitted! Waiting for confirmation...', 'info');
      
      await waitForTransactionReceipt(wagmiConfig, { 
        hash,
        chainId: 8453
      });

      // Success feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }
      
      showNotification('✅ USDC approved successfully!', 'success');
      refetchAllowance();
      
    } catch (error) {
      console.error('Approval failed:', error);
      
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
      }
      
      showNotification('Approval failed. Please try again.', 'error');
    } finally {
      setIsApproving(false);
    }
  };

  // Buy ticket function
  const handleBuyTicket = async () => {
    if (!address || !hasApproval || !hasBalance) {
      showNotification('Please ensure you have USDC balance and approval', 'error');
      return;
    }

    setIsTransacting(true);
    
    try {
      // Haptic feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
      }

      const hash = await writeContract(wagmiConfig, {
        address: RAFFLE_CONTRACT,
        abi: RAFFLE_ABI,
        functionName: 'buyTicket',
        args: [],
      });

      showNotification('Transaction submitted! Waiting for confirmation...', 'info');
      
      await waitForTransactionReceipt(wagmiConfig, { 
        hash,
        chainId: 8453
      });
      
      // Success feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }
      
      showNotification('🎉 Success! Ticket purchased for $5 USDC!', 'success');
      
      // Refresh balances and pot data
      refetchBalance();
      refetchAllowance();
      fetchContractBalance();
      fetchRealTimePot();
      
    } catch (error) {
      console.error('Transaction failed:', error);
      
      // Error feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
      }
      
      let errorMessage = 'Transaction failed. Please try again.';
      if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient USDC balance for this transaction.';
      } else if (error.message.includes('rejected')) {
        errorMessage = 'Transaction was rejected.';
      }
      
      showNotification(errorMessage, 'error');
    } finally {
      setIsTransacting(false);
    }
  };

  // Use real-time pot balance if available, otherwise fall back to contract balance
  const displayPot = realTimePot.balance !== '0' ? realTimePot.balance : 
                   contractBalance ? formatUnits(contractBalance, 6) : '0.00';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900 text-white overflow-hidden">
      {/* Testing Banner */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-400 text-black text-center py-2 px-4 text-sm font-semibold">
        Testing Mode - Live Alchemy Tracking - @schlegelcrypto
      </div>

      {/* Notification */}
      {notification && (
        <div className={`fixed top-16 left-4 right-4 z-40 p-4 rounded-lg shadow-lg transition-all duration-300 ${
          notification.type === 'success' ? 'bg-green-600' :
          notification.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        }`}>
          <p className="text-sm font-medium">{notification.message}</p>
        </div>
      )}

      <div className="max-w-md mx-auto p-4 space-y-6 pt-16">
        {/* Header with Artwork */}
        <div className="text-center pt-6 pb-4">
          <div className="relative mb-4">
            <img 
              src="https://i.imgur.com/FxI9YIo.png" 
              alt="URIM 5050 Raffle"
              className="w-full max-w-sm mx-auto rounded-xl shadow-2xl animate-pulse-glow"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "data:image/svg+xml;base64," + btoa(`
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
                    <defs>
                      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#3b82f6"/>
                        <stop offset="100%" style="stop-color:#8b5cf6"/>
                      </linearGradient>
                    </defs>
                    <rect width="400" height="300" fill="url(#grad)"/>
                    <text x="200" y="120" text-anchor="middle" font-family="Arial" font-size="48" font-weight="bold" fill="white">URIM</text>
                    <text x="200" y="160" text-anchor="middle" font-family="Arial" font-size="24" fill="white">50/50 Raffle</text>
                    <circle cx="320" cy="50" r="30" fill="#7c3aed" opacity="0.7"/>
                    <text x="320" y="58" text-anchor="middle" font-family="Arial" font-size="12" font-weight="bold" fill="white">ID: 874482516</text>
                  </svg>
                `);
              }}
            />
            <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs px-2 py-1 rounded-full">
              ID: 874482516
            </div>
            {realTimePot.lastUpdate > Date.now() - 30000 && (
              <div className="absolute top-2 left-2 bg-green-600 text-white text-xs px-2 py-1 rounded-full animate-pulse">
                ⚡ LIVE
              </div>
            )}
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            URIM 50/50 Raffle
          </h1>
          <p className="text-sm text-gray-300 mt-1">Win big on Base Network with USDC!</p>
        </div>

        {/* Real-time Pot Status */}
        <div className="glass-card rounded-xl p-6 text-center relative">
          <div className="absolute top-2 right-2">
            <button
              onClick={fetchRealTimePot}
              className="text-blue-400 hover:text-blue-300 text-xs p-1 rounded"
              title="Refresh pot data"
            >
              🔄
            </button>
          </div>
          <h2 className="text-lg font-semibold text-blue-300 mb-2">🏆 Live Pot Status</h2>
          <div className="text-3xl font-bold text-green-400 mb-1">
            ${parseFloat(displayPot).toFixed(2)} USDC
          </div>
          <div className="text-sm text-gray-400 space-y-1">
            <div>👥 {realTimePot.participants} participants</div>
            <div>⚡ Last update: {new Date(realTimePot.lastUpdate).toLocaleTimeString()}</div>
            <div>Base Network • Powered by Alchemy</div>
          </div>
          
          {realTimePot.participants > 0 && (
            <div className="mt-3 text-sm text-purple-300">
              🏆 Winner gets: ${(parseFloat(displayPot) * 0.5).toFixed(2)} USDC
            </div>
          )}
        </div>

        {/* Live Notifications Toggle */}
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-purple-300">🔔 Live Notifications</h3>
              <p className="text-xs text-gray-400">Get instant updates on pot changes</p>
            </div>
            <button
              onClick={toggleNotifications}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                isSubscribed 
                  ? 'bg-green-600 hover:bg-green-700 text-white' 
                  : 'bg-gray-600 hover:bg-gray-700 text-white'
              }`}
            >
              {isSubscribed ? '✅ ON' : '❌ OFF'}
            </button>
          </div>
        </div>

        {/* Countdown */}
        <div className="glass-card rounded-xl p-6">
          <h3 className="text-lg font-semibold text-purple-300 mb-4 text-center">⏰ Next Draw</h3>
          <div className="flex justify-center space-x-4">
            {['hours', 'minutes', 'seconds'].map((unit) => (
              <div key={unit} className="text-center">
                <div className="text-2xl font-bold text-white bg-gray-800 rounded-lg px-3 py-2">
                  {countdown[unit].toString().padStart(2, '0')}
                </div>
                <div className="text-xs text-gray-400 mt-1 capitalize">{unit}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Wallet Connection */}
        {!isConnected ? (
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4 text-center">🔗 Connect Wallet to Play</h3>
            <div className="space-y-3">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => connect({ connector })}
                  disabled={connectError}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 flex items-center justify-center space-x-2"
                >
                  <span>
                    {connector.name === 'Injected' ? '🌐 Browser Wallet' : 
                     connector.name === 'WalletConnect' ? '📱 WalletConnect' :
                     connector.name === 'Coinbase Wallet' ? '🔷 Coinbase' : connector.name}
                  </span>
                </button>
              ))}
            </div>
            {connectError && (
              <div className="mt-3 text-red-400 text-sm text-center">
                {connectError.message}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Connected Wallet */}
            <div className="glass-card rounded-xl p-4 flex justify-between items-center">
              <div>
                <div className="text-sm text-gray-400">Connected</div>
                <div className="font-mono text-sm text-green-400">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </div>
              </div>
              <button
                onClick={() => disconnect()}
                className="text-red-400 hover:text-red-300 text-sm px-3 py-1 border border-red-400 rounded"
              >
                Disconnect
              </button>
            </div>

            {/* USDC Balance */}
            <div className="glass-card rounded-xl p-4 text-center">
              <div className="text-sm text-gray-400">Your USDC Balance</div>
              <div className="text-xl font-bold text-blue-400">
                {usdcBalance ? formatUnits(usdcBalance, 6) : '0.00'} USDC
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Ticket price: 5.00 USDC
              </div>
            </div>

            {/* Website Link */}
            <div className="glass-card rounded-xl p-4 text-center">
              <a 
                href="https://urim.live/lottery" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline font-medium"
              >
                🌐 Visit urim.live/lottery
              </a>
              <p className="text-sm text-gray-400 mt-1">Learn more about URIM raffles</p>
            </div>

            {/* Ticket Purchase */}
            <div className="glass-card rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4 text-center">🎫 Buy Raffle Ticket</h3>

              {/* Purchase Summary */}
              <div className="bg-gray-800 rounded-lg p-4 mb-6 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Ticket Price:</span>
                  <span className="text-green-400 font-semibold">5.00 USDC</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Your Balance:</span>
                  <span className={`font-semibold ${hasBalance ? 'text-green-400' : 'text-red-400'}`}>
                    {usdcBalance ? formatUnits(usdcBalance, 6) : '0.00'} USDC
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Approval Status:</span>
                  <span className={`font-semibold ${hasApproval ? 'text-green-400' : 'text-yellow-400'}`}>
                    {hasApproval ? '✅ Approved' : '⏳ Required'}
                  </span>
                </div>
              </div>

              {/* Buttons */}
              <div className="space-y-3">
                {!hasApproval && (
                  <button
                    onClick={handleApprove}
                    disabled={isApproving || !hasBalance}
                    className="w-full bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {isApproving ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Approving USDC...</span>
                      </>
                    ) : (
                      <span>🔓 Approve USDC Spending</span>
                    )}
                  </button>
                )}

                <button
                  onClick={handleBuyTicket}
                  disabled={isTransacting || !hasApproval || !hasBalance}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {isTransacting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>🎫 Buy Raffle Ticket ($5 USDC)</span>
                  )}
                </button>
              </div>

              {!hasBalance && (
                <div className="mt-3 text-red-400 text-sm text-center">
                  ⚠️ Insufficient USDC balance. You need 5.00 USDC to buy a ticket.
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer Info */}
        <div className="glass-card rounded-xl p-4 text-center text-sm">
          <div className="text-gray-400 mb-2">⚡ Real-time Features:</div>
          <div className="text-gray-500 space-y-1">
            <div>• Live pot tracking via Alchemy</div>
            <div>• Instant transaction notifications</div>
            <div>• Real-time participant count</div>
            <div>• 50/50 Prize Split • USDC on Base</div>
          </div>
        </div>

        {/* Contract Info */}
        <div className="text-center text-xs text-gray-500 space-y-1 pb-6">
          <div>Raffle: {RAFFLE_CONTRACT.slice(0, 10)}...{RAFFLE_CONTRACT.slice(-6)}</div>
          <div>USDC: {USDC_CONTRACT.slice(0, 10)}...{USDC_CONTRACT.slice(-6)}</div>
          <div>Base Network • ID: 874482516 • Powered by Alchemy</div>
        </div>
      </div>
    </div>
  );
}

// Export to global scope for Babel
window.RaffleApp = RaffleApp;
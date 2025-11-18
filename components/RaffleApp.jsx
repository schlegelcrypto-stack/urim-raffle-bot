import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useReadContract, useConfig } from 'wagmi';
import { writeContract, waitForTransactionReceipt } from 'wagmi/actions';
import { parseUnits, formatUnits } from 'viem';

// Contract addresses
const RAFFLE_CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69';
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base USDC

// Contract ABIs - Using the actual contract ABI you provided
const RAFFLE_ABI = [
  {
    type: 'function',
    name: 'currentRoundId',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'currentRoundEndTime',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'currentRoundTotalUSDC',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getCurrentPlayers',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getCurrentRoundInfo',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'totalPlayers', type: 'uint256' },
      { name: 'totalUSDC', type: 'uint256' },
      { name: 'timeLeft', type: 'uint256' },
      { name: 'state', type: 'uint8' }
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'TICKET_PRICE_USDC',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
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
  const [showStats, setShowStats] = useState(false);

  // Read ticket price from contract
  const { data: ticketPriceUSDC } = useReadContract({
    address: RAFFLE_CONTRACT,
    abi: RAFFLE_ABI,
    functionName: 'TICKET_PRICE_USDC',
  });

  // Read current round info
  const { data: roundInfo, refetch: refetchRoundInfo } = useReadContract({
    address: RAFFLE_CONTRACT,
    abi: RAFFLE_ABI,
    functionName: 'getCurrentRoundInfo',
    query: { refetchInterval: 30000 }
  });

  // Read current players
  const { data: currentPlayers, refetch: refetchPlayers } = useReadContract({
    address: RAFFLE_CONTRACT,
    abi: RAFFLE_ABI,
    functionName: 'getCurrentPlayers',
    query: { refetchInterval: 30000 }
  });

  // Read USDC balance
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  });

  // Read USDC allowance for raffle contract
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, RAFFLE_CONTRACT] : undefined,
    query: { enabled: !!address }
  });

  // Extract round info
  const roundId = roundInfo?.[0];
  const endTime = roundInfo?.[1];
  const totalPlayers = roundInfo?.[2];
  const totalUSDC = roundInfo?.[3];
  const timeLeft = roundInfo?.[4];
  const roundState = roundInfo?.[5];

  const playerCount = currentPlayers?.length || Number(totalPlayers) || 0;
  const hasBalance = usdcBalance && ticketPriceUSDC && usdcBalance >= ticketPriceUSDC;
  const hasAllowance = usdcAllowance && ticketPriceUSDC && usdcAllowance >= ticketPriceUSDC;

  // Real-time countdown using contract end time
  useEffect(() => {
    if (!endTime) return;
    
    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const contractEndTime = Number(endTime);
      const distance = contractEndTime - now;

      if (distance > 0) {
        setCountdown({
          hours: Math.floor(distance / 3600),
          minutes: Math.floor((distance % 3600) / 60),
          seconds: distance % 60
        });
      } else {
        setCountdown({ hours: 0, minutes: 0, seconds: 0 });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [endTime]);

  // Show notification
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Approve USDC to raffle contract
  const handleApproval = async () => {
    if (!address || !ticketPriceUSDC) return;

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
        args: [RAFFLE_CONTRACT, parseUnits('1000', 6)], // Approve 1000 USDC for multiple tickets
      });

      showNotification('💰 USDC approval submitted! Waiting for confirmation...', 'info');
      
      await waitForTransactionReceipt(wagmiConfig, { 
        hash,
        chainId: 8453
      });

      // Success feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }
      
      showNotification('✅ USDC approved! Now you can buy tickets.', 'success');
      refetchAllowance();
      
    } catch (error) {
      console.error('Approval failed:', error);
      
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
      }
      
      showNotification('❌ USDC approval failed. Please try again.', 'error');
    } finally {
      setIsApproving(false);
    }
  };

  // Buy ticket using the actual contract function
  const handleBuyTicket = async () => {
    if (!address || !hasAllowance || !hasBalance) {
      showNotification('Please ensure USDC is approved and you have sufficient balance', 'error');
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
      });

      showNotification('⏳ Transaction submitted! Waiting for confirmation...', 'info');
      
      await waitForTransactionReceipt(wagmiConfig, { 
        hash,
        chainId: 8453
      });
      
      // Success feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }
      
      const ticketPrice = ticketPriceUSDC ? formatUnits(ticketPriceUSDC, 6) : '5.00';
      showNotification(`🎉 Success! Ticket purchased for ${ticketPrice} USDC!`, 'success');
      
      // Refresh all data
      refetchBalance();
      refetchAllowance();
      refetchRoundInfo();
      refetchPlayers();
      
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

  // Calculate time left for display
  const getTimeLeftText = () => {
    if (!endTime) return 'Loading...';
    
    const now = Math.floor(Date.now() / 1000);
    const contractEndTime = Number(endTime);
    const distance = contractEndTime - now;
    
    if (distance <= 0) return 'Round Ended';
    
    const hours = Math.floor(distance / 3600);
    const minutes = Math.floor((distance % 3600) / 60);
    
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  };

  // Share function
  const shareRaffle = () => {
    const potValue = totalUSDC ? formatUnits(totalUSDC, 6) : '0';
    const ticketPrice = ticketPriceUSDC ? formatUnits(ticketPriceUSDC, 6) : '5.00';
    const shareText = `🎰 Join the URIM 50/50 Raffle! Current pot: $${potValue} USDC with ${playerCount} players 💰\n\nTicket price: $${ticketPrice} USDC • Base Network\nRound ID: ${roundId || 'Loading'}`;
    const shareUrl = 'https://t.me/URIMRaffleBot';
    
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`
      );
    } else {
      // Fallback for testing
      const fullUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
      window.open(fullUrl, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900 text-white overflow-hidden">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 left-4 right-4 z-50 p-4 rounded-lg shadow-lg transition-all duration-300 ${
          notification.type === 'success' ? 'bg-green-600' :
          notification.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        }`}>
          <p className="text-sm font-medium">{notification.message}</p>
        </div>
      )}

      {/* Stats Modal */}
      {showStats && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-xl p-6 max-w-sm w-full">
            <h2 className="text-xl font-bold text-center mb-6">🎰 URIM 50/50 Raffle Stats 🎰</h2>
            <div className="space-y-4">
              <div className="glass-card rounded-lg p-4">
                <div className="text-sm text-gray-400">Round ID</div>
                <div className="text-lg font-bold">{roundId?.toString() || 'Loading...'}</div>
              </div>
              <div className="glass-card rounded-lg p-4">
                <div className="text-sm text-gray-400">Total Pool</div>
                <div className="text-lg font-bold text-green-400">
                  ${totalUSDC ? formatUnits(totalUSDC, 6) : '0.00'} USDC
                </div>
              </div>
              <div className="glass-card rounded-lg p-4">
                <div className="text-sm text-gray-400">Players</div>
                <div className="text-lg font-bold text-blue-400">{playerCount}</div>
              </div>
              <div className="glass-card rounded-lg p-4">
                <div className="text-sm text-gray-400">Time Left</div>
                <div className="text-lg font-bold text-purple-400">{getTimeLeftText()}</div>
              </div>
              <div className="glass-card rounded-lg p-4">
                <div className="text-sm text-gray-400">Ticket Price</div>
                <div className="text-lg font-bold text-yellow-400">
                  ${ticketPriceUSDC ? formatUnits(ticketPriceUSDC, 6) : '5.00'} USDC
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowStats(false)}
              className="w-full mt-6 bg-gradient-to-r from-gray-600 to-gray-700 text-white py-2 rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto p-4 space-y-6">
        {/* Header with Artwork */}
        <div className="text-center pt-6 pb-4">
          <div className="relative mb-4">
            <img 
              src="https://www.infinityg.ai/assets/user-upload/1763445354073-ChatGPT Image Nov 12, 2025, 09_22_49 AM.png"
              alt="URIM 5050 Raffle"
              className="w-full max-w-sm mx-auto rounded-xl shadow-2xl animate-pulse-glow"
            />
            <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs px-2 py-1 rounded-full">
              ID: {roundId?.toString() || 'Loading'}
            </div>
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            URIM 50/50 Raffle
          </h1>
          <p className="text-sm text-gray-300 mt-1">Direct USDC payments on Base Network!</p>
        </div>

        {/* Current Pot */}
        <div className="glass-card rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-blue-300 mb-2">🏆 Current Pot</h2>
          <div className="text-3xl font-bold text-green-400 mb-1">
            ${totalUSDC ? formatUnits(totalUSDC, 6) : '0.00'} USDC
          </div>
          <div className="text-sm text-gray-400">
            {playerCount} players • Base Network
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

        {/* Stats Button */}
        <button
          onClick={() => setShowStats(true)}
          className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105"
        >
          📊 View Raffle Stats
        </button>

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
                     connector.name === 'WalletConnect' ? '📱 WalletConnect (Custom Chain)' :
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
                Ticket price: {ticketPriceUSDC ? formatUnits(ticketPriceUSDC, 6) : '5.00'} USDC
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
                  <span className="text-green-400 font-semibold">
                    {ticketPriceUSDC ? formatUnits(ticketPriceUSDC, 6) : '5.00'} USDC
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Your Balance:</span>
                  <span className={`font-semibold ${hasBalance ? 'text-green-400' : 'text-red-400'}`}>
                    {usdcBalance ? formatUnits(usdcBalance, 6) : '0.00'} USDC
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">USDC Approval:</span>
                  <span className={`font-semibold ${hasAllowance ? 'text-green-400' : 'text-yellow-400'}`}>
                    {hasAllowance ? '✅ Approved' : '⏳ Required'}
                  </span>
                </div>
              </div>

              {/* Buttons */}
              <div className="space-y-3">
                {!hasAllowance && (
                  <button
                    onClick={handleApproval}
                    disabled={isApproving || !hasBalance}
                    className="w-full bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {isApproving ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Approving USDC...</span>
                      </>
                    ) : (
                      <span>💰 Approve USDC</span>
                    )}
                  </button>
                )}

                <button
                  onClick={handleBuyTicket}
                  disabled={isTransacting || !hasAllowance || !hasBalance}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {isTransacting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>🎫 Buy Ticket</span>
                  )}
                </button>
              </div>

              {!hasBalance && (
                <div className="mt-3 text-red-400 text-sm text-center">
                  ⚠️ Insufficient USDC balance. You need {ticketPriceUSDC ? formatUnits(ticketPriceUSDC, 6) : '5.00'} USDC to buy a ticket.
                </div>
              )}

              {!hasAllowance && hasBalance && (
                <div className="mt-3 text-yellow-400 text-sm text-center">
                  💰 First approve USDC spending for the raffle contract.
                </div>
              )}
            </div>

            {/* Share Button */}
            <button
              onClick={shareRaffle}
              className="w-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105"
            >
              📢 Share with Friends
            </button>
          </>
        )}

        {/* Footer Info */}
        <div className="glass-card rounded-xl p-4 text-center text-sm">
          <div className="text-gray-400 mb-2">🔮 Features:</div>
          <div className="text-gray-500 space-y-1">
            <div>• Direct USDC Payments</div>
            <div>• 50/50 Prize Split</div>
            <div>• Base Network</div>
            <div>• Chainlink VRF Randomness</div>
          </div>
        </div>

        {/* Contract Info */}
        <div className="text-center text-xs text-gray-500 space-y-1 pb-6">
          <div>Contract: {RAFFLE_CONTRACT.slice(0, 10)}...{RAFFLE_CONTRACT.slice(-6)}</div>
          <div>USDC: {USDC_CONTRACT.slice(0, 10)}...{USDC_CONTRACT.slice(-6)}</div>
          <div>Base Network • Round: {roundId?.toString() || 'Loading'}</div>
        </div>
      </div>
    </div>
  );
}

// Export to global scope for Babel
window.RaffleApp = RaffleApp;
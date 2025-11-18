import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useReadContract, useConfig } from 'wagmi';
import { writeContract, waitForTransactionReceipt, getBalance, readContract } from 'wagmi/actions';
import { parseUnits, formatUnits } from 'viem';

// Contract addresses
const RAFFLE_CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69';
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base USDC

// Expanded Contract ABIs with real raffle functions
const RAFFLE_ABI = [
  {
    type: 'function',
    name: 'buyTicket',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'currentPot',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalParticipants',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'ticketPrice',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'drawTime',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isActive',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'participants',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getParticipantCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
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
  const [raffleData, setRaffleData] = useState({
    pot: '0',
    participants: 0,
    ticketPrice: '5',
    isActive: true,
    drawTime: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  // Read contract data - Current Pot
  const { data: currentPot, refetch: refetchPot } = useReadContract({
    address: RAFFLE_CONTRACT,
    abi: RAFFLE_ABI,
    functionName: 'currentPot',
    query: { enabled: true, refetchInterval: 10000 }
  });

  // Read contract data - Total Participants
  const { data: totalParticipants, refetch: refetchParticipants } = useReadContract({
    address: RAFFLE_CONTRACT,
    abi: RAFFLE_ABI,
    functionName: 'getParticipantCount',
    query: { enabled: true, refetchInterval: 10000 }
  });

  // Read contract data - Ticket Price
  const { data: contractTicketPrice } = useReadContract({
    address: RAFFLE_CONTRACT,
    abi: RAFFLE_ABI,
    functionName: 'ticketPrice',
    query: { enabled: true }
  });

  // Read contract data - Draw Time
  const { data: drawTime } = useReadContract({
    address: RAFFLE_CONTRACT,
    abi: RAFFLE_ABI,
    functionName: 'drawTime',
    query: { enabled: true, refetchInterval: 30000 }
  });

  // Read contract data - Is Active
  const { data: isActive } = useReadContract({
    address: RAFFLE_CONTRACT,
    abi: RAFFLE_ABI,
    functionName: 'isActive',
    query: { enabled: true, refetchInterval: 10000 }
  });

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

  // Get ticket price from contract or fallback to 5 USDC
  const TICKET_PRICE = contractTicketPrice || parseUnits('5', 6);

  // Check if user has approved enough USDC
  const hasApproval = usdcAllowance && usdcAllowance >= TICKET_PRICE;
  const hasBalance = usdcBalance && usdcBalance >= TICKET_PRICE;

  // Update raffle data when contract data changes
  useEffect(() => {
    const newRaffleData = {
      pot: currentPot ? formatUnits(currentPot, 6) : '0',
      participants: totalParticipants ? Number(totalParticipants) : 0,
      ticketPrice: contractTicketPrice ? formatUnits(contractTicketPrice, 6) : '5',
      isActive: isActive ?? true,
      drawTime: drawTime ? Number(drawTime) : 0
    };

    setRaffleData(newRaffleData);
    setIsLoading(false);

    console.log('Raffle data updated:', newRaffleData);
  }, [currentPot, totalParticipants, contractTicketPrice, isActive, drawTime]);

  // Fetch additional contract data periodically
  const fetchContractData = async () => {
    try {
      if (!wagmiConfig) return;

      // Try to read contract data directly if hooks fail
      const [pot, participants, price, active, nextDraw] = await Promise.allSettled([
        readContract(wagmiConfig, {
          address: RAFFLE_CONTRACT,
          abi: RAFFLE_ABI,
          functionName: 'currentPot',
          chainId: 8453
        }),
        readContract(wagmiConfig, {
          address: RAFFLE_CONTRACT,
          abi: RAFFLE_ABI,
          functionName: 'getParticipantCount',
          chainId: 8453
        }),
        readContract(wagmiConfig, {
          address: RAFFLE_CONTRACT,
          abi: RAFFLE_ABI,
          functionName: 'ticketPrice',
          chainId: 8453
        }),
        readContract(wagmiConfig, {
          address: RAFFLE_CONTRACT,
          abi: RAFFLE_ABI,
          functionName: 'isActive',
          chainId: 8453
        }),
        readContract(wagmiConfig, {
          address: RAFFLE_CONTRACT,
          abi: RAFFLE_ABI,
          functionName: 'drawTime',
          chainId: 8453
        })
      ]);

      // Update state with successful reads
      const updates = {};
      if (pot.status === 'fulfilled') {
        updates.pot = formatUnits(pot.value, 6);
      }
      if (participants.status === 'fulfilled') {
        updates.participants = Number(participants.value);
      }
      if (price.status === 'fulfilled') {
        updates.ticketPrice = formatUnits(price.value, 6);
      }
      if (active.status === 'fulfilled') {
        updates.isActive = active.value;
      }
      if (nextDraw.status === 'fulfilled') {
        updates.drawTime = Number(nextDraw.value);
      }

      if (Object.keys(updates).length > 0) {
        setRaffleData(prev => ({ ...prev, ...updates }));
      }

    } catch (error) {
      console.error('Failed to fetch contract data:', error);
    }
  };

  // Initialize and set up polling
  useEffect(() => {
    fetchContractData();
    const contractInterval = setInterval(fetchContractData, 15000);
    return () => clearInterval(contractInterval);
  }, [wagmiConfig]);

  // Countdown timer using actual draw time
  useEffect(() => {
    const timer = setInterval(() => {
      if (raffleData.drawTime > 0) {
        const now = Math.floor(Date.now() / 1000);
        const distance = raffleData.drawTime - now;

        if (distance > 0) {
          setCountdown({
            hours: Math.floor(distance / 3600),
            minutes: Math.floor((distance % 3600) / 60),
            seconds: distance % 60
          });
        } else {
          // Draw time passed, refresh contract data
          fetchContractData();
          refetchPot();
          refetchParticipants();
        }
      } else {
        // Fallback: next hour countdown if no draw time from contract
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
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [raffleData.drawTime]);

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
      
      showNotification(`🎉 Success! Ticket purchased for $${raffleData.ticketPrice} USDC!`, 'success');
      
      // Refresh data
      refetchBalance();
      refetchAllowance();
      refetchPot();
      refetchParticipants();
      fetchContractData();
      
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900 text-white overflow-hidden">
      {/* Testing Banner */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-400 text-black text-center py-2 px-4 text-sm font-semibold">
        Testing Mode - @schlegelcrypto
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
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            URIM 50/50 Raffle
          </h1>
          <p className="text-sm text-gray-300 mt-1">Win big on Base Network with USDC!</p>
        </div>

        {/* Current Pot */}
        <div className="glass-card rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-blue-300 mb-2">🏆 Current Pot</h2>
          <div className="text-3xl font-bold text-green-400 mb-1">
            {isLoading ? (
              <div className="animate-pulse">Loading...</div>
            ) : (
              `$${parseFloat(raffleData.pot).toFixed(2)} USDC`
            )}
          </div>
          <div className="text-sm text-gray-400">
            {raffleData.participants} tickets sold • Base Network
          </div>
          {!raffleData.isActive && (
            <div className="text-sm text-red-400 mt-2">
              ⚠️ Raffle is currently inactive
            </div>
          )}
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
          {raffleData.drawTime > 0 && (
            <div className="text-xs text-gray-500 mt-2 text-center">
              Draw at: {new Date(raffleData.drawTime * 1000).toLocaleString()}
            </div>
          )}
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
                Ticket price: {raffleData.ticketPrice} USDC
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
                  <span className="text-green-400 font-semibold">{raffleData.ticketPrice} USDC</span>
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
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Raffle Status:</span>
                  <span className={`font-semibold ${raffleData.isActive ? 'text-green-400' : 'text-red-400'}`}>
                    {raffleData.isActive ? '🟢 Active' : '🔴 Inactive'}
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
                  disabled={isTransacting || !hasApproval || !hasBalance || !raffleData.isActive}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {isTransacting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>🎫 Buy Raffle Ticket (${raffleData.ticketPrice} USDC)</span>
                  )}
                </button>
              </div>

              {!hasBalance && (
                <div className="mt-3 text-red-400 text-sm text-center">
                  ⚠️ Insufficient USDC balance. You need {raffleData.ticketPrice} USDC to buy a ticket.
                </div>
              )}
              
              {!raffleData.isActive && (
                <div className="mt-3 text-red-400 text-sm text-center">
                  ⚠️ Raffle is currently inactive. Please wait for the next round.
                </div>
              )}
            </div>
          </>
        )}

        {/* Live Stats */}
        <div className="glass-card rounded-xl p-4 text-center text-sm">
          <div className="text-gray-400 mb-2">📊 Live Stats:</div>
          <div className="text-gray-500 space-y-1">
            <div>• Pot: ${raffleData.pot} USDC</div>
            <div>• Participants: {raffleData.participants}</div>
            <div>• Winner Gets: ${(parseFloat(raffleData.pot) * 0.5).toFixed(2)} USDC</div>
            <div>• Status: {raffleData.isActive ? 'Active' : 'Inactive'}</div>
          </div>
          {isLoading && (
            <div className="text-yellow-400 mt-2">
              🔄 Loading real-time data...
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="glass-card rounded-xl p-4 text-center text-sm">
          <div className="text-gray-400 mb-2">🔮 Features:</div>
          <div className="text-gray-500 space-y-1">
            <div>• Real-time contract data</div>
            <div>• USDC Payments on Base</div>
            <div>• 50/50 Prize Split</div>
            <div>• Instant Payouts</div>
          </div>
        </div>

        {/* Contract Info */}
        <div className="text-center text-xs text-gray-500 space-y-1 pb-6">
          <div>Raffle: {RAFFLE_CONTRACT.slice(0, 10)}...{RAFFLE_CONTRACT.slice(-6)}</div>
          <div>USDC: {USDC_CONTRACT.slice(0, 10)}...{USDC_CONTRACT.slice(-6)}</div>
          <div>Base Network • Live Contract Data</div>
        </div>
      </div>
    </div>
  );
}

// Export to global scope for Babel
window.RaffleApp = RaffleApp;
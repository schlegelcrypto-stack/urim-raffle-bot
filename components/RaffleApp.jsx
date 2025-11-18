import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useReadContract, useConfig } from 'wagmi';
import { writeContract, waitForTransactionReceipt } from 'wagmi/actions';
import { parseUnits, formatUnits } from 'viem';

// Contract addresses
const RAFFLE_CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69';
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base USDC

// Complete Contract ABI with all functions
const RAFFLE_ABI = [
  {"inputs":[{"internalType":"uint256","name":"subscriptionId","type":"uint256"}],"stateMutability":"nonpayable","type":"constructor"},
  {"inputs":[{"internalType":"address","name":"have","type":"address"},{"internalType":"address","name":"want","type":"address"}],"name":"OnlyCoordinatorCanFulfill","type":"error"},
  {"inputs":[{"internalType":"address","name":"have","type":"address"},{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"coordinator","type":"address"}],"name":"OnlyOwnerOrCoordinator","type":"error"},
  {"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"error"},
  {"inputs":[],"name":"ZeroAddress","type":"error"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"vrfCoordinator","type":"address"}],"name":"CoordinatorSet","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"roundId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"requestId","type":"uint256"}],"name":"DrawInitiated","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"EmergencyWithdraw","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"roundId","type":"uint256"},{"indexed":true,"internalType":"address","name":"winner","type":"address"}],"name":"ManualWinnerSelected","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"}],"name":"OwnershipTransferRequested","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"}],"name":"OwnershipTransferred","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"roundId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"endTime","type":"uint256"}],"name":"RoundStarted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"player","type":"address"},{"indexed":true,"internalType":"uint256","name":"roundId","type":"uint256"}],"name":"TicketPurchased","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"roundId","type":"uint256"},{"indexed":true,"internalType":"address","name":"winner","type":"address"},{"indexed":false,"internalType":"uint256","name":"payoutUSDC","type":"uint256"}],"name":"WinnerSelected","type":"event"},
  {"inputs":[],"name":"ROUND_DURATION","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"TICKET_PRICE_USDC","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"USDC","outputs":[{"internalType":"contract IERC20","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"acceptOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"buyTicket","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"callbackGasLimit","outputs":[{"internalType":"uint32","name":"","type":"uint32"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"currentRoundEndTime","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"currentRoundId","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"currentRoundPlayers","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"currentRoundTotalUSDC","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"drawWinner","outputs":[{"internalType":"uint256","name":"requestId","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"emergencyResetState","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"emergencySelectWinner","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"emergencyWithdrawUSDC","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"getContractBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"getCurrentPlayers","outputs":[{"internalType":"address[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"getCurrentRoundInfo","outputs":[{"internalType":"uint256","name":"roundId","type":"uint256"},{"internalType":"uint256","name":"endTime","type":"uint256"},{"internalType":"uint256","name":"totalPlayers","type":"uint256"},{"internalType":"uint256","name":"totalUSDC","type":"uint256"},{"internalType":"uint256","name":"timeLeft","type":"uint256"},{"internalType":"enum FiftyFiftyRaffle.RoundState","name":"state","type":"uint8"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"roundId","type":"uint256"}],"name":"getRoundResult","outputs":[{"components":[{"internalType":"address","name":"winner","type":"address"},{"internalType":"uint256","name":"totalPotUSDC","type":"uint256"},{"internalType":"uint256","name":"winnerPayoutUSDC","type":"uint256"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"internalType":"struct FiftyFiftyRaffle.RoundResult","name":"","type":"tuple"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"keyHash","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"numWords","outputs":[{"internalType":"uint32","name":"","type":"uint32"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"requestId","type":"uint256"},{"internalType":"uint256[]","name":"randomWords","type":"uint256[]"}],"name":"rawFulfillRandomWords","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"requestConfirmations","outputs":[{"internalType":"uint16","name":"","type":"uint16"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"roundResults","outputs":[{"internalType":"address","name":"winner","type":"address"},{"internalType":"uint256","name":"totalPotUSDC","type":"uint256"},{"internalType":"uint256","name":"winnerPayoutUSDC","type":"uint256"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"roundState","outputs":[{"internalType":"enum FiftyFiftyRaffle.RoundState","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"s_subscriptionId","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"s_vrfCoordinator","outputs":[{"internalType":"contract IVRFCoordinatorV2Plus","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"_vrfCoordinator","type":"address"}],"name":"setCoordinator","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"to","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"}
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
  const [localTimeLeft, setLocalTimeLeft] = useState(0);

  // Read contract data with more frequent polling (every 15 seconds)
  const { data: roundInfo, refetch: refetchRoundInfo } = useReadContract({
    address: RAFFLE_CONTRACT,
    abi: RAFFLE_ABI,
    functionName: 'getCurrentRoundInfo',
    query: { 
      refetchInterval: 15000, // Poll every 15 seconds
      staleTime: 10000, // Consider data stale after 10 seconds
      gcTime: 20000
    }
  });

  const { data: players, refetch: refetchPlayers } = useReadContract({
    address: RAFFLE_CONTRACT,
    abi: RAFFLE_ABI,
    functionName: 'getCurrentPlayers',
    query: { 
      refetchInterval: 15000, // Poll every 15 seconds
      staleTime: 10000
    }
  });

  const { data: ticketPrice, refetch: refetchTicketPrice } = useReadContract({
    address: RAFFLE_CONTRACT,
    abi: RAFFLE_ABI,
    functionName: 'TICKET_PRICE_USDC',
    query: { 
      refetchInterval: 60000 // Price changes less frequently
    }
  });

  // Read USDC balance with frequent updates
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { 
      enabled: !!address,
      refetchInterval: 20000 // Check balance every 20 seconds
    }
  });

  // Read USDC allowance
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, RAFFLE_CONTRACT] : undefined,
    query: { 
      enabled: !!address,
      refetchInterval: 30000
    }
  });

  // Parse contract data
  const currentRoundId = roundInfo ? Number(roundInfo[0]) : 0;
  const endTime = roundInfo ? Number(roundInfo[1]) : 0;
  const totalPlayers = roundInfo ? Number(roundInfo[2]) : 0;
  const totalUSDC = roundInfo ? roundInfo[3] : 0n;
  const timeLeftSeconds = roundInfo ? Number(roundInfo[4]) : 0;
  const roundState = roundInfo ? Number(roundInfo[5]) : 0;

  const TICKET_PRICE = ticketPrice || parseUnits('5', 6); // Default to 5 USDC

  // Check if user has approved enough USDC and has balance
  const hasApproval = usdcAllowance && usdcAllowance >= TICKET_PRICE;
  const hasBalance = usdcBalance && usdcBalance >= TICKET_PRICE;

  // Local countdown with automatic refresh on changes
  useEffect(() => {
    if (timeLeftSeconds > 0) {
      setLocalTimeLeft(timeLeftSeconds);
    }
  }, [timeLeftSeconds]);

  useEffect(() => {
    const timer = setInterval(() => {
      setLocalTimeLeft(prev => {
        if (prev <= 0) {
          // When countdown reaches 0, force refresh data
          refetchRoundInfo();
          refetchPlayers();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [refetchRoundInfo, refetchPlayers]);

  // Format countdown
  useEffect(() => {
    if (localTimeLeft > 0) {
      const hours = Math.floor(localTimeLeft / 3600);
      const minutes = Math.floor((localTimeLeft % 3600) / 60);
      const seconds = localTimeLeft % 60;
      setCountdown({ hours, minutes, seconds });
    } else {
      setCountdown({ hours: 0, minutes: 0, seconds: 0 });
    }
  }, [localTimeLeft]);

  // Format time left display
  const formatTimeLeft = () => {
    if (localTimeLeft <= 0) return "Drawing Soon";
    if (localTimeLeft < 60) return `${localTimeLeft}s`;
    if (localTimeLeft < 3600) return `${Math.floor(localTimeLeft / 60)}m ${localTimeLeft % 60}s`;
    
    const hours = Math.floor(localTimeLeft / 3600);
    const minutes = Math.floor((localTimeLeft % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  // Show notification
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Force refresh all contract data
  const refreshAllData = async () => {
    try {
      await Promise.all([
        refetchRoundInfo(),
        refetchPlayers(),
        refetchBalance(),
        refetchAllowance(),
        refetchTicketPrice()
      ]);
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
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
      
      // Refresh data after approval
      setTimeout(refreshAllData, 2000);
      
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

  // Buy ticket function with immediate data refresh
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
      
      const ticketPriceFormatted = formatUnits(TICKET_PRICE, 6);
      showNotification(`🎉 Success! Ticket purchased for $${ticketPriceFormatted} USDC!`, 'success');
      
      // Immediate data refresh after successful purchase
      setTimeout(refreshAllData, 3000);
      
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

  // Share function
  const shareRaffle = () => {
    const potValue = totalUSDC ? formatUnits(totalUSDC, 6) : '0';
    const shareText = `🎰 Join the URIM 50/50 Raffle! Current pot: $${potValue} USDC 💰\n\nID: 874482516`;
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
            <h3 className="text-xl font-bold text-center mb-4">🎰 URIM 50/50 Raffle Stats 🎰</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Round ID:</span>
                <span className="text-white font-semibold">#{currentRoundId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Total Pot:</span>
                <span className="text-green-400 font-semibold">
                  ${totalUSDC ? formatUnits(totalUSDC, 6) : '0.00'} USDC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Players:</span>
                <span className="text-blue-400 font-semibold">{totalPlayers}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Time Left:</span>
                <span className="text-purple-400 font-semibold">{formatTimeLeft()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Contract:</span>
                <span className="text-gray-300 font-mono text-xs">
                  {RAFFLE_CONTRACT.slice(0, 6)}...{RAFFLE_CONTRACT.slice(-4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Network:</span>
                <span className="text-gray-300">Base (ID: 8453)</span>
              </div>
            </div>
            <button
              onClick={() => setShowStats(false)}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg"
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
              ID: 874482516
            </div>
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            URIM 50/50 Raffle
          </h1>
          <p className="text-sm text-gray-300 mt-1">Win big on Base Network with USDC!</p>
        </div>

        {/* Real-time Stats Display */}
        <div className="glass-card rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-blue-300 mb-2">🏆 Live Stats</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-2xl font-bold text-green-400">
                ${totalUSDC ? formatUnits(totalUSDC, 6) : '0.00'}
              </div>
              <div className="text-xs text-gray-400">Total Pot (USDC)</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-400">
                {totalPlayers}
              </div>
              <div className="text-xs text-gray-400">Players</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm text-gray-400">Round #{currentRoundId}</div>
            <button
              onClick={() => setShowStats(true)}
              className="mt-2 text-purple-400 hover:text-purple-300 text-sm underline"
            >
              📊 View Detailed Stats
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
          <div className="text-center mt-3 text-sm text-gray-400">
            {formatTimeLeft()}
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
                Ticket price: {formatUnits(TICKET_PRICE, 6)} USDC
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
                  <span className="text-green-400 font-semibold">{formatUnits(TICKET_PRICE, 6)} USDC</span>
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
                    <span>🎫 Buy Raffle Ticket (${formatUnits(TICKET_PRICE, 6)} USDC)</span>
                  )}
                </button>
              </div>

              {!hasBalance && (
                <div className="mt-3 text-red-400 text-sm text-center">
                  ⚠️ Insufficient USDC balance. You need {formatUnits(TICKET_PRICE, 6)} USDC to buy a ticket.
                </div>
              )}
            </div>

            {/* Manual Refresh Button */}
            <button
              onClick={refreshAllData}
              className="w-full bg-gradient-to-r from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300"
            >
              🔄 Refresh Data
            </button>

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
            <div>• USDC Payments on Base</div>
            <div>• 50/50 Prize Split</div>
            <div>• Instant Payouts</div>
            <div>• Real-time Updates</div>
          </div>
        </div>

        {/* Contract Info */}
        <div className="text-center text-xs text-gray-500 space-y-1 pb-6">
          <div>Raffle: {RAFFLE_CONTRACT.slice(0, 10)}...{RAFFLE_CONTRACT.slice(-6)}</div>
          <div>USDC: {USDC_CONTRACT.slice(0, 10)}...{USDC_CONTRACT.slice(-6)}</div>
          <div>Base Network • ID: 874482516</div>
        </div>
      </div>
    </div>
  );
}

// Export to global scope for Babel
window.RaffleApp = RaffleApp;
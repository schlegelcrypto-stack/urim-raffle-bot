import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useReadContract, useConfig } from 'wagmi';
import { writeContract, waitForTransactionReceipt, readContract } from 'wagmi/actions';
import { parseUnits, formatUnits } from 'viem';

// Contract addresses on Base
const RAFFLE_CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69';
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// ERC-20 ABI for USDC interactions
const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
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
  }
];

// Raffle contract ABI for USDC payments
const RAFFLE_ABI = [
  {
    type: 'function',
    name: 'buyTicketsWithUSDC',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'usdcAmount', type: 'uint256' }
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  }
];

function RaffleApp() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const wagmiConfig = useConfig();
  
  // State
  const [selectedTickets, setSelectedTickets] = useState(1);
  const [isTransacting, setIsTransacting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState(0n);
  const [usdcAllowance, setUsdcAllowance] = useState(0n);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [notification, setNotification] = useState(null);

  // Constants
  const TICKET_PRICE_USD = 5; // $5 per ticket
  const USDC_DECIMALS = 6; // USDC has 6 decimals
  const ticketPriceUSDC = parseUnits(TICKET_PRICE_USD.toString(), USDC_DECIMALS);
  const totalCostUSDC = BigInt(selectedTickets) * ticketPriceUSDC;

  // Read USDC balance
  const { data: usdcBalanceData } = useReadContract({
    address: USDC_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { 
      enabled: !!address,
      refetchInterval: 10000
    }
  });

  // Read USDC allowance for raffle contract
  const { data: usdcAllowanceData } = useReadContract({
    address: USDC_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, RAFFLE_CONTRACT] : undefined,
    query: { 
      enabled: !!address,
      refetchInterval: 10000
    }
  });

  // Update state when data changes
  useEffect(() => {
    if (usdcBalanceData !== undefined) {
      setUsdcBalance(usdcBalanceData);
    }
  }, [usdcBalanceData]);

  useEffect(() => {
    if (usdcAllowanceData !== undefined) {
      setUsdcAllowance(usdcAllowanceData);
    }
  }, [usdcAllowanceData]);

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
  const handleApproveUSDC = async () => {
    if (!address) {
      showNotification('Please connect your wallet first', 'error');
      return;
    }

    setIsApproving(true);
    
    try {
      // Haptic feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
      }

      // Approve maximum amount for convenience (users won't need to approve again)
      const maxApproval = parseUnits('1000000', USDC_DECIMALS); // 1M USDC max

      const hash = await writeContract(wagmiConfig, {
        address: USDC_CONTRACT,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [RAFFLE_CONTRACT, maxApproval],
      });

      showNotification('Approval submitted! Waiting for confirmation...', 'info');
      
      await waitForTransactionReceipt(wagmiConfig, { 
        hash,
        chainId: 8453
      });
      
      showNotification('✅ USDC approval successful! You can now buy tickets.', 'success');
      
    } catch (error) {
      console.error('Approval failed:', error);
      
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
      }
      
      let errorMessage = 'Approval failed. Please try again.';
      if (error.message.includes('rejected')) {
        errorMessage = 'Approval was rejected.';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient ETH for gas fees.';
      }
      
      showNotification(errorMessage, 'error');
    } finally {
      setIsApproving(false);
    }
  };

  // Buy tickets function
  const handleBuyTickets = async () => {
    if (!address) {
      showNotification('Please connect your wallet first', 'error');
      return;
    }

    // Check USDC balance
    if (usdcBalance < totalCostUSDC) {
      showNotification(`Insufficient USDC balance. Need ${formatUnits(totalCostUSDC, USDC_DECIMALS)} USDC`, 'error');
      return;
    }

    // Check USDC allowance
    if (usdcAllowance < totalCostUSDC) {
      showNotification('Please approve USDC spending first', 'error');
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
        functionName: 'buyTicketsWithUSDC',
        args: [BigInt(selectedTickets), totalCostUSDC],
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
      
      showNotification(
        `🎉 Success! Bought ${selectedTickets} ticket${selectedTickets > 1 ? 's' : ''} for ${selectedTickets * TICKET_PRICE_USD} USDC!`,
        'success'
      );
      
    } catch (error) {
      console.error('Transaction failed:', error);
      
      // Error feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
      }
      
      let errorMessage = 'Transaction failed. Please try again.';
      if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient ETH for gas or USDC for tickets.';
      } else if (error.message.includes('rejected')) {
        errorMessage = 'Transaction was rejected.';
      } else if (error.message.includes('allowance')) {
        errorMessage = 'Insufficient USDC allowance. Please approve first.';
      }
      
      showNotification(errorMessage, 'error');
    } finally {
      setIsTransacting(false);
    }
  };

  // Share function
  const shareRaffle = () => {
    const totalPotUSD = (Number(formatUnits(usdcBalance, USDC_DECIMALS)) * selectedTickets * TICKET_PRICE_USD).toFixed(2);
    const shareText = `🎰 Join the URIM 50/50 Raffle! Tickets: $5 USDC each on Base Network 💰`;
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

  // Check if user needs to approve USDC
  const needsApproval = address && usdcAllowance < totalCostUSDC;
  const hasInsufficientUSDC = address && usdcBalance < totalCostUSDC;

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

      <div className="max-w-md mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="text-center pt-6 pb-4">
          <img 
            src="https://i.imgur.com/0v5f4rK.png" 
            alt="URIM Raffle"
            className="w-40 h-40 object-contain mx-auto mb-4 rounded-xl shadow-2xl"
          />
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            URIM 50/50 Raffle
          </h1>
          <p className="text-sm text-gray-300 mt-1">Win big on Base Network with USDC!</p>
        </div>

        {/* Current Pot - Mock display since we can't read the actual contract balance */}
        <div className="glass-card rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-blue-300 mb-2">🏆 Current Pot</h2>
          <div className="text-3xl font-bold text-green-400 mb-1">
            Growing...
          </div>
          <div className="text-sm text-gray-400">
            50% to winner, powered by USDC
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

        {/* Pricing Info */}
        <div className="glass-card rounded-xl p-4 text-center">
          <div className="text-sm text-gray-300">
            <div>💰 Ticket Price: <span className="text-green-400 font-semibold">${TICKET_PRICE_USD}.00 USDC</span></div>
            <div>🔷 Payment Token: <span className="text-blue-400">USDC (Base Network)</span></div>
            <div>⚡ Low gas fees on Base Network</div>
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
                <div className="text-xs text-gray-500 mt-1">
                  USDC: {formatUnits(usdcBalance, USDC_DECIMALS).slice(0, 8)}
                </div>
              </div>
              <button
                onClick={() => disconnect()}
                className="text-red-400 hover:text-red-300 text-sm px-3 py-1 border border-red-400 rounded"
              >
                Disconnect
              </button>
            </div>

            {/* USDC Approval */}
            {needsApproval && (
              <div className="glass-card rounded-xl p-6 border-2 border-yellow-500/50">
                <h3 className="text-lg font-semibold mb-4 text-center text-yellow-400">
                  🔐 Approve USDC Spending
                </h3>
                <p className="text-sm text-gray-300 mb-4 text-center">
                  You need to approve the raffle contract to spend your USDC tokens before buying tickets.
                </p>
                <button
                  onClick={handleApproveUSDC}
                  disabled={isApproving}
                  className="w-full bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {isApproving ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Approving...</span>
                    </>
                  ) : (
                    <span>🔓 Approve USDC</span>
                  )}
                </button>
              </div>
            )}

            {/* Ticket Purchase */}
            <div className="glass-card rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4 text-center">🎫 Buy Tickets</h3>

              {/* Ticket Selection */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                {[1, 5, 20, 100].map((count) => (
                  <button
                    key={count}
                    onClick={() => setSelectedTickets(count)}
                    className={`p-4 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105 ${
                      selectedTickets === count
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    <div className="text-lg">{count} Ticket{count > 1 ? 's' : ''}</div>
                    <div className="text-sm opacity-80">{count * TICKET_PRICE_USD} USDC</div>
                  </button>
                ))}
              </div>

              {/* Purchase Summary */}
              <div className="bg-gray-800 rounded-lg p-4 mb-6 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Tickets:</span>
                  <span className="text-white">{selectedTickets}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Total Cost:</span>
                  <span className="text-green-400 font-semibold">
                    {selectedTickets * TICKET_PRICE_USD} USDC
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Your USDC Balance:</span>
                  <span className={`${hasInsufficientUSDC ? 'text-red-400' : 'text-blue-400'}`}>
                    {formatUnits(usdcBalance, USDC_DECIMALS).slice(0, 8)} USDC
                  </span>
                </div>
              </div>

              {/* Buy Button */}
              <button
                onClick={handleBuyTickets}
                disabled={isTransacting || needsApproval || hasInsufficientUSDC}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isTransacting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Processing...</span>
                  </>
                ) : needsApproval ? (
                  <span>❗ Approve USDC First</span>
                ) : hasInsufficientUSDC ? (
                  <span>❌ Insufficient USDC</span>
                ) : (
                  <span>🎫 Buy {selectedTickets} Ticket{selectedTickets > 1 ? 's' : ''}</span>
                )}
              </button>

              {hasInsufficientUSDC && (
                <div className="mt-3 text-center text-sm text-yellow-400">
                  💡 You can buy USDC on Coinbase or other exchanges and send it to your Base wallet
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

        {/* Instructions for new users */}
        <div className="glass-card rounded-xl p-4 text-center text-sm">
          <div className="text-gray-400 mb-2">📝 How to Play:</div>
          <div className="text-gray-500 space-y-1">
            <div>1. Connect your Base Network wallet</div>
            <div>2. Ensure you have USDC on Base</div>
            <div>3. Approve USDC spending (one-time)</div>
            <div>4. Buy tickets for $5 USDC each</div>
            <div>5. Win 50% of the total pot!</div>
          </div>
        </div>

        {/* Contract Info */}
        <div className="text-center text-xs text-gray-500 space-y-1 pb-6">
          <div>Raffle: {RAFFLE_CONTRACT.slice(0, 10)}...{RAFFLE_CONTRACT.slice(-6)}</div>
          <div>USDC: {USDC_CONTRACT.slice(0, 10)}...{USDC_CONTRACT.slice(-6)}</div>
          <div>Base Network • Secure & Low Cost</div>
        </div>
      </div>
    </div>
  );
}

// Export to global scope for Babel
window.RaffleApp = RaffleApp;
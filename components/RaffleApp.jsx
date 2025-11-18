import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useReadContract, useConfig } from 'wagmi';
import { writeContract, waitForTransactionReceipt, readContract } from 'wagmi/actions';
import { parseUnits, formatUnits } from 'viem';

// Contract addresses
const RAFFLE_CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69';
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base USDC

// USDC has 6 decimals
const USDC_DECIMALS = 6;
const TICKET_PRICE_USDC = '5'; // $5 per ticket

// Contract ABIs
const RAFFLE_ABI = [
  {
    type: 'function',
    name: 'buyTicket',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  }
];

const ERC20_ABI = [
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
  },
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
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
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
  const [contractBalance, setContractBalance] = useState(0n);
  const [userUSDCBalance, setUserUSDCBalance] = useState(0n);
  const [usdcAllowance, setUsdcAllowance] = useState(0n);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [notification, setNotification] = useState(null);

  // Read user USDC balance
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { 
      enabled: !!address,
      refetchInterval: 30000
    }
  });

  // Read USDC allowance for raffle contract
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: USDC_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, RAFFLE_CONTRACT] : undefined,
    query: { 
      enabled: !!address,
      refetchInterval: 30000
    }
  });

  // Calculate costs
  const totalCostUSDC = parseUnits((selectedTickets * 5).toString(), USDC_DECIMALS);
  const needsApproval = allowanceData ? allowanceData < totalCostUSDC : true;
  const hasInsufficientBalance = usdcBalance ? usdcBalance < totalCostUSDC : true;

  // Update state when contract data changes
  useEffect(() => {
    if (usdcBalance) setUserUSDCBalance(usdcBalance);
    if (allowanceData) setUsdcAllowance(allowanceData);
  }, [usdcBalance, allowanceData]);

  // Fetch contract USDC balance
  const fetchContractBalance = async () => {
    try {
      const balance = await readContract(wagmiConfig, {
        address: USDC_CONTRACT,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [RAFFLE_CONTRACT],
        chainId: 8453
      });
      setContractBalance(balance);
    } catch (error) {
      console.error('Failed to fetch contract balance:', error);
    }
  };

  // Initialize and set up polling
  useEffect(() => {
    if (address) {
      fetchContractBalance();
      const balanceInterval = setInterval(fetchContractBalance, 30000);
      return () => clearInterval(balanceInterval);
    }
  }, [address, wagmiConfig]);

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

      // Approve maximum amount to avoid repeated approvals
      const maxAmount = parseUnits('1000000', USDC_DECIMALS); // 1M USDC max allowance

      const hash = await writeContract(wagmiConfig, {
        address: USDC_CONTRACT,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [RAFFLE_CONTRACT, maxAmount],
      });

      showNotification('Approval transaction submitted! Waiting for confirmation...', 'info');
      
      await waitForTransactionReceipt(wagmiConfig, { 
        hash,
        chainId: 8453
      });
      
      // Success feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }
      
      showNotification('✅ USDC spending approved! You can now buy tickets.', 'success');
      
      // Refresh allowance
      refetchAllowance();
      
    } catch (error) {
      console.error('Approval failed:', error);
      
      // Error feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
      }
      
      let errorMessage = 'Approval failed. Please try again.';
      if (error.message.includes('rejected')) {
        errorMessage = 'Approval was rejected.';
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

    if (hasInsufficientBalance) {
      showNotification(`Insufficient USDC balance. Need ${formatUnits(totalCostUSDC, USDC_DECIMALS)} USDC`, 'error');
      return;
    }

    if (needsApproval) {
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
        functionName: 'buyTicket',
        args: [BigInt(selectedTickets)],
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
        `🎉 Success! Bought ${selectedTickets} ticket${selectedTickets > 1 ? 's' : ''} for $${(selectedTickets * 5).toFixed(2)} USDC!`,
        'success'
      );
      
      // Refresh balances
      fetchContractBalance();
      refetchBalance();
      refetchAllowance();
      
    } catch (error) {
      console.error('Transaction failed:', error);
      
      // Error feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
      }
      
      let errorMessage = 'Transaction failed. Please try again.';
      if (error.message.includes('insufficient')) {
        errorMessage = 'Insufficient USDC balance for this transaction.';
      } else if (error.message.includes('rejected')) {
        errorMessage = 'Transaction was rejected.';
      } else if (error.message.includes('allowance')) {
        errorMessage = 'USDC allowance too low. Please approve again.';
      }
      
      showNotification(errorMessage, 'error');
    } finally {
      setIsTransacting(false);
    }
  };

  // Share function
  const shareRaffle = () => {
    const potValueUSD = contractBalance ? formatUnits(contractBalance, USDC_DECIMALS) : '0';
    const shareText = `🎰 Join the URIM 50/50 Raffle! Current pot: $${potValueUSD} USDC 💰`;
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

  const potValueUSD = contractBalance ? formatUnits(contractBalance, USDC_DECIMALS) : '0';
  const userBalanceUSD = userUSDCBalance ? formatUnits(userUSDCBalance, USDC_DECIMALS) : '0';

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
          <p className="text-sm text-gray-300 mt-1">Win big with USDC on Base!</p>
        </div>

        {/* Current Pot */}
        <div className="glass-card rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-blue-300 mb-2">🏆 Current Pot</h2>
          <div className="text-3xl font-bold text-green-400 mb-1">
            ${potValueUSD} USDC
          </div>
          <div className="text-sm text-gray-400">
            Base Network • USDC Pool
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
            <div>💰 Ticket Price: <span className="text-green-400 font-semibold">$5.00 USDC</span></div>
            <div>🌐 Network: <span className="text-blue-400">Base</span></div>
            <div>💎 Token: <span className="text-yellow-400">USDC</span></div>
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
            <div className="glass-card rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
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
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">USDC Balance:</span>
                  <span className="text-green-400 font-semibold">{userBalanceUSD} USDC</span>
                </div>
              </div>
            </div>

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
                    <div className="text-sm opacity-80">${(count * 5).toFixed(2)} USDC</div>
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
                  <span className="text-green-400 font-semibold">{selectedTickets * 5} USDC</span>
                </div>
                {hasInsufficientBalance && (
                  <div className="text-red-400 text-sm text-center">
                    ⚠️ Insufficient USDC balance
                  </div>
                )}
              </div>

              {/* Approval Button */}
              {needsApproval && !hasInsufficientBalance && (
                <button
                  onClick={handleApprove}
                  disabled={isApproving}
                  className="w-full bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center space-x-2 mb-4"
                >
                  {isApproving ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Approving USDC...</span>
                    </>
                  ) : (
                    <span>✅ Approve USDC Spending</span>
                  )}
                </button>
              )}

              {/* Buy Button */}
              <button
                onClick={handleBuyTickets}
                disabled={isTransacting || hasInsufficientBalance || needsApproval}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isTransacting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>🎫 Buy {selectedTickets} Ticket{selectedTickets > 1 ? 's' : ''}</span>
                )}
              </button>
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
          <div className="text-gray-400 mb-2">🔮 Coming Soon:</div>
          <div className="text-gray-500 space-y-1">
            <div>• 5% Treasury Fee</div>
            <div>• 2% Affiliate Rewards</div>
            <div>• Solana Chain Support</div>
          </div>
        </div>

        {/* Contract Info */}
        <div className="text-center text-xs text-gray-500 space-y-1 pb-6">
          <div>Raffle: {RAFFLE_CONTRACT.slice(0, 10)}...{RAFFLE_CONTRACT.slice(-6)}</div>
          <div>USDC: {USDC_CONTRACT.slice(0, 10)}...{USDC_CONTRACT.slice(-6)}</div>
          <div>Base Network • Powered by USDC</div>
        </div>
      </div>
    </div>
  );
}

// Export to global scope for Babel
window.RaffleApp = RaffleApp;
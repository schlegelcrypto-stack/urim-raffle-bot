import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useReadContract, useConfig } from 'wagmi';
import { writeContract, waitForTransactionReceipt, getBalance } from 'wagmi/actions';
import { parseEther, formatEther } from 'viem';

// Contract addresses and ABIs
const RAFFLE_CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69';
const CHAINLINK_ETH_USD = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70';

const RAFFLE_ABI = [
  {
    type: 'function',
    name: 'buyTickets',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'payable',
  }
];

const CHAINLINK_ABI = [
  {
    type: 'function',
    name: 'latestRoundData',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' }
    ],
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
  const [contractBalance, setContractBalance] = useState(0n);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [notification, setNotification] = useState(null);

  // Read ETH/USD price from Chainlink
  const { data: priceData, isLoading: priceLoading } = useReadContract({
    address: CHAINLINK_ETH_USD,
    abi: CHAINLINK_ABI,
    functionName: 'latestRoundData',
    query: { 
      refetchInterval: 60000,
      enabled: true
    }
  });

  // Calculate prices
  const ethPriceUSD = priceData ? Number(priceData[1]) / 1e8 : 0;
  const ticketPriceETH = ethPriceUSD > 0 ? 5 / ethPriceUSD : 0;
  const totalCostETH = ticketPriceETH * selectedTickets;
  const potValueUSD = contractBalance && ethPriceUSD > 0 
    ? (Number(formatEther(contractBalance)) * ethPriceUSD).toFixed(2)
    : '0.00';

  // Fetch contract balance
  const fetchContractBalance = async () => {
    try {
      const balance = await getBalance(wagmiConfig, {
        address: RAFFLE_CONTRACT,
        chainId: 8453
      });
      setContractBalance(balance.value);
    } catch (error) {
      console.error('Failed to fetch contract balance:', error);
    }
  };

  // Initialize and set up polling
  useEffect(() => {
    fetchContractBalance();
    const balanceInterval = setInterval(fetchContractBalance, 30000);
    return () => clearInterval(balanceInterval);
  }, [wagmiConfig]);

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

  // Buy tickets function
  const handleBuyTickets = async () => {
    if (!address || totalCostETH <= 0) {
      showNotification('Please connect your wallet first', 'error');
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
        functionName: 'buyTickets',
        args: [BigInt(selectedTickets)],
        value: parseEther(totalCostETH.toFixed(18)),
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
        `🎉 Success! Bought ${selectedTickets} ticket${selectedTickets > 1 ? 's' : ''} for $${(selectedTickets * 5).toFixed(2)}!`,
        'success'
      );
      
      // Refresh contract balance
      fetchContractBalance();
      
    } catch (error) {
      console.error('Transaction failed:', error);
      
      // Error feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
      }
      
      let errorMessage = 'Transaction failed. Please try again.';
      if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient ETH balance for this transaction.';
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
    const shareText = `🎰 Join the URIM 50/50 Raffle! Current pot: $${potValueUSD} 💰`;
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
          <p className="text-sm text-gray-300 mt-1">Win big on Base Network!</p>
        </div>

        {/* Current Pot */}
        <div className="glass-card rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-blue-300 mb-2">🏆 Current Pot</h2>
          <div className="text-3xl font-bold text-green-400 mb-1">
            ${potValueUSD}
          </div>
          <div className="text-sm text-gray-400">
            {contractBalance ? formatEther(contractBalance).slice(0, 8) : '0.0000'} ETH
          </div>
          {priceLoading && (
            <div className="text-xs text-yellow-400 mt-1">Updating prices...</div>
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
        </div>

        {/* Pricing Info */}
        {ethPriceUSD > 0 && (
          <div className="glass-card rounded-xl p-4 text-center">
            <div className="text-sm text-gray-300">
              <div>💰 Ticket Price: <span className="text-green-400 font-semibold">$5.00 USD</span></div>
              <div>⚡ ETH Price: <span className="text-blue-400">${ethPriceUSD.toFixed(2)}</span></div>
              <div>🎫 Cost per ticket: <span className="text-yellow-400">{ticketPriceETH.toFixed(6)} ETH</span></div>
            </div>
          </div>
        )}

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
                    <div className="text-sm opacity-80">${(count * 5).toFixed(2)}</div>
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
                  <span className="text-gray-400">Total USD:</span>
                  <span className="text-green-400 font-semibold">${(selectedTickets * 5).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Total ETH:</span>
                  <span className="text-yellow-400">{totalCostETH.toFixed(6)} ETH</span>
                </div>
              </div>

              {/* Buy Button */}
              <button
                onClick={handleBuyTickets}
                disabled={isTransacting || totalCostETH <= 0 || !ethPriceUSD}
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
          <div>Contract: {RAFFLE_CONTRACT.slice(0, 10)}...{RAFFLE_CONTRACT.slice(-6)}</div>
          <div>Base Network • Powered by Chainlink</div>
        </div>
      </div>
    </div>
  );
}

// Export to global scope for Babel
window.RaffleApp = RaffleApp;
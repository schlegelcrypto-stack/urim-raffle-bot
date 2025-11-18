import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useReadContract, useConfig, useSwitchChain } from 'wagmi';
import { writeContract, waitForTransactionReceipt, getBalance } from 'wagmi/actions';
import { parseUnits, formatUnits } from 'viem';
import { base, mainnet, polygon, arbitrum, optimism, bsc } from 'wagmi/chains';

// Contract addresses per chain
const CHAIN_CONFIG = {
  [base.id]: {
    name: 'Base',
    raffle: '0x36086C5950325B971E5DC11508AB67A1CE30Dc69',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    rpc: 'https://mainnet.base.org',
    explorer: 'https://basescan.org'
  },
  [mainnet.id]: {
    name: 'Ethereum',
    raffle: '0x36086C5950325B971E5DC11508AB67A1CE30Dc69', // Would need actual deployment
    usdc: '0xA0b86a33E6417C5CE0b82F1E21c40c8fC6BA40BB', // USDC on Ethereum
    rpc: 'https://eth-mainnet.public.blastapi.io',
    explorer: 'https://etherscan.io'
  },
  [polygon.id]: {
    name: 'Polygon',
    raffle: '0x36086C5950325B971E5DC11508AB67A1CE30Dc69', // Would need actual deployment
    usdc: '0x2791Bca1f2de4661ED88A30B99D60ab99e3797E1', // USDC on Polygon
    rpc: 'https://polygon-rpc.com',
    explorer: 'https://polygonscan.com'
  },
  [arbitrum.id]: {
    name: 'Arbitrum',
    raffle: '0x36086C5950325B971E5DC11508AB67A1CE30Dc69', // Would need actual deployment
    usdc: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', // USDC on Arbitrum
    rpc: 'https://arb1.arbitrum.io/rpc',
    explorer: 'https://arbiscan.io'
  },
  [optimism.id]: {
    name: 'Optimism',
    raffle: '0x36086C5950325B971E5DC11508AB67A1CE30Dc69', // Would need actual deployment
    usdc: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', // USDC on Optimism
    rpc: 'https://mainnet.optimism.io',
    explorer: 'https://optimistic.etherscan.io'
  },
  [bsc.id]: {
    name: 'BSC',
    raffle: '0x36086C5950325B971E5DC11508AB67A1CE30Dc69', // Would need actual deployment
    usdc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC on BSC
    rpc: 'https://bsc-dataseed.binance.org',
    explorer: 'https://bscscan.com'
  }
};

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
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const wagmiConfig = useConfig();
  
  // State
  const [isTransacting, setIsTransacting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [notification, setNotification] = useState(null);
  const [contractBalance, setContractBalance] = useState(0n);
  const [selectedChain, setSelectedChain] = useState(base.id);
  const [showChainSelector, setShowChainSelector] = useState(false);

  const currentChainConfig = CHAIN_CONFIG[selectedChain] || CHAIN_CONFIG[base.id];
  const TICKET_PRICE = parseUnits('5', 6); // 5 USDC (6 decimals)

  // Read USDC balance
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: currentChainConfig.usdc,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && chain?.id === selectedChain }
  });

  // Read USDC allowance
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: currentChainConfig.usdc,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, currentChainConfig.raffle] : undefined,
    query: { enabled: !!address && chain?.id === selectedChain }
  });

  // Check if user has approved enough USDC
  const hasApproval = usdcAllowance && usdcAllowance >= TICKET_PRICE;
  const hasBalance = usdcBalance && usdcBalance >= TICKET_PRICE;
  const isCorrectChain = chain?.id === selectedChain;

  // Available chains for selection
  const availableChains = [
    { id: base.id, name: 'Base', icon: '🔵' },
    { id: mainnet.id, name: 'Ethereum', icon: '⚡' },
    { id: polygon.id, name: 'Polygon', icon: '🟣' },
    { id: arbitrum.id, name: 'Arbitrum', icon: '🔷' },
    { id: optimism.id, name: 'Optimism', icon: '🔴' },
    { id: bsc.id, name: 'BSC', icon: '🟡' }
  ];

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

  // Switch chain function
  const handleSwitchChain = async (chainId) => {
    if (!isConnected) {
      setSelectedChain(chainId);
      return;
    }

    setIsSwitching(true);
    try {
      await switchChain({ chainId });
      setSelectedChain(chainId);
      showNotification(`✅ Switched to ${CHAIN_CONFIG[chainId].name}`, 'success');
    } catch (error) {
      console.error('Failed to switch chain:', error);
      showNotification('Failed to switch network. Please try manually.', 'error');
    } finally {
      setIsSwitching(false);
      setShowChainSelector(false);
    }
  };

  // Approve USDC spending
  const handleApprove = async () => {
    if (!address || !isCorrectChain) return;

    setIsApproving(true);
    try {
      // Haptic feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
      }

      const hash = await writeContract(wagmiConfig, {
        address: currentChainConfig.usdc,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [currentChainConfig.raffle, parseUnits('1000000', 6)], // Approve large amount
      });

      showNotification('Approval submitted! Waiting for confirmation...', 'info');
      
      await waitForTransactionReceipt(wagmiConfig, { 
        hash,
        chainId: selectedChain
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
    if (!address || !hasApproval || !hasBalance || !isCorrectChain) {
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
        address: currentChainConfig.raffle,
        abi: RAFFLE_ABI,
        functionName: 'buyTicket',
        args: [],
      });

      showNotification('Transaction submitted! Waiting for confirmation...', 'info');
      
      await waitForTransactionReceipt(wagmiConfig, { 
        hash,
        chainId: selectedChain
      });
      
      // Success feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }
      
      showNotification(`🎉 Success! Ticket purchased for $5 USDC on ${currentChainConfig.name}!`, 'success');
      
      // Refresh balances
      refetchBalance();
      refetchAllowance();
      
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
    const potValue = contractBalance ? formatUnits(contractBalance, 6) : '0';
    const shareText = `🎰 Join the URIM 50/50 Raffle! Multi-Chain Support 🌍\nCurrent pot: $${potValue} USDC 💰\nSupported: Ethereum, Base, Polygon, Arbitrum, Optimism, BSC\n\nID: 874482516`;
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
        {/* Header with Artwork */}
        <div className="text-center pt-6 pb-4">
          <div className="relative mb-4">
            <img 
              src="https://www.infinityg.ai/assets/user-upload/1763444371347-1723df0c-8fbf-4fa3-9dda-241ca90a93cd.jpg"
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
          <p className="text-sm text-gray-300 mt-1">Multi-Chain Support • USDC Payments</p>
        </div>

        {/* Chain Selector */}
        <div className="glass-card rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-blue-300">🌍 Select Network</h3>
            <button
              onClick={() => setShowChainSelector(!showChainSelector)}
              className="text-blue-400 hover:text-blue-300"
            >
              {showChainSelector ? '▲' : '▼'}
            </button>
          </div>
          
          <div className="flex items-center justify-between mb-4 p-3 bg-gray-800 rounded-lg">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">
                {availableChains.find(c => c.id === selectedChain)?.icon || '🔵'}
              </span>
              <div>
                <div className="font-semibold">{currentChainConfig.name}</div>
                <div className="text-xs text-gray-400">
                  {isConnected && !isCorrectChain ? 'Switch Required' : 'Selected Network'}
                </div>
              </div>
            </div>
            {isConnected && !isCorrectChain && (
              <button
                onClick={() => handleSwitchChain(selectedChain)}
                disabled={isSwitching}
                className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs px-3 py-1 rounded"
              >
                {isSwitching ? 'Switching...' : 'Switch'}
              </button>
            )}
          </div>

          {showChainSelector && (
            <div className="grid grid-cols-2 gap-2">
              {availableChains.map((chainOption) => (
                <button
                  key={chainOption.id}
                  onClick={() => handleSwitchChain(chainOption.id)}
                  disabled={isSwitching}
                  className={`p-3 rounded-lg text-left transition-all ${
                    selectedChain === chainOption.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">{chainOption.icon}</span>
                    <span className="font-medium">{chainOption.name}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Current Pot */}
        <div className="glass-card rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-blue-300 mb-2">🏆 Current Pot</h2>
          <div className="text-3xl font-bold text-green-400 mb-1">
            $0.00 USDC
          </div>
          <div className="text-sm text-gray-400">
            {currentChainConfig.name} • Powered by USDC
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
                     connector.name === 'WalletConnect' ? '📱 WalletConnect (Custom Chain)' :
                     connector.name === 'Coinbase Wallet' ? '🔷 Coinbase' : connector.name}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 p-3 bg-blue-900 bg-opacity-50 rounded-lg">
              <p className="text-sm text-blue-200 text-center">
                💡 WalletConnect supports all major chains: Ethereum, Base, Polygon, Arbitrum, Optimism, BSC
              </p>
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
                <div className="text-xs text-gray-500">
                  {chain?.name || 'Unknown Network'}
                </div>
              </div>
              <button
                onClick={() => disconnect()}
                className="text-red-400 hover:text-red-300 text-sm px-3 py-1 border border-red-400 rounded"
              >
                Disconnect
              </button>
            </div>

            {/* Network Warning */}
            {!isCorrectChain && (
              <div className="glass-card rounded-xl p-4 border-yellow-500">
                <div className="flex items-center space-x-3 text-yellow-400">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <div className="font-semibold">Wrong Network</div>
                    <div className="text-sm text-yellow-300">
                      Please switch to {currentChainConfig.name} to continue
                    </div>
                  </div>
                  <button
                    onClick={() => handleSwitchChain(selectedChain)}
                    disabled={isSwitching}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white text-sm px-3 py-2 rounded ml-auto"
                  >
                    {isSwitching ? 'Switching...' : 'Switch'}
                  </button>
                </div>
              </div>
            )}

            {/* USDC Balance */}
            {isCorrectChain && (
              <div className="glass-card rounded-xl p-4 text-center">
                <div className="text-sm text-gray-400">Your USDC Balance</div>
                <div className="text-xl font-bold text-blue-400">
                  {usdcBalance ? formatUnits(usdcBalance, 6) : '0.00'} USDC
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Ticket price: 5.00 USDC • {currentChainConfig.name}
                </div>
              </div>
            )}

            {/* Ticket Purchase */}
            {isCorrectChain && (
              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4 text-center">🎫 Buy Raffle Ticket</h3>

                {/* Purchase Summary */}
                <div className="bg-gray-800 rounded-lg p-4 mb-6 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Network:</span>
                    <span className="text-blue-400 font-semibold">{currentChainConfig.name}</span>
                  </div>
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
            )}

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

            {/* Share Button */}
            <button
              onClick={shareRaffle}
              className="w-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105"
            >
              📢 Share Multi-Chain Raffle
            </button>
          </>
        )}

        {/* Features Info */}
        <div className="glass-card rounded-xl p-4 text-center text-sm">
          <div className="text-gray-400 mb-2">🌍 Multi-Chain Features:</div>
          <div className="text-gray-500 space-y-1">
            <div>• USDC Payments on 6+ Networks</div>
            <div>• WalletConnect Custom Chain Support</div>
            <div>• 50/50 Prize Split</div>
            <div>• Instant Cross-Chain Payouts</div>
          </div>
        </div>

        {/* Contract Info */}
        <div className="text-center text-xs text-gray-500 space-y-1 pb-6">
          <div>Current Network: {currentChainConfig.name}</div>
          <div>Raffle: {currentChainConfig.raffle.slice(0, 10)}...{currentChainConfig.raffle.slice(-6)}</div>
          <div>USDC: {currentChainConfig.usdc.slice(0, 10)}...{currentChainConfig.usdc.slice(-6)}</div>
          <div>Multi-Chain Support • ID: 874482516</div>
        </div>
      </div>
    </div>
  );
}

// Export to global scope for Babel
window.RaffleApp = RaffleApp;
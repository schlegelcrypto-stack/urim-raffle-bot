import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useReadContract, useConfig } from 'wagmi';
import { writeContract, waitForTransactionReceipt, getBalance, readContract } from 'wagmi/actions';
import { parseUnits, formatUnits, encodeFunctionData } from 'viem';

// Contract addresses
const RAFFLE_CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69';
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base USDC
const PERMIT2_CONTRACT = '0x000000000022D473030F116dDEE9F6B43aC78BA3'; // Universal Permit2

// Contract ABIs
const RAFFLE_ABI = [
  {
    type: 'function',
    name: 'buyTicketWithPermit2',
    inputs: [
      {
        name: 'permit',
        type: 'tuple',
        components: [
          { name: 'permitted', type: 'tuple', components: [
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ]},
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      },
      { name: 'signature', type: 'bytes' }
    ],
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

const PERMIT2_ABI = [
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' }
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'DOMAIN_SEPARATOR',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
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

  const TICKET_PRICE = parseUnits('5', 6); // 5 USDC (6 decimals)

  // Read USDC balance
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  });

  // Read USDC allowance to Permit2
  const { data: permit2Allowance, refetch: refetchPermit2Allowance } = useReadContract({
    address: USDC_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, PERMIT2_CONTRACT] : undefined,
    query: { enabled: !!address }
  });

  // Check if user has approved USDC to Permit2
  const hasPermit2Approval = permit2Allowance && permit2Allowance >= TICKET_PRICE;
  const hasBalance = usdcBalance && usdcBalance >= TICKET_PRICE;

  // Fetch contract balance (for pot display)
  const fetchContractBalance = async () => {
    try {
      const balance = await getBalance(wagmiConfig, {
        address: RAFFLE_CONTRACT,
        token: USDC_CONTRACT,
        chainId: 8453
      });
      setContractBalance(balance.value);
    } catch (error) {
      console.error('Failed to fetch contract balance:', error);
    }
  };

  // Initialize and set up polling
  useEffect(() => {
    if (isConnected) {
      fetchContractBalance();
      const balanceInterval = setInterval(fetchContractBalance, 30000);
      return () => clearInterval(balanceInterval);
    }
  }, [wagmiConfig, isConnected]);

  // Countdown timer
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

  // Helper function to create permit signature
  const createPermitSignature = async (amount, deadline, nonce) => {
    if (!address) throw new Error('No address connected');

    // Get domain separator from Permit2
    const domainSeparator = await readContract(wagmiConfig, {
      address: PERMIT2_CONTRACT,
      abi: PERMIT2_ABI,
      functionName: 'DOMAIN_SEPARATOR',
    });

    const domain = {
      name: 'Permit2',
      chainId: 8453,
      verifyingContract: PERMIT2_CONTRACT,
    };

    const types = {
      PermitSingle: [
        { name: 'details', type: 'PermitDetails' },
        { name: 'spender', type: 'address' },
        { name: 'sigDeadline', type: 'uint256' }
      ],
      PermitDetails: [
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint160' },
        { name: 'expiration', type: 'uint48' },
        { name: 'nonce', type: 'uint48' }
      ]
    };

    const message = {
      details: {
        token: USDC_CONTRACT,
        amount: amount,
        expiration: deadline,
        nonce: nonce
      },
      spender: RAFFLE_CONTRACT,
      sigDeadline: deadline
    };

    // Request signature from wallet
    const signature = await window.ethereum?.request({
      method: 'eth_signTypedData_v4',
      params: [address, JSON.stringify({
        types,
        domain,
        primaryType: 'PermitSingle',
        message
      })],
    });

    return signature;
  };

  // Approve USDC to Permit2 (one-time setup)
  const handleApprovePermit2 = async () => {
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
        args: [PERMIT2_CONTRACT, parseUnits('1000000', 6)], // Large allowance for Permit2
      });

      showNotification('Permit2 approval submitted! Waiting for confirmation...', 'info');
      
      await waitForTransactionReceipt(wagmiConfig, { 
        hash,
        chainId: 8453
      });

      // Success feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }
      
      showNotification('✅ Permit2 approved! You can now buy tickets with exact amounts only.', 'success');
      refetchPermit2Allowance();
      
    } catch (error) {
      console.error('Permit2 approval failed:', error);
      
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
      }
      
      showNotification('Permit2 approval failed. Please try again.', 'error');
    } finally {
      setIsApproving(false);
    }
  };

  // Buy ticket with Permit2
  const handleBuyTicketWithPermit2 = async () => {
    if (!address || !hasPermit2Approval || !hasBalance) {
      showNotification('Please ensure you have USDC balance and Permit2 approval', 'error');
      return;
    }

    setIsTransacting(true);
    
    try {
      // Haptic feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
      }

      // Get current nonce from Permit2
      const [amount, expiration, nonce] = await readContract(wagmiConfig, {
        address: PERMIT2_CONTRACT,
        abi: PERMIT2_ABI,
        functionName: 'allowance',
        args: [address, USDC_CONTRACT, RAFFLE_CONTRACT],
      });

      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      // Create permit signature for exact ticket price
      showNotification('Please sign the permit for exactly 5 USDC...', 'info');
      
      const signature = await createPermitSignature(TICKET_PRICE, deadline, nonce);

      const permitData = {
        permitted: {
          token: USDC_CONTRACT,
          amount: TICKET_PRICE
        },
        nonce: nonce,
        deadline: deadline
      };

      showNotification('Submitting ticket purchase with permit...', 'info');

      const hash = await writeContract(wagmiConfig, {
        address: RAFFLE_CONTRACT,
        abi: RAFFLE_ABI,
        functionName: 'buyTicketWithPermit2',
        args: [permitData, signature],
      });
      
      await waitForTransactionReceipt(wagmiConfig, { 
        hash,
        chainId: 8453
      });
      
      // Success feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }
      
      showNotification('🎉 Success! Ticket purchased securely with Permit2!', 'success');
      
      // Refresh balances
      refetchBalance();
      refetchPermit2Allowance();
      fetchContractBalance();
      
    } catch (error) {
      console.error('Permit2 transaction failed:', error);
      
      // Error feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
      }
      
      let errorMessage = 'Transaction failed. Please try again.';
      if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient USDC balance for this transaction.';
      } else if (error.message.includes('rejected')) {
        errorMessage = 'Transaction was rejected.';
      } else if (error.message.includes('User rejected')) {
        errorMessage = 'Permit signature was rejected.';
      }
      
      showNotification(errorMessage, 'error');
    } finally {
      setIsTransacting(false);
    }
  };

  // Share function
  const shareRaffle = () => {
    const potValue = contractBalance ? formatUnits(contractBalance, 6) : '0';
    const shareText = `🎰 Join the URIM 50/50 Raffle! Current pot: $${potValue} USDC 💰\n\nSecure Permit2 payments - no unlimited approvals!\nID: 874482516`;
    const shareUrl = 'https://t.me/URIMRaffleBot';
    
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`
      );
    } else {
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
          <p className="text-sm text-gray-300 mt-1">Secure Permit2 payments on Base!</p>
        </div>

        {/* Security Badge */}
        <div className="glass-card rounded-xl p-4 text-center border-green-500/30">
          <div className="flex items-center justify-center space-x-2 mb-2">
            <span className="text-green-400">🔒</span>
            <span className="text-sm font-semibold text-green-400">Enhanced Security</span>
          </div>
          <p className="text-xs text-gray-300">
            Powered by Permit2 - No unlimited token approvals required!
          </p>
        </div>

        {/* Current Pot */}
        <div className="glass-card rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-blue-300 mb-2">🏆 Current Pot</h2>
          <div className="text-3xl font-bold text-green-400 mb-1">
            ${contractBalance ? formatUnits(contractBalance, 6) : '0.00'} USDC
          </div>
          <div className="text-sm text-gray-400">
            Base Network • Exact-amount approvals only
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
                Ticket price: 5.00 USDC (exact amount)
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

              {/* Permit2 Info */}
              <div className="bg-green-900/20 rounded-lg p-3 mb-4 border border-green-500/30">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="text-green-400">🔒</span>
                  <span className="text-sm font-semibold text-green-400">Permit2 Security</span>
                </div>
                <p className="text-xs text-gray-300">
                  Sign permits for exact amounts only. No unlimited approvals required!
                </p>
              </div>

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
                  <span className="text-gray-400">Permit2 Setup:</span>
                  <span className={`font-semibold ${hasPermit2Approval ? 'text-green-400' : 'text-yellow-400'}`}>
                    {hasPermit2Approval ? '✅ Ready' : '⏳ Required'}
                  </span>
                </div>
              </div>

              {/* Buttons */}
              <div className="space-y-3">
                {!hasPermit2Approval && (
                  <button
                    onClick={handleApprovePermit2}
                    disabled={isApproving || !hasBalance}
                    className="w-full bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {isApproving ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Setting up Permit2...</span>
                      </>
                    ) : (
                      <span>🔓 Enable Permit2 (One-time setup)</span>
                    )}
                  </button>
                )}

                <button
                  onClick={handleBuyTicketWithPermit2}
                  disabled={isTransacting || !hasPermit2Approval || !hasBalance}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {isTransacting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>🔒 Buy Ticket with Permit2 ($5 USDC)</span>
                  )}
                </button>
              </div>

              {!hasBalance && (
                <div className="mt-3 text-red-400 text-sm text-center">
                  ⚠️ Insufficient USDC balance. You need 5.00 USDC to buy a ticket.
                </div>
              )}
            </div>

            {/* Share Button */}
            <button
              onClick={shareRaffle}
              className="w-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105"
            >
              📢 Share Secure Raffle
            </button>
          </>
        )}

        {/* Footer Info */}
        <div className="glass-card rounded-xl p-4 text-center text-sm">
          <div className="text-gray-400 mb-2">🔮 Enhanced Features:</div>
          <div className="text-gray-500 space-y-1">
            <div>• Permit2 Security (No unlimited approvals)</div>
            <div>• Exact-amount transactions only</div>
            <div>• USDC Payments on Base</div>
            <div>• 50/50 Prize Split</div>
          </div>
        </div>

        {/* Contract Info */}
        <div className="text-center text-xs text-gray-500 space-y-1 pb-6">
          <div>Raffle: {RAFFLE_CONTRACT.slice(0, 10)}...{RAFFLE_CONTRACT.slice(-6)}</div>
          <div>USDC: {USDC_CONTRACT.slice(0, 10)}...{USDC_CONTRACT.slice(-6)}</div>
          <div>Permit2: {PERMIT2_CONTRACT.slice(0, 10)}...{PERMIT2_CONTRACT.slice(-6)}</div>
          <div>Base Network • ID: 874482516</div>
        </div>
      </div>
    </div>
  );
}

// Export to global scope for Babel
window.RaffleApp = RaffleApp;
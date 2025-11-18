import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useReadContract, useConfig } from 'wagmi';
import { writeContract, waitForTransactionReceipt } from 'wagmi/actions';
import { parseEther, formatEther } from 'viem';

const RAFFLE_CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69';
const CHAINLINK_ETH_USD = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70';

const RAFFLE_ABI = [
  {
    type: 'function',
    name: 'buyTickets',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'getContractBalance',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
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
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [selectedTickets, setSelectedTickets] = useState(1);
  const [isTransacting, setIsTransacting] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const wagmiConfig = useConfig();

  // Read contract balance
  const { data: contractBalance, refetch: refetchBalance } = useReadContract({
    address: RAFFLE_CONTRACT,
    abi: RAFFLE_ABI,
    functionName: 'getContractBalance',
    query: { refetchInterval: 30000 }
  });

  // Read ETH/USD price from Chainlink
  const { data: priceData } = useReadContract({
    address: CHAINLINK_ETH_USD,
    abi: CHAINLINK_ABI,
    functionName: 'latestRoundData',
    query: { refetchInterval: 60000 }
  });

  // Calculate ETH price and ticket cost
  const ethPriceUSD = priceData ? Number(priceData[1]) / 1e8 : 0;
  const ticketPriceETH = ethPriceUSD > 0 ? 5 / ethPriceUSD : 0;
  const totalCostETH = ticketPriceETH * selectedTickets;
  const potValueUSD = contractBalance && ethPriceUSD > 0 
    ? (Number(formatEther(contractBalance)) * ethPriceUSD).toFixed(2)
    : '0';

  // Countdown timer (mock implementation - replace with actual contract data)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const nextDraw = new Date();
      nextDraw.setHours(nextDraw.getHours() + 1, 0, 0, 0); // Next hour
      const distance = nextDraw.getTime() - now;

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

  const handleBuyTickets = async () => {
    if (!address || totalCostETH <= 0) return;

    setIsTransacting(true);
    try {
      const hash = await writeContract(wagmiConfig, {
        address: RAFFLE_CONTRACT,
        abi: RAFFLE_ABI,
        functionName: 'buyTickets',
        args: [BigInt(selectedTickets)],
        value: parseEther(totalCostETH.toString()),
      });

      setTxHash(hash);
      await waitForTransactionReceipt(wagmiConfig, { hash });
      
      // Refresh balance after successful transaction
      refetchBalance();
      
      // Show success message
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(
          `🎉 Success! You bought ${selectedTickets} ticket(s) for $${(selectedTickets * 5).toFixed(2)}!`
        );
      }
      
      setTxHash(null);
    } catch (error) {
      console.error('Transaction failed:', error);
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert('Transaction failed. Please try again.');
      }
    } finally {
      setIsTransacting(false);
    }
  };

  const shareRaffle = () => {
    if (window.Telegram?.WebApp) {
      const shareText = `🎰 Join the URIM 50/50 Raffle! Current pot: $${potValueUSD} 💰`;
      const shareUrl = `https://t.me/URIMRaffleBot`;
      window.Telegram.WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 text-white p-4">
      <div className="max-w-md mx-auto">
        {/* Header with Logo */}
        <div className="text-center mb-8 pt-4">
          <img 
            src="https://i.imgur.com/0v5f4rK.png" 
            alt="URIM Raffle"
            className="w-48 h-auto mx-auto mb-4 rounded-lg shadow-lg"
          />
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            URIM 50/50 Raffle
          </h1>
        </div>

        {/* Current Pot */}
        <div className="glass-card rounded-xl p-6 mb-6 text-center">
          <h2 className="text-lg font-semibold text-blue-300 mb-2">Current Pot</h2>
          <div className="text-4xl font-bold text-green-400 mb-2">
            ${potValueUSD}
          </div>
          <div className="text-sm text-gray-300">
            {contractBalance ? formatEther(contractBalance).slice(0, 8) : '0'} ETH
          </div>
        </div>

        {/* Countdown */}
        <div className="glass-card rounded-xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-purple-300 mb-4 text-center">Next Draw In</h3>
          <div className="flex justify-center space-x-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{countdown.hours.toString().padStart(2, '0')}</div>
              <div className="text-xs text-gray-400">Hours</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{countdown.minutes.toString().padStart(2, '0')}</div>
              <div className="text-xs text-gray-400">Minutes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{countdown.seconds.toString().padStart(2, '0')}</div>
              <div className="text-xs text-gray-400">Seconds</div>
            </div>
          </div>
        </div>

        {/* Wallet Connection */}
        {!isConnected ? (
          <div className="glass-card rounded-xl p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4 text-center">Connect Wallet to Enter</h3>
            <div className="space-y-3">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => connect({ connector })}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center justify-center space-x-2"
                >
                  <span>{connector.name === 'Injected' ? 'Browser Wallet' : connector.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Connected Wallet */}
            <div className="glass-card rounded-xl p-4 mb-6 flex justify-between items-center">
              <div>
                <div className="text-sm text-gray-400">Connected Wallet</div>
                <div className="font-mono text-sm">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </div>
              </div>
              <button
                onClick={() => disconnect()}
                className="text-red-400 hover:text-red-300 text-sm"
              >
                Disconnect
              </button>
            </div>

            {/* Ticket Purchase */}
            <div className="glass-card rounded-xl p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4 text-center">Buy Tickets</h3>
              <div className="text-center mb-4">
                <div className="text-sm text-gray-400">Ticket Price: $5.00 USD</div>
                <div className="text-sm text-gray-400">
                  ({ticketPriceETH.toFixed(6)} ETH @ ${ethPriceUSD.toFixed(2)})
                </div>
              </div>

              {/* Ticket Selection */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                {[1, 5, 20, 100].map((count) => (
                  <button
                    key={count}
                    onClick={() => setSelectedTickets(count)}
                    className={`p-4 rounded-lg font-semibold transition-all duration-300 ${
                      selectedTickets === count
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    <div className="text-lg">{count} Ticket{count > 1 ? 's' : ''}</div>
                    <div className="text-sm">${(count * 5).toFixed(2)}</div>
                  </button>
                ))}
              </div>

              {/* Purchase Summary */}
              <div className="bg-gray-800 rounded-lg p-4 mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span>Tickets:</span>
                  <span>{selectedTickets}</span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Total Cost:</span>
                  <span>${(selectedTickets * 5).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>ETH Amount:</span>
                  <span>{totalCostETH.toFixed(6)} ETH</span>
                </div>
              </div>

              {/* Buy Button */}
              <button
                onClick={handleBuyTickets}
                disabled={isTransacting || totalCostETH <= 0}
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
              className="w-full bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 mb-6"
            >
              📢 Share Raffle
            </button>
          </>
        )}

        {/* Future Features */}
        <div className="glass-card rounded-xl p-4 text-center">
          <div className="text-sm text-gray-400 mb-2">Coming Soon:</div>
          <div className="text-xs text-gray-500 space-y-1">
            <div>• 5% Treasury Fee</div>
            <div>• 2% Affiliate Rewards</div>
            <div>• Solana Chain Support</div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.RaffleApp = RaffleApp;
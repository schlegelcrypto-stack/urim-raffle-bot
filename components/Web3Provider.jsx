import React from 'react';
import { http, createConfig } from 'wagmi';
import { base } from 'wagmi/chains';
import { walletConnect, injected, coinbaseWallet } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';

// Create Wagmi config
const config = createConfig({
  chains: [base],
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({
      projectId: 'a01e2fcf9bbbc56ba32ea708ccd5bb5a',
      metadata: {
        name: 'URIM 50/50 Raffle',
        description: 'Win big with URIM 50/50 Raffle on Base',
        url: 'https://urim.live',
        icons: ['https://i.imgur.com/0v5f4rK.png']
      },
      showQrModal: true
    }),
    coinbaseWallet({
      appName: 'URIM Raffle',
      appLogoUrl: 'https://i.imgur.com/0v5f4rK.png'
    })
  ],
  transports: {
    [base.id]: http('https://mainnet.base.org'),
  },
});

// React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 3,
      staleTime: 30000,
      gcTime: 300000,
    },
  },
});

function Web3Provider({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// Export to global scope for Babel
window.Web3Provider = Web3Provider;
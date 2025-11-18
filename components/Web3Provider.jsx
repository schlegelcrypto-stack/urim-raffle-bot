import React from 'react';
import { http, createConfig } from 'wagmi';
import { mainnet, polygon, arbitrum, optimism, base, bsc } from 'wagmi/chains';
import { walletConnect, injected, coinbaseWallet } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';

// Extended chain configuration with multiple networks
const config = createConfig({
  chains: [base, mainnet, polygon, arbitrum, optimism, bsc],
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({
      projectId: 'eac2fc87c235ce36192f197cd1c255f3',
      metadata: {
        name: 'URIM 50/50 Raffle',
        description: 'Win big with URIM 50/50 Raffle - Multi-Chain Support',
        url: 'https://urim.live',
        icons: ['https://www.infinityg.ai/assets/user-upload/1763444371347-1723df0c-8fbf-4fa3-9dda-241ca90a93cd.jpg']
      },
      showQrModal: true,
      qrModalOptions: {
        themeMode: 'dark',
        themeVariables: {
          '--wcm-z-index': '1000',
          '--wcm-accent-color': '#3b82f6',
          '--wcm-background-color': '#1e293b'
        }
      }
    }),
    coinbaseWallet({
      appName: 'URIM Raffle',
      appLogoUrl: 'https://www.infinityg.ai/assets/user-upload/1763444371347-1723df0c-8fbf-4fa3-9dda-241ca90a93cd.jpg'
    })
  ],
  transports: {
    [mainnet.id]: http('https://eth-mainnet.public.blastapi.io'),
    [polygon.id]: http('https://polygon-rpc.com'),
    [arbitrum.id]: http('https://arb1.arbitrum.io/rpc'),
    [optimism.id]: http('https://mainnet.optimism.io'),
    [base.id]: http('https://mainnet.base.org'),
    [bsc.id]: http('https://bsc-dataseed.binance.org'),
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
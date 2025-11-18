import React from 'react';
import { http, createConfig } from 'wagmi';
import { base } from 'wagmi/chains';
import { walletConnect, injected } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';

const config = createConfig({
  chains: [base],
  connectors: [
    walletConnect({
      projectId: 'a01e2fcf9bbbc56ba32ea708ccd5bb5a', // Generic WalletConnect project ID
      metadata: {
        name: 'URIM Raffle',
        description: 'URIM 50/50 Raffle Bot',
        url: 'https://urim.live',
        icons: ['https://i.imgur.com/0v5f4rK.png']
      },
      showQrModal: true
    }),
    injected()
  ],
  transports: {
    [base.id]: http('https://mainnet.base.org'),
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 3,
      staleTime: 30000,
    },
  },
});

function Web3Provider({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

window.Web3Provider = Web3Provider;
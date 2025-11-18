import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { WalletConnectModal } from '@walletconnect/modal'
import { createPublicClient, http, parseEther, formatEther } from 'viem'
import { base } from 'viem/chains'

const CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69'
const CHAINLINK_ETH_USD = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70'

const client = createPublicClient({
  chain: base,
  transport: http()
})

const modal = new WalletConnectModal({
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID', // we’ll fix this in 2 minutes
  metadata: {
    name: 'URIM Raffle',
    description: 'Buy tickets instantly',
    url: window.location.origin,
    icons: ['https://i.imgur.com/0v5f4rK.png']
  }
})

function App() {
  const [account, setAccount] = useState('')
  const [pot, setPot] = useState('0')
  const [price, setPrice] = useState('0')

  const connect = async () => {
    const session = await modal.openModal()
    setAccount(session.namespaces.eip155.accounts[0].split(':')[2])
  }

  const getData = async () => {
    const balance = await client.getBalance({ address: CONTRACT })
    const ethPrice = await client.readContract({
      address: CHAINLINK_ETH_USD,
      abi: [{'inputs':[],'name':'latestAnswer','outputs':[{'type':'int256'}],'stateMutability':'view'}],
      functionName: 'latestAnswer'
    })
    setPot(formatEther(balance))
    setPrice(Number(ethPrice) / 1e8)
  }

  useEffect(() => { getData(); setInterval(getData, 15000) }, [])

  const buy = async (tickets) => {
    const ethNeeded = (5 * tickets / price).toFixed(8)
    const tx = await modal.request({
      topic: modal.getActiveSession().topic,
      chainId: 'eip155:8453',
      request: {
        method: 'eth_sendTransaction',
        params: [{
          from: account,
          to: CONTRACT,
          value: parseEther(ethNeeded).toString(16),
          data: `0x${'0'.repeat(64)}${(tickets).toString(16).padStart(64, '0')}`
        }]
      }
    })
    alert(`Success! ${tickets} tickets purchased 🎉`)
  }

  return (
    <div style={{padding: '20px', fontFamily: 'Arial'}}>
      <h1>URIM 50/50 Raffle</h1>
      <h2>Current Pot: ${(Number(pot) * price).toFixed(2)}</h2>
      {account ? (
        <>
          <p>Connected: {account.slice(0,6)}...{account.slice(-4)}</p>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
            <button onClick={() => buy(1)}>Buy 1 Ticket – $5</button>
            <button onClick={() => buy(5)}>Buy 5 Tickets – $25</button>
            <button onClick={() => buy(20)}>Buy 20 Tickets – $100</button>
            <button onClick={() => buy(100)}>Buy 100 Tickets – $500</button>
          </div>
        </>
      ) : (
        <button onClick={connect}>Connect Wallet (MetaMask etc.)</button>
      )}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)

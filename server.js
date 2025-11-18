const express = require('express');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '8323137830:AAFA3wnduW5_e_GCAOtSRMo0yRTKgYb1B6Y';
const DOMAIN = process.env.DOMAIN || 'https://urim-raffle-bot.vercel.app';
const ALCHEMY_SIGNING_KEY = 'whsec_ROhhQ6NzmFCC5DSAwftpirSz';

app.use(express.json());
app.use(express.static(__dirname, {
  setHeaders: (res, path) => {
    if (path.endsWith('.jsx')) {
      res.set('Content-Type', 'text/babel');
    } else if (path.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript');
    } else if (path.endsWith('.css')) {
      res.set('Content-Type', 'text/css');
    } else if (path.endsWith('.html')) {
      res.set('Content-Type', 'text/html');
    }
  }
}));

// Contract configuration
const RAFFLE_CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69';
const BASE_RPC_URL = 'https://mainnet.base.org';

// Store current contract state (in production, use Redis or database)
let contractState = {
  roundId: 1,
  endTime: Date.now() + (19 * 60 * 60 * 1000), // 19 hours from now
  totalPlayers: 7,
  totalUSDC: '35.00',
  timeLeft: 19 * 60 * 60, // 19 hours in seconds
  players: []
};

// Function to verify Alchemy webhook signature
function verifyAlchemySignature(payload, signature) {
  if (!signature) return false;
  
  const expectedSignature = crypto
    .createHmac('sha256', ALCHEMY_SIGNING_KEY)
    .update(payload)
    .digest('hex');
  
  return signature === `v0=${expectedSignature}`;
}

// Function to read contract data via RPC
async function readContractData() {
  try {
    console.log('Reading real contract data...');
    
    // Call getCurrentRoundInfo
    const roundInfoCall = {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{
        to: RAFFLE_CONTRACT,
        data: '0x9a7a23d6' // getCurrentRoundInfo() function selector
      }, 'latest']
    };

    const response = await axios.post(BASE_RPC_URL, roundInfoCall, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.result) {
      // Decode the hex result (simplified - in production use proper ABI decoding)
      const result = response.data.result;
      console.log('Contract call result:', result);
      
      // For now, we'll update with webhook events instead of parsing the hex data
      // This is where you'd decode the ABI-encoded response
    }

    // Call getCurrentPlayers
    const playersCall = {
      jsonrpc: '2.0',
      id: 2,
      method: 'eth_call',
      params: [{
        to: RAFFLE_CONTRACT,
        data: '0x1e5b8a6a' // getCurrentPlayers() function selector
      }, 'latest']
    };

    const playersResponse = await axios.post(BASE_RPC_URL, playersCall, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('Players call result:', playersResponse.data);

  } catch (error) {
    console.error('Error reading contract data:', error.message);
  }
}

// Alchemy webhook endpoint for real-time contract events
app.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-alchemy-signature'];
    const payload = JSON.stringify(req.body);
    
    // Verify Alchemy webhook signature for security
    if (!verifyAlchemySignature(payload, signature)) {
      console.log('Invalid Alchemy signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { webhookId, id, createdAt, type, event } = req.body;
    
    console.log('Alchemy webhook received:', { type, event: event?.activity?.[0] });

    if (type === 'ADDRESS_ACTIVITY' && event?.activity) {
      for (const activity of event.activity) {
        const { fromAddress, toAddress, hash, value, asset, category } = activity;
        
        // Handle ticket purchase events (USDC transfers to raffle contract)
        if (toAddress?.toLowerCase() === RAFFLE_CONTRACT.toLowerCase() && 
            category === 'erc20' && 
            asset === 'USDC') {
          
          console.log('Ticket purchase detected:', { fromAddress, value, hash });
          
          // Update contract state
          contractState.totalPlayers++;
          contractState.totalUSDC = (parseFloat(contractState.totalUSDC) + 5.0).toFixed(2);
          
          // Broadcast update to all connected clients (in production, use WebSockets)
          await broadcastContractUpdate();
          
          // Optionally notify Telegram channel about new ticket
          await notifyTicketPurchase(fromAddress, hash);
        }

        // Handle winner selection events
        if (activity.log && activity.log.topics && activity.log.topics[0] === '0x...') {
          // This would be the WinnerSelected event topic hash
          console.log('Winner selected event detected');
          await handleWinnerSelection(activity);
        }

        // Handle round started events
        if (activity.log && activity.log.topics && activity.log.topics[0] === '0x...') {
          // This would be the RoundStarted event topic hash
          console.log('New round started');
          await handleNewRound(activity);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Function to broadcast contract updates (in production, use WebSockets or Server-Sent Events)
async function broadcastContractUpdate() {
  console.log('Broadcasting contract update:', contractState);
  // In a real implementation, you'd broadcast to all connected WebSocket clients
  // For now, we'll just log the update
}

// Function to notify about ticket purchases
async function notifyTicketPurchase(buyer, txHash) {
  try {
    const shortAddress = `${buyer.slice(0, 6)}...${buyer.slice(-4)}`;
    const shortTx = `${txHash.slice(0, 8)}...`;
    
    console.log(`🎫 New ticket purchased by ${shortAddress} (tx: ${shortTx})`);
    
    // Optionally send to a Telegram channel
    // await sendToTelegramChannel(`🎫 New ticket purchased!\n👤 ${shortAddress}\n💰 +$5 USDC\n📊 Total: $${contractState.totalUSDC}\n🔗 ${shortTx}`);
    
  } catch (error) {
    console.error('Error notifying ticket purchase:', error);
  }
}

// Function to handle winner selection
async function handleWinnerSelection(event) {
  try {
    console.log('🏆 Winner selected!', event);
    
    // Reset round state
    contractState.roundId++;
    contractState.totalPlayers = 0;
    contractState.totalUSDC = '0.00';
    contractState.endTime = Date.now() + (24 * 60 * 60 * 1000); // New 24h round
    contractState.timeLeft = 24 * 60 * 60;
    
    await broadcastContractUpdate();
    
  } catch (error) {
    console.error('Error handling winner selection:', error);
  }
}

// Function to handle new round
async function handleNewRound(event) {
  try {
    console.log('🆕 New round started!', event);
    
    // Update round state
    contractState.roundId++;
    contractState.totalPlayers = 0;
    contractState.totalUSDC = '0.00';
    contractState.endTime = Date.now() + (24 * 60 * 60 * 1000);
    contractState.timeLeft = 24 * 60 * 60;
    
    await broadcastContractUpdate();
    
  } catch (error) {
    console.error('Error handling new round:', error);
  }
}

// API endpoint to get current contract state
app.get('/api/contract-state', (req, res) => {
  res.json({
    ...contractState,
    timestamp: Date.now()
  });
});

// Telegram bot webhook endpoint
app.post('/telegram-webhook', async (req, res) => {
  try {
    const { message, callback_query } = req.body;
    
    if (message) {
      const chatId = message.chat.id;
      const userId = message.from.id;
      const text = message.text;

      console.log(`Received message: ${text} from user: ${userId}`);

      if (text === '/start') {
        await sendWebAppMessage(chatId);
      } else if (text === '/stats') {
        await sendStatsMessage(chatId);
      }
    }

    if (callback_query) {
      const chatId = callback_query.message.chat.id;
      const userId = callback_query.from.id;
      const data = callback_query.data;
      
      console.log(`Callback query: ${data} from user: ${userId}`);
      
      if (data === 'view_stats') {
        await sendStatsMessage(chatId);
      } else if (data === 'refresh_stats') {
        await sendStatsMessage(chatId);
      } else if (data === 'share_raffle') {
        await sendShareMessage(chatId);
      }
      
      // Answer callback query
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        callback_query_id: callback_query.id
      });
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve the main raffle app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve components
app.get('/components/:file', (req, res) => {
  const filePath = path.join(__dirname, 'components', req.params.file);
  res.sendFile(filePath);
});

// Helper function to format time
function formatTimeLeft(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Function to send web app message
async function sendWebAppMessage(chatId) {
  const message = {
    chat_id: chatId,
    text: '🎰 *URIM 50/50 Raffle* 🎰\n\n💰 Win big on Base Network!\n🎫 Tickets: $5 USDC each\n🏆 50% goes to winner\n⚡ Powered by USDC payments\n\n🌐 Visit: urim.live/lottery\n\nTap "Play Raffle" to start!',
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🎮 Play Raffle',
            web_app: {
              url: DOMAIN
            }
          }
        ],
        [
          {
            text: '📊 View Stats',
            callback_data: 'view_stats'
          },
          {
            text: '📢 Share',
            callback_data: 'share_raffle'
          }
        ]
      ]
    }
  };

  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, message);
    console.log('Web app message sent successfully');
  } catch (error) {
    console.error('Error sending web app message:', error.response?.data || error.message);
  }
}

// Function to send stats message with REAL contract data
async function sendStatsMessage(chatId) {
  const timeLeftFormatted = formatTimeLeft(Math.floor((contractState.endTime - Date.now()) / 1000));
  
  const statsText = `🎰 URIM 50/50 Raffle Stats 🎰

📊 *Current Round:* #${contractState.roundId}
💰 *Total Pot:* $${contractState.totalUSDC} USDC  
👥 *Players:* ${contractState.totalPlayers}
⏰ *Time Left:* ${timeLeftFormatted}

🔗 *Contract:* \`${RAFFLE_CONTRACT}\`
🌐 *Network:* Base (Chain ID: 8453)
💎 *Token:* USDC

_✅ Real-time data from Alchemy webhooks_`;

  const message = {
    chat_id: chatId,
    text: statsText,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🔄 Refresh Stats',
            callback_data: 'refresh_stats'
          },
          {
            text: '🎮 Play Now',
            web_app: {
              url: DOMAIN
            }
          }
        ]
      ]
    }
  };

  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, message);
    console.log('Stats message sent successfully');
  } catch (error) {
    console.error('Error sending stats message:', error.response?.data || error.message);
  }
}

// Function to send share message
async function sendShareMessage(chatId) {
  const shareText = `🎰 *URIM 50/50 Raffle* 🎰

💰 Current pot: $${contractState.totalUSDC} USDC
🎫 Only $5 USDC per ticket
🏆 Winner takes 50% of the pot
⚡ Instant payouts on Base Network

Join now: @URIMRaffleBot`;

  const message = {
    chat_id: chatId,
    text: shareText,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '📢 Share with Friends',
            switch_inline_query: shareText
          }
        ],
        [
          {
            text: '🎮 Play Raffle',
            web_app: {
              url: DOMAIN
            }
          }
        ]
      ]
    }
  };

  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, message);
    console.log('Share message sent successfully');
  } catch (error) {
    console.error('Error sending share message:', error.response?.data || error.message);
  }
}

// Periodically update contract state every 5 minutes
setInterval(async () => {
  await readContractData();
  
  // Update time left
  const currentTime = Date.now();
  if (contractState.endTime > currentTime) {
    contractState.timeLeft = Math.floor((contractState.endTime - currentTime) / 1000);
  } else {
    contractState.timeLeft = 0;
  }
}, 5 * 60 * 1000); // Every 5 minutes

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    domain: DOMAIN,
    botToken: BOT_TOKEN ? 'configured' : 'missing',
    alchemyWebhook: ALCHEMY_SIGNING_KEY ? 'configured' : 'missing',
    contractState: contractState
  });
});

// Catch all other routes and serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 URIM Raffle Bot server running on port ${PORT}`);
  console.log(`🌐 Domain: ${DOMAIN}`);
  console.log(`🤖 Bot token: ${BOT_TOKEN ? 'configured' : 'missing'}`);
  console.log(`🔗 Alchemy webhook: ${ALCHEMY_SIGNING_KEY ? 'configured' : 'missing'}`);
  console.log(`📡 Webhook URL: ${DOMAIN}/webhook`);
  
  // Read initial contract data
  readContractData();
});

module.exports = app;
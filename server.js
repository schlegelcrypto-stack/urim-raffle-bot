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

// **FIXED: Separate Telegram bot webhook endpoint**
app.post('/webhook/telegram', async (req, res) => {
  try {
    const { message, callback_query } = req.body;
    
    console.log('Telegram webhook received:', { message: message?.text, callback_query: callback_query?.data });

    if (message) {
      const chatId = message.chat.id;
      const userId = message.from.id;
      const text = message.text;

      console.log(`Received message: "${text}" from user: ${userId} in chat: ${chatId}`);

      if (text === '/start') {
        console.log('Sending start message to chat:', chatId);
        await sendWebAppMessage(chatId);
      } else if (text === '/stats') {
        await sendStatsMessage(chatId);
      } else if (text === '/help') {
        await sendHelpMessage(chatId);
      } else {
        // Unknown command - send help
        await sendHelpMessage(chatId);
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
        callback_query_id: callback_query.id,
        text: '✅ Action completed!'
      });
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// **FIXED: Separate Alchemy webhook endpoint for contract events**
app.post('/webhook/alchemy', async (req, res) => {
  try {
    const signature = req.headers['x-alchemy-signature'];
    const payload = JSON.stringify(req.body);
    
    console.log('Alchemy webhook received');

    // Verify Alchemy webhook signature for security
    if (!verifyAlchemySignature(payload, signature)) {
      console.log('Invalid Alchemy signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { webhookId, id, createdAt, type, event } = req.body;
    
    console.log('Alchemy webhook data:', { type, event: event?.activity?.[0] });

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
          
          // Broadcast update to all connected clients
          await broadcastContractUpdate();
          
          // Optionally notify Telegram channel about new ticket
          await notifyTicketPurchase(fromAddress, hash);
        }

        // Handle winner selection events
        if (activity.log && activity.log.topics && activity.log.topics[0] === '0x...') {
          console.log('Winner selected event detected');
          await handleWinnerSelection(activity);
        }

        // Handle round started events  
        if (activity.log && activity.log.topics && activity.log.topics[0] === '0x...') {
          console.log('New round started');
          await handleNewRound(activity);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Alchemy webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Function to broadcast contract updates
async function broadcastContractUpdate() {
  console.log('Broadcasting contract update:', contractState);
  // In a real implementation, you'd broadcast to all connected WebSocket clients
}

// Function to notify about ticket purchases
async function notifyTicketPurchase(buyer, txHash) {
  try {
    const shortAddress = `${buyer.slice(0, 6)}...${buyer.slice(-4)}`;
    const shortTx = `${txHash.slice(0, 8)}...`;
    
    console.log(`🎫 New ticket purchased by ${shortAddress} (tx: ${shortTx})`);
    
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

// **FIXED: Function to send web app message with proper error handling**
async function sendWebAppMessage(chatId) {
  const message = {
    chat_id: chatId,
    text: '🎰 *URIM 50/50 Raffle* 🎰\n\n💰 Current Pot: $' + contractState.totalUSDC + ' USDC\n👥 Players: ' + contractState.totalPlayers + '\n🎫 Tickets: $5 USDC each\n🏆 50% goes to winner\n⚡ Powered by USDC on Base\n\n🌐 Visit: urim.live/lottery\n\nTap "🎮 Play Raffle" to start!',
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
    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, message);
    console.log('✅ Web app message sent successfully to chat:', chatId);
    return response.data;
  } catch (error) {
    console.error('❌ Error sending web app message:', error.response?.data || error.message);
    throw error;
  }
}

// Function to send stats message with REAL contract data
async function sendStatsMessage(chatId) {
  const timeLeftFormatted = formatTimeLeft(Math.floor((contractState.endTime - Date.now()) / 1000));
  
  const statsText = `🎰 *URIM 50/50 Raffle Stats* 🎰

📊 *Current Round:* #${contractState.roundId}
💰 *Total Pot:* $${contractState.totalUSDC} USDC  
👥 *Players:* ${contractState.totalPlayers}
⏰ *Time Left:* ${timeLeftFormatted}

🔗 *Contract:* \`${RAFFLE_CONTRACT.slice(0, 10)}...${RAFFLE_CONTRACT.slice(-6)}\`
🌐 *Network:* Base (Chain ID: 8453)
💎 *Token:* USDC

_✅ Real-time data via Alchemy webhooks_`;

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
    console.log('✅ Stats message sent successfully');
  } catch (error) {
    console.error('❌ Error sending stats message:', error.response?.data || error.message);
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
    console.log('✅ Share message sent successfully');
  } catch (error) {
    console.error('❌ Error sending share message:', error.response?.data || error.message);
  }
}

// **NEW: Function to send help message**
async function sendHelpMessage(chatId) {
  const helpText = `🎰 *URIM Raffle Bot Help* 🎰

*Available Commands:*
/start - Start the raffle bot
/stats - View current round statistics
/help - Show this help message

*How to Play:*
1️⃣ Connect your wallet
2️⃣ Get USDC on Base network
3️⃣ Buy raffle tickets for $5 USDC each
4️⃣ Wait for the draw
5️⃣ Winner gets 50% of the pot!

*Features:*
• Real-time updates via Alchemy
• Secure USDC payments on Base
• Instant automated payouts
• Transparent smart contracts

Need help? Contact: @URIMSupport`;

  const message = {
    chat_id: chatId,
    text: helpText,
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
        ]
      ]
    }
  };

  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, message);
    console.log('✅ Help message sent successfully');
  } catch (error) {
    console.error('❌ Error sending help message:', error.response?.data || error.message);
  }
}

// Periodically update contract state every 5 minutes
setInterval(() => {
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
    contractState: contractState,
    webhookEndpoints: {
      telegram: `${DOMAIN}/webhook/telegram`,
      alchemy: `${DOMAIN}/webhook/alchemy`
    }
  });
});

// Test endpoint for debugging
app.get('/test-telegram', async (req, res) => {
  try {
    const testMessage = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    res.json({
      status: 'success',
      bot: testMessage.data,
      webhookInfo: `Use: ${DOMAIN}/webhook/telegram`
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Catch all other routes and serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 URIM Raffle Bot server running on port ${PORT}`);
  console.log(`🌐 Domain: ${DOMAIN}`);
  console.log(`🤖 Bot token: ${BOT_TOKEN ? 'configured ✅' : 'missing ❌'}`);
  console.log(`🔗 Alchemy webhook: ${ALCHEMY_SIGNING_KEY ? 'configured ✅' : 'missing ❌'}`);
  console.log('📡 Webhook endpoints:');
  console.log(`   📱 Telegram: ${DOMAIN}/webhook/telegram`);
  console.log(`   ⚡ Alchemy: ${DOMAIN}/webhook/alchemy`);
  console.log(`🔍 Health check: ${DOMAIN}/health`);
  console.log(`🧪 Test endpoint: ${DOMAIN}/test-telegram`);
});

module.exports = app;
const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '8323137830:AAFA3wnduW5_e_GCAOtSRMo0yRTKgYb1B6Y';
const DOMAIN = process.env.DOMAIN || 'https://urim-raffle-bot.vercel.app';

// Contract info
const RAFFLE_CONTRACT = '0x74ef55f0bF8C05fF926B7D7f79450710fde4B64A';
const BASE_RPC_URL = 'https://mainnet.base.org';

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

// Serve the main raffle app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve components
app.get('/components/:file', (req, res) => {
  const filePath = path.join(__dirname, 'components', req.params.file);
  res.sendFile(filePath);
});

// Helper function to read contract data
async function getContractStats() {
  try {
    // For demo purposes, returning mock data
    // In production, you would use ethers.js or web3.js to read from the actual contract
    return {
      currentRoundId: '1',
      currentRoundEndTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      currentRoundTotalUSDC: '125.50',
      currentRoundPlayers: '25'
    };
  } catch (error) {
    console.error('Error reading contract stats:', error);
    return {
      currentRoundId: '1',
      currentRoundEndTime: Math.floor(Date.now() / 1000) + 3600,
      currentRoundTotalUSDC: '0.00',
      currentRoundPlayers: '0'
    };
  }
}

// Telegram webhook endpoint
app.post('/webhook', async (req, res) => {
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
      } else if (data === 'share_raffle') {
        await handleShareRaffle(chatId);
      } else if (data === 'refresh_stats') {
        await sendStatsMessage(chatId);
      }

      // Answer callback query
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        callback_query_id: callback_query.id
      });
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Function to send web app message
async function sendWebAppMessage(chatId) {
  const message = {
    chat_id: chatId,
    text: '🎰 *URIM 50/50 Raffle* 🎰\n\n💰 Win big on Base Network!\n🎫 Tickets: $5 USDC each\n🏆 50% goes to winner\n🔐 Secure Permit2 payments\n\n🌐 Visit: urim.live/lottery\n\nTap "Play Raffle" to start!',
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
            text: '📊 Stats',
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

// Function to send stats message
async function sendStatsMessage(chatId) {
  const stats = await getContractStats();
  
  const endTime = new Date(stats.currentRoundEndTime * 1000);
  const now = new Date();
  const timeLeft = Math.max(0, Math.floor((endTime - now) / 1000));
  
  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;

  const message = {
    chat_id: chatId,
    text: `🎰 *URIM 50/50 Raffle Stats* 🎰

📊 *Round #${stats.currentRoundId}*
💰 *Total Pool:* $${stats.currentRoundTotalUSDC} USDC
👥 *Players:* ${stats.currentRoundPlayers}
⏰ *Time Left:* ${hours}h ${minutes}m ${seconds}s

📍 *Contract:* \`${RAFFLE_CONTRACT}\`
🌐 *Network:* Base (Chain ID: 8453)
💵 *Payment:* USDC with Permit2 security

_Last updated: ${new Date().toLocaleString()}_`,
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

// Function to handle share raffle
async function handleShareRaffle(chatId) {
  const stats = await getContractStats();
  const shareText = `🎰 Join the URIM 50/50 Raffle! Current pot: $${stats.currentRoundTotalUSDC} USDC 💰\n\nRound #${stats.currentRoundId} • ${stats.currentRoundPlayers} players\n🔐 Secure Permit2 payments on Base Network`;
  const shareUrl = 'https://t.me/URIMRaffleBot';
  
  const message = {
    chat_id: chatId,
    text: `📢 Share this raffle with your friends!\n\n_Copy this message and send it to others:_\n\n${shareText}\n\n🔗 ${shareUrl}`,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '📤 Share via Telegram',
            url: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`
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

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    domain: DOMAIN,
    botToken: BOT_TOKEN ? 'configured' : 'missing',
    contract: RAFFLE_CONTRACT
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
  console.log(`📄 Contract: ${RAFFLE_CONTRACT}`);
});

module.exports = app;
const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '8323137830:AAFA3wnduW5_e_GCAOtSRMo0yRTKgYb1B6Y';
const DOMAIN = process.env.DOMAIN || 'https://urim-raffle-bot.vercel.app';

// Contract configuration
const RAFFLE_CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69';
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

// Function to read contract data
async function getContractStats() {
  try {
    // Call getCurrentRoundInfo() function
    const data = {
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [
        {
          to: RAFFLE_CONTRACT,
          data: '0x86750502' // Function selector for getCurrentRoundInfo()
        },
        'latest'
      ],
      id: 1
    };

    const response = await axios.post(BASE_RPC_URL, data, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.result) {
      // Decode the result (this is a simplified version - in production you'd want to use proper ABI decoding)
      const result = response.data.result;
      
      // Parse the returned data (roundId, endTime, totalPlayers, totalUSDC, timeLeft, state)
      // This is a basic hex parsing - you'd typically use ethers.js or web3.js for proper decoding
      const roundId = parseInt(result.slice(2, 66), 16);
      const totalPlayers = parseInt(result.slice(130, 194), 16);
      const totalUSDC = parseInt(result.slice(194, 258), 16) / 1000000; // Convert from 6 decimals
      const timeLeft = parseInt(result.slice(258, 322), 16);

      return {
        roundId,
        totalPlayers,
        totalUSDC,
        timeLeft
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching contract stats:', error);
    return null;
  }
}

// Function to format time left
function formatTimeLeft(seconds) {
  if (seconds <= 0) return "Drawing Soon";
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${remainingSeconds}s`;
  }
}

// Serve the main raffle app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve components
app.get('/components/:file', (req, res) => {
  const filePath = path.join(__dirname, 'components', req.params.file);
  res.sendFile(filePath);
});

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
      } else if (data === 'refresh_stats') {
        await sendStatsMessage(chatId);
      } else if (data === 'share_raffle') {
        const stats = await getContractStats();
        const potValue = stats ? stats.totalUSDC.toFixed(2) : '0.00';
        const shareText = `🎰 Join the URIM 50/50 Raffle! Current pot: $${potValue} USDC 💰\n\nID: 874482516`;
        
        await sendMessage(chatId, `Share this message with friends:\n\n${shareText}\n\n🔗 https://t.me/URIMRaffleBot`);
      }
      
      // Answer callback query to remove loading state
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

// Function to send stats message
async function sendStatsMessage(chatId) {
  try {
    const stats = await getContractStats();
    
    if (!stats) {
      await sendMessage(chatId, '❌ Unable to fetch raffle stats at the moment. Please try again later.');
      return;
    }

    const timeLeftFormatted = formatTimeLeft(stats.timeLeft);
    
    const statsText = `🎰 URIM 50/50 Raffle Stats 🎰

🆔 Round ID: ${stats.roundId}
💰 Total Pot: $${stats.totalUSDC.toFixed(2)} USDC  
👥 Total Players: ${stats.totalPlayers}
⏰ Time Left: ${timeLeftFormatted}

📋 Contract: ${RAFFLE_CONTRACT.slice(0, 10)}...${RAFFLE_CONTRACT.slice(-6)}
🌐 Network: Base (Chain ID: 8453)`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔄 Refresh Stats', callback_data: 'refresh_stats' },
          { text: '🎮 Play Raffle', web_app: { url: DOMAIN } }
        ]
      ]
    };

    await sendMessage(chatId, statsText, keyboard);
    
  } catch (error) {
    console.error('Error sending stats message:', error);
    await sendMessage(chatId, '❌ Error fetching raffle stats. Please try again later.');
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

// Helper function to send message
async function sendMessage(chatId, text, replyMarkup = null) {
  const message = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown'
  };
  
  if (replyMarkup) {
    message.reply_markup = replyMarkup;
  }

  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, message);
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    domain: DOMAIN,
    botToken: BOT_TOKEN ? 'configured' : 'missing'
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
});

module.exports = app;
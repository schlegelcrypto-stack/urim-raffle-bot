const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '8323137830:AAFA3wnduW5_e_GCAOtSRMo0yRTKgYb1B6Y';
const DOMAIN = process.env.DOMAIN || 'https://urim-raffle-bot.vercel.app';

// Contract address
const RAFFLE_CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69';

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

// Mock contract data function (replace with actual Web3 calls in production)
const getContractStats = async () => {
  try {
    // In production, use actual contract calls with Web3 provider
    // For now, returning mock data that matches the actual contract structure
    const now = Math.floor(Date.now() / 1000);
    return {
      currentRoundId: '42',
      currentRoundEndTime: now + 3600, // 1 hour from now
      currentRoundTotalUSDC: '1250.50',
      currentRoundPlayers: '25',
      ticketPriceUSDC: '5.00'
    };
  } catch (error) {
    console.error('Error fetching contract stats:', error);
    return {
      currentRoundId: 'Error',
      currentRoundEndTime: Math.floor(Date.now() / 1000) + 3600,
      currentRoundTotalUSDC: '0.00',
      currentRoundPlayers: '0',
      ticketPriceUSDC: '5.00'
    };
  }
};

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
        await shareRaffle(chatId);
      } else if (data === 'refresh_stats') {
        await sendStatsMessage(chatId);
      }

      // Answer the callback query
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
    text: '🎰 *URIM 50/50 Raffle* 🎰\n\n💰 Win big on Base Network!\n🎫 Tickets: $5 USDC each\n🏆 50% goes to winner\n🔗 Direct USDC payments\n\n🌐 Visit: urim.live/lottery\n\nTap "Play Raffle" to start!',
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

// Function to send stats message (clean text only)
async function sendStatsMessage(chatId) {
  try {
    const stats = await getContractStats();
    
    // Calculate time left
    const now = Math.floor(Date.now() / 1000);
    const endTime = parseInt(stats.currentRoundEndTime);
    const timeLeft = endTime - now;
    
    let timeLeftText = 'Round Ended';
    if (timeLeft > 0) {
      const hours = Math.floor(timeLeft / 3600);
      const minutes = Math.floor((timeLeft % 3600) / 60);
      timeLeftText = hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
    }

    const statsText = `🎰 URIM 50/50 Raffle Stats 🎰

Round ID: ${stats.currentRoundId}
Total Pool: $${stats.currentRoundTotalUSDC} USDC
Players: ${stats.currentRoundPlayers}
Ticket Price: $${stats.ticketPriceUSDC} USDC
Time Left: ${timeLeftText}

Contract: ${RAFFLE_CONTRACT}
Network: Base (Chain ID: 8453)
Payment: Direct USDC transfer`;

    const message = {
      chat_id: chatId,
      text: statsText,
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

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, message);
    console.log('Stats message sent successfully');
  } catch (error) {
    console.error('Error sending stats message:', error.response?.data || error.message);
  }
}

// Function to handle share callback
async function shareRaffle(chatId) {
  try {
    const stats = await getContractStats();
    
    const shareText = `🎰 Join the URIM 50/50 Raffle! Current pot: $${stats.currentRoundTotalUSDC} USDC with ${stats.currentRoundPlayers} players 💰

🎫 Only $${stats.ticketPriceUSDC} USDC per ticket
🏆 50% goes to the winner
🔗 Direct USDC payments on Base Network

Round ID: ${stats.currentRoundId}`;

    const shareUrl = 'https://t.me/URIMRaffleBot';
    
    const message = {
      chat_id: chatId,
      text: `Share this raffle with friends:\n\n${shareText}`,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '📢 Share to Telegram',
              url: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`
            }
          ]
        ]
      }
    };

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, message);
  } catch (error) {
    console.error('Error handling share:', error.response?.data || error.message);
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    domain: DOMAIN,
    botToken: BOT_TOKEN ? 'configured' : 'missing',
    contractAddress: RAFFLE_CONTRACT
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
  console.log(`📝 Contract: ${RAFFLE_CONTRACT}`);
});

module.exports = app;
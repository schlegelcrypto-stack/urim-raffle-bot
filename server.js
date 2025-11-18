const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '8323137830:AAFA3wnduW5_e_GCAOtSRMo0yRTKgYb1B6Y';
const DOMAIN = process.env.DOMAIN || 'https://urim-raffle-bot.vercel.app';

// Contract configuration
const RAFFLE_CONTRACT = '0x74ef55f0bF8C05fF926B7D7f79450710fde4B64A';

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

// Function to fetch contract stats
async function fetchContractStats() {
  try {
    const baseRPC = 'https://mainnet.base.org';
    
    // Contract ABI for the read functions
    const calls = [
      {
        to: RAFFLE_CONTRACT,
        data: '0x' + 'b8a4d500' // currentroundId()
      },
      {
        to: RAFFLE_CONTRACT,
        data: '0x' + '4c3e1d2c' // currentRoundendtime()
      },
      {
        to: RAFFLE_CONTRACT,
        data: '0x' + '7b9f346a' // currentRoundTotalUSDC()
      },
      {
        to: RAFFLE_CONTRACT,
        data: '0x' + '8da5cb5b' // currentRoundPlayers()
      }
    ];

    // Simple RPC calls (you may need to implement actual Web3 calls here)
    // For now, return mock data structure
    return {
      roundId: '1',
      endTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      totalUSDC: '250.00',
      players: '12'
    };
  } catch (error) {
    console.error('Error fetching contract stats:', error);
    return {
      roundId: 'N/A',
      endTime: 0,
      totalUSDC: '0.00',
      players: '0'
    };
  }
}

// Function to format stats message (clean text, no graphics)
function formatStatsMessage(stats) {
  const timeLeft = Math.max(0, stats.endTime - Math.floor(Date.now() / 1000));
  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;

  return `🎰 URIM 50/50 Raffle Stats 🎰

Round ID: #${stats.roundId}
Total Pool: $${stats.totalUSDC} USDC
Players: ${stats.players}
Time Left: ${hours}h ${minutes}m ${seconds}s

Contract: ${RAFFLE_CONTRACT}
Network: Base (Chain ID: 8453)`;
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
        // Send the web app button
        await sendWebAppMessage(chatId);
      } else if (text === '/stats') {
        // Handle stats command
        await sendStatsMessage(chatId);
      }
    }

    if (callback_query) {
      const chatId = callback_query.message.chat.id;
      const userId = callback_query.from.id;
      const data = callback_query.data;
      
      console.log(`Callback query from user: ${userId}, data: ${data}`);

      if (data === 'view_stats') {
        await sendStatsMessage(chatId);
      } else if (data === 'refresh_stats') {
        await sendStatsMessage(chatId);
      } else if (data === 'share_raffle') {
        await handleShareRaffle(chatId);
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
    const stats = await fetchContractStats();
    const statsText = formatStatsMessage(stats);

    const message = {
      chat_id: chatId,
      text: statsText,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 Refresh Stats',
              callback_data: 'refresh_stats'
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

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, message);
    console.log('Stats message sent successfully');
  } catch (error) {
    console.error('Error sending stats message:', error.response?.data || error.message);
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

// Function to handle share raffle
async function handleShareRaffle(chatId) {
  try {
    const stats = await fetchContractStats();
    const shareText = `🎰 Join the URIM 50/50 Raffle! Current pot: $${stats.totalUSDC} USDC 💰\n\nID: 874482516`;
    const shareUrl = 'https://t.me/URIMRaffleBot';
    
    const fullUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
    
    const message = {
      chat_id: chatId,
      text: `Share this raffle with your friends!\n\n[📢 Click here to share](${fullUrl})`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
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
  } catch (error) {
    console.error('Error handling share raffle:', error);
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
  console.log(`📋 Contract: ${RAFFLE_CONTRACT}`);
});

module.exports = app;
const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '8323137830:AAFA3wnduW5_e_GCAOtSRMo0yRTKgYb1B6Y';
const DOMAIN = process.env.DOMAIN || 'https://urim-raffle-bot.vercel.app';

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

// Mock contract data (replace with actual contract calls)
const getMockContractStats = () => ({
  currentroundId: Math.floor(Math.random() * 1000) + 1,
  currentRoundendtime: Math.floor(Date.now() / 1000) + (Math.random() * 7200) + 3600, // 1-3 hours from now
  currentRoundTotalUSDC: (Math.random() * 10000).toFixed(2),
  currentRoundPlayers: Math.floor(Math.random() * 100) + 1
});

// Function to send stats message
async function sendStatsMessage(chatId) {
  const stats = getMockContractStats();
  
  // Format end time
  const endTime = new Date(stats.currentRoundendtime * 1000);
  const now = new Date();
  const timeLeft = Math.max(0, Math.floor((endTime - now) / 1000));
  
  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = Math.floor(timeLeft % 60);
  
  const timeLeftStr = timeLeft > 0 ? 
    `${hours}h ${minutes}m ${seconds}s` : 
    'Round ended';

  const message = {
    chat_id: chatId,
    text: `🎰 *URIM 50/50 Raffle Stats* 🎰

🆔 *Round ID:* #${stats.currentroundId}

⏰ *Time Left:* ${timeLeftStr}

💰 *Total Prize Pool:* $${stats.currentRoundTotalUSDC} USDC

👥 *Total Players:* ${stats.currentRoundPlayers} players

🏆 *Winner gets:* $${(parseFloat(stats.currentRoundTotalUSDC) * 0.5).toFixed(2)} USDC

📊 Visit urim.live/lottery for more details!`,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🎮 Play Now',
            web_app: {
              url: DOMAIN
            }
          },
          {
            text: '🔄 Refresh Stats',
            callback_data: 'view_stats'
          }
        ],
        [
          {
            text: '📢 Share Raffle',
            callback_data: 'share_raffle'
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
  const stats = getMockContractStats();
  const shareText = `🎰 Join the URIM 50/50 Raffle! 

💰 Current pot: $${stats.currentRoundTotalUSDC} USDC
👥 ${stats.currentRoundPlayers} players already joined
🎫 Only $5 USDC per ticket

🏆 Winner takes 50% of the pot!

Join now: @URIMRaffleBot`;

  const message = {
    chat_id: chatId,
    text: shareText,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '📤 Share with Friends',
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
        // Send stats message
        await sendStatsMessage(chatId);
      }
    }

    if (callback_query) {
      const chatId = callback_query.message.chat.id;
      const userId = callback_query.from.id;
      const data = callback_query.data;
      
      console.log(`Callback query: ${data} from user: ${userId}`);

      // Answer callback query first
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        callback_query_id: callback_query.id,
        text: 'Loading...'
      });

      if (data === 'view_stats') {
        await sendStatsMessage(chatId);
      } else if (data === 'share_raffle') {
        await sendShareMessage(chatId);
      }
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
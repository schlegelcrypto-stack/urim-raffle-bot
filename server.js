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
      }
    }

    if (callback_query) {
      const chatId = callback_query.message.chat.id;
      const userId = callback_query.from.id;
      const data = callback_query.data;
      
      console.log(`Callback query from user: ${userId}, data: ${data}`);

      // Handle button callbacks
      if (data === 'view_stats') {
        await sendStatsMessage(chatId);
      } else if (data === 'website') {
        await sendWebsiteMessage(chatId);
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
    text: '🎰 *URIM 50/50 Raffle* 🎰\n\n💰 Win big on Base Network!\n🎫 Tickets: $5 USDC each\n🏆 50% goes to winner\n⚡ Powered by USDC payments\n\nTap "Play Raffle" to start!',
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
            text: '🌐 Website',
            callback_data: 'website'
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
  const message = {
    chat_id: chatId,
    text: '📊 *URIM Raffle Stats*\n\n🎫 Current Raffle ID: 874482516\n💰 Current Pot: Loading...\n🔢 Tickets Sold: Loading...\n⏰ Next Draw: Every hour\n🏆 Win Rate: 50/50 split\n\n*Stats update in real-time in the app!*',
    parse_mode: 'Markdown'
  };

  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, message);
    console.log('Stats message sent successfully');
  } catch (error) {
    console.error('Error sending stats message:', error.response?.data || error.message);
  }
}

// Function to send website message
async function sendWebsiteMessage(chatId) {
  const message = {
    chat_id: chatId,
    text: '🌐 *Visit URIM Website*\n\nLearn more about URIM raffles and other features:\n\n🔗 [urim.live/lottery](https://urim.live/lottery)\n\nDiscover:\n• Multiple raffle types\n• Prize history\n• How it works\n• Community features',
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🌐 Open Website',
            url: 'https://urim.live/lottery'
          }
        ]
      ]
    }
  };

  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, message);
    console.log('Website message sent successfully');
  } catch (error) {
    console.error('Error sending website message:', error.response?.data || error.message);
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

// Test endpoint for debugging
app.get('/test', (req, res) => {
  res.json({
    message: 'URIM Raffle Bot is running!',
    domain: DOMAIN,
    telegram: {
      botConfigured: !!BOT_TOKEN,
      webhookUrl: `${DOMAIN}/webhook`
    }
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
  console.log(`📡 Webhook URL: ${DOMAIN}/webhook`);
});

module.exports = app;
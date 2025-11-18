const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '8323137830:AAFA3wnduW5_e_GCAOtSRMo0yRTKgYb1B6Y';
const DOMAIN = process.env.DOMAIN || 'https://urim-raffle-bot.vercel.app';

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
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

// Telegram webhook endpoint - THIS IS THE CRITICAL PART
app.post('/webhook', async (req, res) => {
  try {
    console.log('Received webhook:', JSON.stringify(req.body, null, 2));
    
    const { message, callback_query } = req.body;
    
    // Handle regular messages
    if (message) {
      const chatId = message.chat.id;
      const userId = message.from.id;
      const text = message.text;
      const userName = message.from.first_name || 'User';

      console.log(`Message from ${userName} (${userId}): ${text}`);

      if (text === '/start') {
        console.log('Sending start message to chat:', chatId);
        await sendStartMessage(chatId, userName);
      } else if (text === '/help') {
        await sendHelpMessage(chatId);
      }
    }

    // Handle callback queries (button presses)
    if (callback_query) {
      const chatId = callback_query.message.chat.id;
      const userId = callback_query.from.id;
      const data = callback_query.data;
      
      console.log(`Callback from user ${userId}: ${data}`);
      
      // Acknowledge the callback
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        callback_query_id: callback_query.id
      });

      if (data === 'view_stats') {
        await sendStatsMessage(chatId);
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Function to send start message with web app
async function sendStartMessage(chatId, userName) {
  const message = {
    chat_id: chatId,
    text: `🎰 *Welcome ${userName}!* 🎰\n\n🔥 *URIM 50/50 Raffle* 🔥\n\n💰 Win big on Base Network!\n🎫 Tickets: $5 USDC each\n🏆 50% goes to winner, 50% to pot\n⚡ Instant payouts with USDC\n\n🎮 Tap "Play Raffle" to get started!\n\n*Testing Mode - @schlegelcrypto*`,
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
            url: 'https://urim.live/lottery'
          }
        ]
      ]
    }
  };

  try {
    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, message);
    console.log('Start message sent successfully');
    return response.data;
  } catch (error) {
    console.error('Error sending start message:', error.response?.data || error.message);
    throw error;
  }
}

// Function to send help message
async function sendHelpMessage(chatId) {
  const helpText = `🤖 *URIM Raffle Bot Help* 🤖\n\n*Commands:*\n/start - Launch the raffle app\n/help - Show this help message\n\n*How to Play:*\n1. Connect your wallet\n2. Buy tickets with USDC\n3. Wait for the draw\n4. Win 50% of the pot!\n\n*Contract Info:*\nNetwork: Base\nToken: USDC\nRaffle ID: 874482516\n\n*Testing Mode - @schlegelcrypto*`;
  
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: helpText,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('Error sending help message:', error);
  }
}

// Function to send stats message
async function sendStatsMessage(chatId) {
  const statsText = `📊 *Raffle Statistics* 📊\n\n🎫 *Current Raffle:* #874482516\n💰 *Current Pot:* Loading...\n🎯 *Tickets Sold:* Loading...\n⏰ *Next Draw:* Every hour\n\n🌐 *Network:* Base\n💵 *Currency:* USDC\n🎟️ *Ticket Price:* $5.00\n\n*Testing Mode - @schlegelcrypto*`;
  
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: statsText,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('Error sending stats message:', error);
  }
}

// Debug endpoint to check webhook status
app.get('/webhook-info', async (req, res) => {
  try {
    const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to set webhook
app.get('/setup-webhook', async (req, res) => {
  try {
    const webhookUrl = `${DOMAIN}/webhook`;
    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query']
    });
    
    res.json({ 
      success: true, 
      webhookUrl,
      response: response.data 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.response?.data || error.message 
    });
  }
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({
    message: 'Bot is running!',
    timestamp: new Date().toISOString(),
    domain: DOMAIN,
    botConfigured: !!BOT_TOKEN
  });
});

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
  console.log(`📡 Webhook endpoint: ${DOMAIN}/webhook`);
});

module.exports = app;
const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '8323137830:AAFA3wnduW5_e_GCAOtSRMo0yRTKgYb1B6Y';
const DOMAIN = process.env.DOMAIN || 'https://your-app-name.vercel.app';

// Middleware
app.use(express.json());
app.use(express.static('.'));

// Telegram Bot API helper
const telegram = axios.create({
  baseURL: `https://api.telegram.org/bot${BOT_TOKEN}/`,
  timeout: 10000
});

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    bot_token: BOT_TOKEN ? 'configured' : 'missing',
    domain: DOMAIN
  });
});

// Serve the webapp
app.get('/webapp', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Main route - redirect to webapp
app.get('/', (req, res) => {
  res.redirect('/webapp');
});

// Webhook endpoint for Telegram
app.post('/webhook', async (req, res) => {
  try {
    const { message, callback_query } = req.body;
    
    console.log('Webhook received:', JSON.stringify(req.body, null, 2));
    
    if (message) {
      await handleMessage(message);
    }
    
    if (callback_query) {
      await handleCallbackQuery(callback_query);
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

// Handle incoming messages
async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = message.text;
  const userId = message.from.id;
  const firstName = message.from.first_name || 'User';
  
  console.log(`Message from ${firstName} (${userId}): ${text}`);
  
  try {
    if (text === '/start') {
      await sendWelcomeMessage(chatId, firstName);
    } else if (text === '/help') {
      await sendHelpMessage(chatId);
    } else if (text === '/raffle') {
      await sendRaffleApp(chatId);
    } else {
      // Default response
      await sendMessage(chatId, `Hey ${firstName}! 👋\n\nUse /start to open the raffle app or /help for more commands.`);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    await sendMessage(chatId, 'Sorry, something went wrong. Please try again later.');
  }
}

// Handle callback queries (inline button presses)
async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  
  console.log(`Callback query from ${userId}: ${data}`);
  
  try {
    if (data === 'open_raffle') {
      await sendRaffleApp(chatId);
    } else if (data === 'help') {
      await sendHelpMessage(chatId);
    }
    
    // Answer the callback query to stop loading animation
    await telegram.post('answerCallbackQuery', {
      callback_query_id: callbackQuery.id
    });
  } catch (error) {
    console.error('Error handling callback query:', error);
  }
}

// Send welcome message with inline keyboard
async function sendWelcomeMessage(chatId, firstName) {
  const message = `🎰 Welcome to URIM 50/50 Raffle, ${firstName}!

🏆 **Current Features:**
• 50/50 Raffle System
• Base Network Integration  
• Chainlink Price Feeds
• Real-time Prize Pool Updates

💰 **How it Works:**
1. Buy tickets for $5 USD each
2. 50% goes to winner, 50% to next pot
3. Automated hourly draws
4. Win big with crypto prizes!

🚀 **Ready to play?**`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🎫 Open Raffle App', web_app: { url: `${DOMAIN}/webapp` } }
      ],
      [
        { text: '❓ Help', callback_data: 'help' },
        { text: '📢 Share', switch_inline_query: 'Join the URIM 50/50 Raffle! 🎰💰' }
      ]
    ]
  };

  await sendMessage(chatId, message, { reply_markup: keyboard });
}

// Send help message
async function sendHelpMessage(chatId) {
  const message = `🆘 **URIM Raffle Help**

**Commands:**
• /start - Open the main menu
• /raffle - Launch the raffle app directly
• /help - Show this help message

**How to Play:**
1. Connect your Web3 wallet (MetaMask, WalletConnect, etc.)
2. Make sure you're on Base network
3. Buy tickets for $5 USD each (paid in ETH)
4. Wait for the hourly draw
5. Winners get 50% of the pot!

**Important:**
• Only Base network is supported
• Prices are fetched from Chainlink
• Draws happen automatically every hour
• 5% goes to treasury, 2% to affiliates (coming soon)

**Need more help?**
Contact: @URIM_Support`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🎫 Play Now', web_app: { url: `${DOMAIN}/webapp` } }
      ]
    ]
  };

  await sendMessage(chatId, message, { reply_markup: keyboard });
}

// Send raffle app directly
async function sendRaffleApp(chatId) {
  const message = `🎰 **URIM 50/50 Raffle**

Click below to open the raffle app and start playing!

💡 Make sure you have a Web3 wallet ready and some ETH on Base network.`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🚀 Launch Raffle App', web_app: { url: `${DOMAIN}/webapp` } }
      ]
    ]
  };

  await sendMessage(chatId, message, { reply_markup: keyboard });
}

// Send message helper
async function sendMessage(chatId, text, options = {}) {
  try {
    await telegram.post('sendMessage', {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
      ...options
    });
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    throw error;
  }
}

// Set webhook on startup (for production)
async function setWebhook() {
  if (process.env.NODE_ENV === 'production' && DOMAIN !== 'https://your-app-name.vercel.app') {
    try {
      const response = await telegram.post('setWebhook', {
        url: `${DOMAIN}/webhook`,
        allowed_updates: ['message', 'callback_query']
      });
      console.log('Webhook set successfully:', response.data);
    } catch (error) {
      console.error('Error setting webhook:', error.response?.data || error.message);
    }
  }
}

// Error handling
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  console.log(`404 - Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Not found', path: req.url });
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 URIM Raffle Bot server running on port ${PORT}`);
  console.log(`📱 Bot token: ${BOT_TOKEN ? 'configured' : 'MISSING'}`);
  console.log(`🌐 Domain: ${DOMAIN}`);
  console.log(`🔗 Webapp URL: ${DOMAIN}/webapp`);
  console.log(`📡 Webhook URL: ${DOMAIN}/webhook`);
  
  // Set webhook in production
  await setWebhook();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

module.exports = app;
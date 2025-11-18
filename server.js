const express = require('express');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '8323137830:AAFA3wnduW5_e_GCAOtSRMo0yRTKgYb1B6Y';
const DOMAIN = process.env.DOMAIN || 'https://urim-raffle-bot.vercel.app';

// Alchemy webhook configuration
const ALCHEMY_WEBHOOK_ID = 'wh_egkx8g4uyxp48bqp';
const ALCHEMY_SIGNING_KEY = 'whsec_bPCKpyY9Ks6XzLFoxbOTHjV5';
const RAFFLE_CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69';
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Store for real-time pot data
let currentPot = {
  balance: '0',
  lastUpdate: Date.now(),
  participants: 0
};

// Store for active subscribers (for notifications)
let subscribers = new Set();

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

// Verify Alchemy webhook signature
function verifyAlchemySignature(body, signature, signingKey) {
  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(body, 'utf8');
  const digest = hmac.digest('hex');
  
  // Alchemy uses 'sha256=' prefix
  const expectedSignature = `sha256=${digest}`;
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(expectedSignature, 'utf8')
  );
}

// Alchemy webhook endpoint for tracking raffle transactions
app.post('/alchemy-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-alchemy-signature'];
    
    if (!signature) {
      console.log('No signature provided in Alchemy webhook');
      return res.status(401).send('Unauthorized');
    }

    // Verify signature
    const isValid = verifyAlchemySignature(req.body, signature, ALCHEMY_SIGNING_KEY);
    if (!isValid) {
      console.log('Invalid Alchemy webhook signature');
      return res.status(401).send('Unauthorized');
    }

    const payload = JSON.parse(req.body.toString());
    console.log('Alchemy webhook received:', JSON.stringify(payload, null, 2));

    // Process webhook data
    if (payload.event && payload.event.activity) {
      await processAlchemyActivity(payload.event.activity);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Alchemy webhook error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Process Alchemy activity and update pot
async function processAlchemyActivity(activities) {
  for (const activity of activities) {
    try {
      // Check if this is a transaction to our raffle contract
      if (activity.toAddress && activity.toAddress.toLowerCase() === RAFFLE_CONTRACT.toLowerCase()) {
        console.log('Raffle transaction detected:', activity);
        
        // If it's a USDC transfer (buyTicket function)
        if (activity.asset && activity.asset.toLowerCase() === USDC_CONTRACT.toLowerCase()) {
          const value = parseFloat(activity.value) || 0;
          
          if (value > 0) {
            // Update pot balance
            const previousBalance = parseFloat(currentPot.balance);
            currentPot.balance = (previousBalance + value).toString();
            currentPot.lastUpdate = Date.now();
            currentPot.participants += 1;
            
            console.log(`Pot updated: +${value} USDC, Total: ${currentPot.balance} USDC`);
            
            // Send notifications to subscribers
            await notifyPotUpdate(value, currentPot.balance, activity);
          }
        }
      }
    } catch (error) {
      console.error('Error processing activity:', error);
    }
  }
}

// Send pot update notifications to subscribers
async function notifyPotUpdate(amount, totalPot, activity) {
  const message = `🚨 *Pot Update!* 🚨\n\n💰 *+$${amount.toFixed(2)} USDC added*\n🏆 *New pot total: $${parseFloat(totalPot).toFixed(2)} USDC*\n🎫 *Participants: ${currentPot.participants}*\n\n⚡ *Transaction:* \`${activity.hash?.slice(0, 10)}...${activity.hash?.slice(-6)}\`\n\n🎰 Good luck to all players!`;

  // Send to all subscribers
  const notifications = Array.from(subscribers).map(async (chatId) => {
    try {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error(`Failed to notify subscriber ${chatId}:`, error);
      // Remove invalid chat IDs
      subscribers.delete(chatId);
    }
  });

  await Promise.allSettled(notifications);
}

// API endpoint to get current pot data
app.get('/api/pot', (req, res) => {
  res.json({
    balance: currentPot.balance,
    lastUpdate: currentPot.lastUpdate,
    participants: currentPot.participants,
    timestamp: Date.now()
  });
});

// API endpoint to subscribe to notifications
app.post('/api/subscribe/:chatId', (req, res) => {
  const chatId = req.params.chatId;
  subscribers.add(chatId);
  console.log(`User ${chatId} subscribed to notifications`);
  res.json({ subscribed: true, chatId });
});

// API endpoint to unsubscribe from notifications
app.post('/api/unsubscribe/:chatId', (req, res) => {
  const chatId = req.params.chatId;
  subscribers.delete(chatId);
  console.log(`User ${chatId} unsubscribed from notifications`);
  res.json({ unsubscribed: true, chatId });
});

// Telegram webhook endpoint
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
      } else if (text === '/pot') {
        await sendPotStatus(chatId);
      } else if (text === '/notify') {
        subscribers.add(chatId);
        await sendNotificationSettings(chatId, true);
      } else if (text === '/stop') {
        subscribers.delete(chatId);
        await sendNotificationSettings(chatId, false);
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
      } else if (data === 'pot_status') {
        await sendPotStatus(chatId);
      } else if (data === 'toggle_notifications') {
        if (subscribers.has(chatId)) {
          subscribers.delete(chatId);
          await sendNotificationSettings(chatId, false);
        } else {
          subscribers.add(chatId);
          await sendNotificationSettings(chatId, true);
        }
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
    text: `🎰 *Welcome ${userName}!* 🎰\n\n🔥 *URIM 50/50 Raffle* 🔥\n\n💰 Current pot: $${parseFloat(currentPot.balance).toFixed(2)} USDC\n🎫 Tickets: $5 USDC each\n🏆 50% goes to winner, 50% to pot\n⚡ Instant payouts with USDC\n\n🎮 Tap "Play Raffle" to get started!\n📊 Use /pot to check current pot\n🔔 Use /notify to get live updates\n\n*Testing Mode - @schlegelcrypto*`,
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
            text: '📊 Pot Status',
            callback_data: 'pot_status'
          },
          {
            text: '🔔 Notifications',
            callback_data: 'toggle_notifications'
          }
        ],
        [
          {
            text: '📈 View Stats',
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

// Function to send current pot status
async function sendPotStatus(chatId) {
  const potText = `💰 *Current Pot Status* 💰\n\n🏆 *Total Pot:* $${parseFloat(currentPot.balance).toFixed(2)} USDC\n👥 *Participants:* ${currentPot.participants}\n🎫 *Ticket Price:* $5.00 USDC\n⏰ *Last Update:* ${new Date(currentPot.lastUpdate).toLocaleTimeString()}\n\n📊 *Prize Distribution:*\n🥇 Winner: $${(parseFloat(currentPot.balance) * 0.5).toFixed(2)} USDC\n🎰 Next Pot: $${(parseFloat(currentPot.balance) * 0.5).toFixed(2)} USDC\n\n*Powered by Alchemy webhooks* ⚡`;
  
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: potText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🎮 Play Now',
              web_app: { url: DOMAIN }
            },
            {
              text: '🔄 Refresh',
              callback_data: 'pot_status'
            }
          ]
        ]
      }
    });
  } catch (error) {
    console.error('Error sending pot status:', error);
  }
}

// Function to send notification settings
async function sendNotificationSettings(chatId, isSubscribed) {
  const notificationText = `🔔 *Notification Settings* 🔔\n\n*Status:* ${isSubscribed ? '✅ Subscribed' : '❌ Unsubscribed'}\n\n${isSubscribed ? 
    '🎉 You will receive live updates when:\n• New tickets are purchased\n• Pot amount increases\n• Raffle draws occur\n\nUse /stop to unsubscribe' : 
    '💤 Notifications are disabled\n\nUse /notify to enable live updates about:\n• Pot increases\n• New ticket purchases\n• Draw results'}\n\n*Real-time updates powered by Alchemy* ⚡`;
  
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: notificationText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: isSubscribed ? '🔕 Unsubscribe' : '🔔 Subscribe',
              callback_data: 'toggle_notifications'
            }
          ]
        ]
      }
    });
  } catch (error) {
    console.error('Error sending notification settings:', error);
  }
}

// Function to send help message
async function sendHelpMessage(chatId) {
  const helpText = `🤖 *URIM Raffle Bot Help* 🤖\n\n*Commands:*\n/start - Launch the raffle app\n/pot - Check current pot status\n/notify - Enable live notifications\n/stop - Disable notifications\n/help - Show this help message\n\n*How to Play:*\n1. Connect your wallet\n2. Buy tickets with USDC\n3. Wait for the draw\n4. Win 50% of the pot!\n\n*Real-time Features:*\n🔔 Live pot updates\n⚡ Instant transaction tracking\n📊 Real-time participant count\n\n*Contract Info:*\nNetwork: Base\nToken: USDC\nRaffle ID: 874482516\n\n*Powered by Alchemy webhooks*\n*Testing Mode - @schlegelcrypto*`;
  
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
  const statsText = `📊 *Live Raffle Statistics* 📊\n\n🎫 *Current Raffle:* #874482516\n💰 *Current Pot:* $${parseFloat(currentPot.balance).toFixed(2)} USDC\n👥 *Participants:* ${currentPot.participants}\n⏰ *Last Update:* ${new Date(currentPot.lastUpdate).toLocaleTimeString()}\n\n🎯 *Next Draw:* Every hour\n🏆 *Winner Prize:* $${(parseFloat(currentPot.balance) * 0.5).toFixed(2)} USDC\n💎 *Next Pot:* $${(parseFloat(currentPot.balance) * 0.5).toFixed(2)} USDC\n\n🌐 *Network:* Base\n💵 *Currency:* USDC\n🎟️ *Ticket Price:* $5.00\n\n🔔 *Subscribers:* ${subscribers.size} users\n⚡ *Powered by Alchemy webhooks*\n\n*Testing Mode - @schlegelcrypto*`;
  
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: statsText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🎮 Play Now',
              web_app: { url: DOMAIN }
            },
            {
              text: '🔄 Refresh Stats',
              callback_data: 'view_stats'
            }
          ]
        ]
      }
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

// Debug endpoint for Alchemy webhook
app.get('/alchemy-status', (req, res) => {
  res.json({
    webhookId: ALCHEMY_WEBHOOK_ID,
    signingKeyConfigured: !!ALCHEMY_SIGNING_KEY,
    currentPot: currentPot,
    subscribers: subscribers.size,
    endpoint: `${DOMAIN}/alchemy-webhook`
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({
    message: 'Bot is running!',
    timestamp: new Date().toISOString(),
    domain: DOMAIN,
    botConfigured: !!BOT_TOKEN,
    alchemyConfigured: !!ALCHEMY_SIGNING_KEY,
    currentPot: currentPot,
    subscribers: subscribers.size
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    domain: DOMAIN,
    botToken: BOT_TOKEN ? 'configured' : 'missing',
    alchemyWebhook: ALCHEMY_SIGNING_KEY ? 'configured' : 'missing',
    pot: currentPot
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
  console.log(`📡 Telegram webhook: ${DOMAIN}/webhook`);
  console.log(`⚡ Alchemy webhook: ${DOMAIN}/alchemy-webhook`);
  console.log(`🔑 Alchemy signing key: ${ALCHEMY_SIGNING_KEY ? 'configured' : 'missing'}`);
  console.log(`💰 Current pot: $${currentPot.balance} USDC`);
});

module.exports = app;
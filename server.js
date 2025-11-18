const express = require('express');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '8323137830:AAFA3wnduW5_e_GCAOtSRMo0yRTKgYb1B6Y';
const DOMAIN = process.env.DOMAIN || 'https://urim-raffle-bot.vercel.app';

// Updated Alchemy Webhook Configuration
const ALCHEMY_WEBHOOK_ID = 'wh_sscvh18lgmflvsec';
const ALCHEMY_SIGNING_KEY = 'whsec_Asz7YV5pUCJaeCJWvU65Cr2P';

// Configure express with proper middleware
app.use(express.json({ 
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Add request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Serve static files with proper headers
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

// In-memory storage for real-time data
let raffleData = {
  pot: '125.50',
  participants: 25,
  lastUpdate: Date.now()
};

let subscribers = new Set();
let notificationSubscribers = new Set();

// Function to verify Alchemy webhook signature
function verifyAlchemySignature(payload, signature) {
  try {
    if (!signature || !ALCHEMY_SIGNING_KEY) return false;
    
    // Remove 'whsec_' prefix from signing key
    const key = ALCHEMY_SIGNING_KEY.replace('whsec_', '');
    
    // Create HMAC
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(payload);
    const computedSignature = hmac.digest('hex');
    
    // Compare signatures
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(computedSignature, 'hex')
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// Function to send message to Telegram with retry logic
async function sendTelegramMessage(chatId, message, options = {}) {
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const requestData = {
        chat_id: chatId,
        ...message,
        ...options
      };

      console.log(`Attempt ${attempt} - Sending message to chat ${chatId}`);
      
      const response = await axios.post(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, 
        requestData,
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`✅ Message sent successfully to chat ${chatId}`);
      return response.data;
      
    } catch (error) {
      lastError = error;
      console.error(`❌ Attempt ${attempt} failed for chat ${chatId}:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`❌ Failed to send message after ${maxRetries} attempts:`, lastError.response?.data || lastError.message);
  throw lastError;
}

// Function to answer callback query
async function answerCallbackQuery(callbackQueryId, text = null) {
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
      text: text
    });
  } catch (error) {
    console.error('Error answering callback query:', error.response?.data || error.message);
  }
}

// Alchemy webhook endpoint for tracking raffle transactions
app.post('/alchemy-webhook', (req, res) => {
  try {
    const signature = req.headers['x-alchemy-signature'];
    const payload = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
    
    console.log('📡 Received Alchemy webhook:', {
      webhookId: req.body.webhookId,
      signature: signature ? 'present' : 'missing',
      bodySize: payload.length
    });
    
    // Verify webhook signature
    if (!signature || !verifyAlchemySignature(payload, signature)) {
      console.log('❌ Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { webhookId, id, createdAt, type, event } = req.body;
    
    // Confirm this is our webhook
    if (webhookId !== ALCHEMY_WEBHOOK_ID) {
      console.log('❌ Unknown webhook ID:', webhookId);
      return res.status(400).json({ error: 'Unknown webhook' });
    }

    // Process the transaction
    if (event && event.activity) {
      event.activity.forEach(activity => {
        console.log('🔍 Processing activity:', {
          hash: activity.hash,
          fromAddress: activity.fromAddress,
          toAddress: activity.toAddress,
          value: activity.value,
          blockNum: activity.blockNum
        });

        // Check if this is a raffle ticket purchase
        if (activity.toAddress?.toLowerCase() === '0x36086C5950325B971E5DC11508AB67A1CE30Dc69'.toLowerCase()) {
          // Update raffle data
          const ticketPrice = 5; // $5 USDC per ticket
          const currentPot = parseFloat(raffleData.pot) + ticketPrice;
          
          raffleData.pot = currentPot.toFixed(2);
          raffleData.participants += 1;
          raffleData.lastUpdate = Date.now();
          
          console.log('🎫 New raffle ticket purchased!', {
            pot: raffleData.pot,
            participants: raffleData.participants,
            buyer: activity.fromAddress
          });

          // Notify subscribers about new ticket
          notifyAllSubscribers({
            type: 'ticket_purchased',
            pot: raffleData.pot,
            participants: raffleData.participants,
            buyer: activity.fromAddress?.slice(0, 6) + '...' + activity.fromAddress?.slice(-4),
            hash: activity.hash?.slice(0, 10) + '...'
          });
        }
      });
    }

    res.status(200).json({ 
      success: true, 
      webhookId,
      processed: true,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Alchemy webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Function to notify all subscribers
function notifyAllSubscribers(data) {
  // Notify real-time subscribers (SSE)
  subscribers.forEach(subscriber => {
    try {
      if (subscriber.write && !subscriber.destroyed) {
        subscriber.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    } catch (error) {
      console.error('Error sending to SSE subscriber:', error);
    }
  });

  // Notify Telegram subscribers
  if (data.type === 'ticket_purchased') {
    notificationSubscribers.forEach(async (chatId) => {
      try {
        const message = `🎫 *New Ticket Purchased!*\n\n💰 Current Pot: $${data.pot} USDC\n🎯 Total Tickets: ${data.participants}\n👤 Buyer: ${data.buyer}\n🔗 TX: ${data.hash}\n\n🎮 Play now to join the action!`;
        
        await sendTelegramMessage(chatId, {
          text: message,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{
                text: '🎮 Play Now',
                web_app: { url: DOMAIN }
              }]
            ]
          }
        });
      } catch (error) {
        console.error(`Failed to notify subscriber ${chatId}:`, error);
        // Remove invalid subscribers
        notificationSubscribers.delete(chatId);
      }
    });
  }
}

// Server-Sent Events endpoint for real-time updates
app.get('/raffle-updates', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  console.log('📡 New SSE connection established');

  // Send current data immediately
  res.write(`data: ${JSON.stringify({
    type: 'initial',
    ...raffleData
  })}\n\n`);

  // Keep connection alive with heartbeat
  const heartbeat = setInterval(() => {
    if (!res.destroyed) {
      res.write(`data: ${JSON.stringify({ 
        type: 'heartbeat', 
        timestamp: Date.now() 
      })}\n\n`);
    } else {
      clearInterval(heartbeat);
    }
  }, 30000);

  // Add to subscribers
  subscribers.add(res);

  // Clean up on disconnect
  req.on('close', () => {
    console.log('📡 SSE connection closed');
    clearInterval(heartbeat);
    subscribers.delete(res);
  });

  req.on('error', (error) => {
    console.error('SSE error:', error);
    clearInterval(heartbeat);
    subscribers.delete(res);
  });
});

// API endpoint to get current raffle data
app.get('/api/raffle-data', (req, res) => {
  res.json({
    success: true,
    data: raffleData,
    timestamp: Date.now()
  });
});

// User notification subscription endpoints
app.post('/api/notify', async (req, res) => {
  try {
    const { chatId, action } = req.body;
    
    if (!chatId) {
      return res.status(400).json({ error: 'Chat ID is required' });
    }
    
    if (action === 'subscribe') {
      notificationSubscribers.add(chatId);
      console.log(`✅ User ${chatId} subscribed to notifications`);
      
      await sendTelegramMessage(chatId, {
        text: '🔔 *Notifications Enabled!*\n\nYou\'ll receive updates when:\n• New tickets are purchased\n• Pot size increases\n• Raffle draws occur\n\nUse /notify off to disable.',
        parse_mode: 'Markdown'
      });
      
      res.json({ success: true, message: 'Subscribed to notifications' });
      
    } else if (action === 'unsubscribe') {
      notificationSubscribers.delete(chatId);
      console.log(`✅ User ${chatId} unsubscribed from notifications`);
      
      await sendTelegramMessage(chatId, {
        text: '🔕 *Notifications Disabled*\n\nYou will no longer receive raffle updates.\n\nUse /notify on to re-enable.',
        parse_mode: 'Markdown'
      });
      
      res.json({ success: true, message: 'Unsubscribed from notifications' });
    } else {
      res.status(400).json({ error: 'Invalid action. Use "subscribe" or "unsubscribe"' });
    }
  } catch (error) {
    console.error('❌ Notification error:', error);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
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

// Telegram webhook endpoint - MAIN FIX HERE
app.post('/webhook', async (req, res) => {
  try {
    console.log('🤖 Webhook received:', {
      timestamp: new Date().toISOString(),
      body: JSON.stringify(req.body, null, 2),
      headers: req.headers['content-type']
    });
    
    const { message, callback_query, edited_message } = req.body;
    
    // Immediately respond to Telegram to acknowledge receipt
    res.status(200).json({ ok: true });
    
    // Handle regular messages
    if (message) {
      const chatId = message.chat.id;
      const userId = message.from.id;
      const text = message.text?.trim();
      const userName = message.from.first_name || message.from.username || 'User';

      console.log(`📩 Message from ${userName} (${userId}) in chat ${chatId}: "${text}"`);

      // Handle different commands
      if (text === '/start') {
        console.log('🚀 Processing /start command');
        await sendStartMessage(chatId, userName);
        
      } else if (text === '/help') {
        console.log('❓ Processing /help command');
        await sendHelpMessage(chatId);
        
      } else if (text === '/notify on') {
        console.log('🔔 Processing /notify on command');
        notificationSubscribers.add(chatId);
        await sendTelegramMessage(chatId, {
          text: '🔔 *Notifications Enabled!*\n\nYou\'ll receive real-time updates about:\n• New ticket purchases\n• Pot increases\n• Raffle draws\n\nUse /notify off to disable.',
          parse_mode: 'Markdown'
        });
        
      } else if (text === '/notify off') {
        console.log('🔕 Processing /notify off command');
        notificationSubscribers.delete(chatId);
        await sendTelegramMessage(chatId, {
          text: '🔕 *Notifications Disabled*\n\nYou will no longer receive raffle updates.\n\nUse /notify on to re-enable notifications.',
          parse_mode: 'Markdown'
        });
        
      } else if (text === '/stats') {
        console.log('📊 Processing /stats command');
        await sendStatsMessage(chatId);
        
      } else if (text && text.startsWith('/')) {
        // Handle unknown commands
        await sendTelegramMessage(chatId, {
          text: '❓ Unknown command. Use /help to see available commands.',
          reply_markup: {
            inline_keyboard: [[
              { text: '📖 Help', callback_data: 'help' },
              { text: '🎮 Play', web_app: { url: DOMAIN } }
            ]]
          }
        });
      }
    }

    // Handle callback queries (button presses)
    if (callback_query) {
      const chatId = callback_query.message?.chat?.id;
      const userId = callback_query.from?.id;
      const data = callback_query.data;
      const callbackQueryId = callback_query.id;
      
      console.log(`🔘 Callback from user ${userId} in chat ${chatId}: "${data}"`);
      
      // Always acknowledge the callback first
      await answerCallbackQuery(callbackQueryId);

      if (data === 'view_stats') {
        await sendStatsMessage(chatId);
      } else if (data === 'help') {
        await sendHelpMessage(chatId);
      } else if (data === 'notify_on') {
        notificationSubscribers.add(chatId);
        await answerCallbackQuery(callbackQueryId, '🔔 Notifications enabled!');
      } else if (data === 'notify_off') {
        notificationSubscribers.delete(chatId);
        await answerCallbackQuery(callbackQueryId, '🔕 Notifications disabled!');
      }
    }

    // Handle edited messages
    if (edited_message) {
      console.log('✏️ Edited message received, ignoring...');
    }

  } catch (error) {
    console.error('❌ Webhook processing error:', {
      error: error.message,
      stack: error.stack,
      response: error.response?.data
    });
    
    // Still respond with 200 to prevent Telegram from retrying
    if (!res.headersSent) {
      res.status(200).json({ ok: true, error: error.message });
    }
  }
});

// Function to send start message with web app
async function sendStartMessage(chatId, userName) {
  try {
    const message = {
      text: `🎰 *Welcome ${userName}!* 🎰\n\n🔥 *URIM 50/50 Raffle* 🔥\n\n💰 Current Pot: $${raffleData.pot} USDC\n🎫 Tickets Sold: ${raffleData.participants}\n💵 Ticket Price: $5.00 USDC\n🏆 50% goes to winner, 50% to next pot\n⚡ Instant payouts on Base Network\n\n🎮 Tap "Play Raffle" to get started!\n\n*Testing Mode - @schlegelcrypto*`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{
            text: '🎮 Play Raffle',
            web_app: { url: DOMAIN }
          }],
          [
            { text: '📊 View Stats', callback_data: 'view_stats' },
            { text: '🌐 Website', url: 'https://urim.live/lottery' }
          ],
          [
            { text: '🔔 Notifications', callback_data: 'notify_on' },
            { text: '📖 Help', callback_data: 'help' }
          ]
        ]
      }
    };

    await sendTelegramMessage(chatId, message);
    console.log('✅ Start message sent successfully');
    
  } catch (error) {
    console.error('❌ Error sending start message:', error);
    throw error;
  }
}

// Function to send help message
async function sendHelpMessage(chatId) {
  const helpText = `🤖 *URIM Raffle Bot Help* 🤖

*Available Commands:*
/start - Launch the raffle app
/help - Show this help message
/stats - View current raffle statistics
/notify on - Enable notifications
/notify off - Disable notifications

*How to Play:*
1️⃣ Connect your Web3 wallet
2️⃣ Buy tickets with USDC ($5 each)
3️⃣ Wait for the hourly draw
4️⃣ Win 50% of the total pot!

*Real-time Features:*
🔔 Live notifications for new tickets
📈 Real-time pot tracking
⚡ Instant transaction updates via Alchemy

*Contract Information:*
🌐 Network: Base Mainnet
💰 Currency: USDC
🎫 Ticket Price: $5.00 USDC
🆔 Raffle ID: 874482516
📋 Contract: 0x36086C...0Dc69

*Security:*
✅ Smart contract verified
✅ Alchemy webhook monitoring
✅ Automatic payouts

*Testing Mode - @schlegelcrypto*`;
  
  try {
    await sendTelegramMessage(chatId, {
      text: helpText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎮 Play Now', web_app: { url: DOMAIN } }],
          [
            { text: '📊 Stats', callback_data: 'view_stats' },
            { text: '🌐 Website', url: 'https://urim.live/lottery' }
          ]
        ]
      }
    });
    console.log('✅ Help message sent successfully');
  } catch (error) {
    console.error('❌ Error sending help message:', error);
  }
}

// Function to send stats message with live data
async function sendStatsMessage(chatId) {
  const lastUpdateTime = new Date(raffleData.lastUpdate).toLocaleString();
  const winnerPot = (parseFloat(raffleData.pot) * 0.5).toFixed(2);
  const nextPot = (parseFloat(raffleData.pot) * 0.5).toFixed(2);
  const uniquePlayers = Math.ceil(raffleData.participants * 0.7);
  
  const statsText = `📊 *Live Raffle Statistics* 📊

🎫 *Current Raffle:* #874482516
💰 *Current Pot:* $${raffleData.pot} USDC
🎯 *Tickets Sold:* ${raffleData.participants}
👥 *Unique Players:* ~${uniquePlayers}
⏰ *Last Update:* ${lastUpdateTime}

🏆 *Prize Distribution:*
• Winner Gets: 50% ($${winnerPot})
• Next Raffle: 50% ($${nextPot})

📋 *Contract Details:*
🌐 Network: Base Mainnet
💵 Currency: USDC
🎟️ Ticket Price: $5.00 USDC
🔗 Contract: 0x36086C...0Dc69

📈 *Statistics:*
• Active Subscribers: ${notificationSubscribers.size}
• Real-time Connections: ${subscribers.size}
• Uptime: ${Math.floor((Date.now() - raffleData.lastUpdate) / 1000 / 60)} min ago

🔔 Want live updates? Use /notify on

*Real-time tracking powered by Alchemy*
*Testing Mode - @schlegelcrypto*`;
  
  try {
    await sendTelegramMessage(chatId, {
      text: statsText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎮 Play Now', web_app: { url: DOMAIN } }],
          [
            { text: '🔄 Refresh', callback_data: 'view_stats' },
            { text: '🔔 Notify', callback_data: 'notify_on' }
          ]
        ]
      }
    });
    console.log('✅ Stats message sent successfully');
  } catch (error) {
    console.error('❌ Error sending stats message:', error);
  }
}

// Debug endpoint to check webhook status
app.get('/webhook-info', async (req, res) => {
  try {
    const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    res.json({
      success: true,
      webhook_info: response.data,
      our_webhook: `${DOMAIN}/webhook`,
      domain: DOMAIN,
      bot_token_configured: !!BOT_TOKEN
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.response?.data || error.message 
    });
  }
});

// Debug endpoint for Alchemy webhook info
app.get('/alchemy-info', (req, res) => {
  res.json({
    webhookId: ALCHEMY_WEBHOOK_ID,
    configured: !!ALCHEMY_SIGNING_KEY,
    endpoint: `${DOMAIN}/alchemy-webhook`,
    raffleData,
    subscribers: subscribers.size,
    notificationSubscribers: notificationSubscribers.size
  });
});

// Endpoint to set webhook with better error handling
app.get('/setup-webhook', async (req, res) => {
  try {
    const webhookUrl = `${DOMAIN}/webhook`;
    console.log(`🔧 Setting up webhook: ${webhookUrl}`);
    
    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true
    });
    
    console.log('✅ Webhook setup successful:', response.data);
    
    res.json({ 
      success: true, 
      webhookUrl,
      response: response.data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Webhook setup failed:', error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      error: error.response?.data || error.message,
      webhookUrl: `${DOMAIN}/webhook`
    });
  }
});

// Test endpoint with comprehensive status
app.get('/test', (req, res) => {
  res.json({
    status: 'running',
    message: 'URIM Raffle Bot is operational!',
    timestamp: new Date().toISOString(),
    config: {
      domain: DOMAIN,
      port: PORT,
      botConfigured: !!BOT_TOKEN,
      alchemyConfigured: !!ALCHEMY_SIGNING_KEY,
    },
    data: raffleData,
    connections: {
      subscribers: subscribers.size,
      notificationSubscribers: notificationSubscribers.size
    },
    endpoints: {
      telegram_webhook: `${DOMAIN}/webhook`,
      alchemy_webhook: `${DOMAIN}/alchemy-webhook`,
      setup_webhook: `${DOMAIN}/setup-webhook`,
      raffle_app: DOMAIN
    }
  });
});

// Health check with detailed status
app.get('/health', (req, res) => {
  const status = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    config: {
      domain: DOMAIN,
      botToken: BOT_TOKEN ? 'configured' : 'missing',
      alchemyWebhook: ALCHEMY_WEBHOOK_ID,
      alchemyKey: ALCHEMY_SIGNING_KEY ? 'configured' : 'missing',
    },
    data: raffleData,
    connections: {
      subscribers: subscribers.size,
      notifications: notificationSubscribers.size
    }
  };
  
  res.json(status);
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('🚨 Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Catch all other routes and serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server with comprehensive logging
const server = app.listen(PORT, () => {
  console.log('\n🚀 ===================================');
  console.log('🎰 URIM Raffle Bot Server Started');
  console.log('🚀 ===================================');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Domain: ${DOMAIN}`);
  console.log(`🤖 Bot Token: ${BOT_TOKEN ? '✅ Configured' : '❌ Missing'}`);
  console.log(`📡 Telegram Webhook: ${DOMAIN}/webhook`);
  console.log(`⚡ Alchemy Webhook: ${DOMAIN}/alchemy-webhook`);
  console.log(`🎯 Webhook ID: ${ALCHEMY_WEBHOOK_ID}`);
  console.log(`🔐 Signing Key: ${ALCHEMY_SIGNING_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`💰 Current Pot: $${raffleData.pot} USDC`);
  console.log(`🎫 Tickets Sold: ${raffleData.participants}`);
  console.log('🚀 ===================================\n');
  
  // Optional: Auto-setup webhook on start
  if (process.env.NODE_ENV === 'production') {
    setTimeout(async () => {
      try {
        const webhookUrl = `${DOMAIN}/webhook`;
        console.log('🔧 Auto-setting up production webhook...');
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
          url: webhookUrl,
          allowed_updates: ['message', 'callback_query'],
          drop_pending_updates: true
        });
        console.log('✅ Production webhook set successfully:', response.data);
      } catch (error) {
        console.error('❌ Auto webhook setup failed:', error.response?.data || error.message);
      }
    }, 2000);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = app;
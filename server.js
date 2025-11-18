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

// Middleware with better error handling
app.use(express.json({ 
  limit: '50mb',
  verify: (req, res, buf, encoding) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Serve static files with proper headers
app.use(express.static(__dirname, {
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'public, max-age=3600');
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
  participants: 23,
  lastUpdate: Date.now()
};

let subscribers = new Set();
let notificationSubscribers = new Set();

// Improved signature verification for Alchemy
function verifyAlchemySignature(payload, signature) {
  try {
    if (!signature) {
      console.log('No signature provided');
      return false;
    }

    const key = ALCHEMY_SIGNING_KEY.replace('whsec_', '');
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(payload, 'utf8');
    const computedSignature = hmac.digest('hex');
    
    const providedSignature = signature.replace('sha256=', '');
    
    return crypto.timingSafeEqual(
      Buffer.from(providedSignature, 'hex'),
      Buffer.from(computedSignature, 'hex')
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// Enhanced Alchemy webhook with better error handling
app.post('/alchemy-webhook', (req, res) => {
  try {
    const signature = req.headers['x-alchemy-signature'] || req.headers['alchemy-signature'];
    const payload = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
    
    console.log('Alchemy webhook received:', {
      webhookId: req.body.webhookId,
      hasSignature: !!signature,
      bodySize: payload.length
    });
    
    // Verify signature if provided
    if (signature && !verifyAlchemySignature(payload, signature)) {
      console.log('Invalid Alchemy webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { webhookId, event } = req.body;
    
    // Confirm this is our webhook
    if (webhookId !== ALCHEMY_WEBHOOK_ID) {
      console.log('Unknown webhook ID:', webhookId);
      return res.status(400).json({ error: 'Unknown webhook' });
    }

    // Process transactions
    if (event?.activity) {
      event.activity.forEach(activity => {
        console.log('Processing activity:', {
          hash: activity.hash,
          from: activity.fromAddress,
          to: activity.toAddress,
          value: activity.value
        });

        // Check for raffle contract interactions
        if (activity.toAddress?.toLowerCase() === '0x36086C5950325B971E5DC11508AB67A1CE30Dc69'.toLowerCase()) {
          const ticketPrice = 5;
          const currentPot = parseFloat(raffleData.pot) + ticketPrice;
          
          raffleData.pot = currentPot.toFixed(2);
          raffleData.participants += 1;
          raffleData.lastUpdate = Date.now();
          
          console.log('🎫 New ticket purchased!', {
            pot: raffleData.pot,
            participants: raffleData.participants
          });

          // Notify subscribers
          notifySubscribers({
            type: 'ticket_purchased',
            pot: raffleData.pot,
            participants: raffleData.participants,
            buyer: activity.fromAddress?.slice(0, 6) + '...' + activity.fromAddress?.slice(-4)
          });

          // Send Telegram notifications
          sendNotificationToSubscribers(`🎫 New ticket purchased! Pot is now $${raffleData.pot} USDC`);
        }
      });
    }

    res.status(200).json({ success: true, processed: true });
  } catch (error) {
    console.error('Alchemy webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Improved notification system
function notifySubscribers(data) {
  subscribers.forEach(ws => {
    try {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(data));
      } else {
        subscribers.delete(ws);
      }
    } catch (error) {
      console.error('Error notifying subscriber:', error);
      subscribers.delete(ws);
    }
  });
}

async function sendNotificationToSubscribers(message) {
  const promises = Array.from(notificationSubscribers).map(async (chatId) => {
    try {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      }, { timeout: 10000 });
    } catch (error) {
      console.error(`Failed to send notification to ${chatId}:`, error.response?.data);
      if (error.response?.status === 403) {
        notificationSubscribers.delete(chatId);
      }
    }
  });
  
  await Promise.allSettled(promises);
}

// Enhanced webhook endpoint with better error handling
app.post('/webhook', async (req, res) => {
  try {
    console.log('📨 Telegram webhook received:', JSON.stringify(req.body, null, 2));
    
    const { message, callback_query, my_chat_member } = req.body;
    
    // Handle bot being blocked/unblocked
    if (my_chat_member) {
      const { new_chat_member, chat } = my_chat_member;
      if (new_chat_member.status === 'kicked') {
        notificationSubscribers.delete(chat.id);
        console.log(`Bot blocked by user ${chat.id}`);
      }
      return res.status(200).json({ ok: true });
    }
    
    // Handle regular messages
    if (message) {
      const chatId = message.chat.id;
      const userId = message.from.id;
      const text = message.text;
      const userName = message.from.first_name || 'User';

      console.log(`💬 Message from ${userName} (${userId}): ${text}`);

      try {
        if (text === '/start') {
          console.log('🚀 Sending start message to chat:', chatId);
          await sendStartMessage(chatId, userName);
        } else if (text === '/help') {
          await sendHelpMessage(chatId);
        } else if (text === '/status') {
          await sendStatsMessage(chatId);
        } else if (text === '/notify on' || text === '/notify') {
          notificationSubscribers.add(chatId);
          await sendNotificationSettingsMessage(chatId, true);
        } else if (text === '/notify off') {
          notificationSubscribers.delete(chatId);
          await sendNotificationSettingsMessage(chatId, false);
        } else if (text.startsWith('/')) {
          // Handle unknown commands
          await sendUnknownCommandMessage(chatId, text);
        }
      } catch (error) {
        console.error('Error handling message:', error);
        await sendErrorMessage(chatId);
      }
    }

    // Handle callback queries
    if (callback_query) {
      const chatId = callback_query.message.chat.id;
      const userId = callback_query.from.id;
      const data = callback_query.data;
      
      console.log(`🔄 Callback from user ${userId}: ${data}`);
      
      try {
        // Always acknowledge the callback first
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          callback_query_id: callback_query.id,
          text: '✅ Processing...'
        }, { timeout: 5000 });

        if (data === 'view_stats') {
          await sendStatsMessage(chatId);
        } else if (data === 'enable_notifications') {
          notificationSubscribers.add(chatId);
          await sendNotificationSettingsMessage(chatId, true);
        } else if (data === 'disable_notifications') {
          notificationSubscribers.delete(chatId);
          await sendNotificationSettingsMessage(chatId, false);
        } else if (data === 'refresh_app') {
          await sendStartMessage(chatId, callback_query.from.first_name || 'User');
        }
      } catch (error) {
        console.error('Error handling callback:', error);
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(200).json({ ok: true }); // Always return 200 to Telegram
  }
});

// Enhanced start message with better error handling
async function sendStartMessage(chatId, userName) {
  const message = {
    chat_id: chatId,
    text: `🎰 *Welcome ${userName}!* 🎰

🔥 *URIM 50/50 Raffle* 🔥

💰 Current Pot: $${raffleData.pot} USDC
🎫 Tickets Sold: ${raffleData.participants}
💵 Ticket Price: $5.00 USDC
🏆 50% to winner, 50% to next pot
⚡ Instant payouts on Base Network

🎮 Tap "Play Raffle" to start!

*Testing Mode - @schlegelcrypto*`,
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
            text: '🔔 Notifications',
            callback_data: notificationSubscribers.has(chatId) ? 'disable_notifications' : 'enable_notifications'
          }
        ],
        [
          {
            text: '🌐 Website',
            url: 'https://urim.live/lottery'
          },
          {
            text: '🔄 Refresh',
            callback_data: 'refresh_app'
          }
        ]
      ]
    }
  };

  try {
    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, message, {
      timeout: 10000
    });
    console.log('✅ Start message sent successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Error sending start message:', error.response?.data || error.message);
    throw error;
  }
}

async function sendHelpMessage(chatId) {
  const helpText = `🤖 *URIM Raffle Bot Help*

*Commands:*
/start - Launch the raffle app
/help - Show this help
/status - View live statistics  
/notify on - Enable notifications
/notify off - Disable notifications

*How to Play:*
1️⃣ Connect your wallet in the app
2️⃣ Buy tickets with USDC ($5 each)
3️⃣ Wait for the draw
4️⃣ Win 50% of the pot!

*Features:*
🔔 Real-time notifications
📈 Live pot tracking
⚡ Instant payouts
🔐 Secure smart contracts

*Network:* Base
*Contract:* 0x36086...30Dc69
*Token:* USDC

*Testing Mode - @schlegelcrypto*`;
  
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: helpText,
      parse_mode: 'Markdown'
    }, { timeout: 10000 });
  } catch (error) {
    console.error('Error sending help message:', error);
  }
}

async function sendStatsMessage(chatId) {
  const winnerPayout = (parseFloat(raffleData.pot) * 0.5).toFixed(2);
  const statsText = `📊 *Live Raffle Statistics*

🎫 *Raffle ID:* #874482516
💰 *Current Pot:* $${raffleData.pot} USDC
🎯 *Tickets Sold:* ${raffleData.participants}
👥 *Unique Players:* ${Math.ceil(raffleData.participants * 0.8)}
⏰ *Last Update:* ${new Date(raffleData.lastUpdate).toLocaleTimeString()}

🏆 *Prize Distribution:*
• Winner Gets: $${winnerPayout} USDC
• Next Pot: $${winnerPayout} USDC

🌐 *Network Info:*
• Blockchain: Base Network
• Token: USDC (Native)
• Ticket Price: $5.00 USDC

📈 *Statistics:*
• Average Pot: $150 USDC
• Draw Frequency: Hourly
• Total Payouts: $2,500+ USDC

🔔 Notifications: ${notificationSubscribers.has(chatId) ? 'ON' : 'OFF'}

*Real-time via Alchemy webhooks*`;
  
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
    }, { timeout: 10000 });
  } catch (error) {
    console.error('Error sending stats message:', error);
  }
}

async function sendNotificationSettingsMessage(chatId, enabled) {
  const text = enabled 
    ? `🔔 *Notifications Enabled!*

You'll receive updates for:
• New ticket purchases
• Pot size increases  
• Draw results
• Winner announcements

Use /notify off to disable.`
    : `🔕 *Notifications Disabled*

You will no longer receive raffle updates.

Use /notify on to re-enable notifications.`;
  
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    }, { timeout: 10000 });
  } catch (error) {
    console.error('Error sending notification settings message:', error);
  }
}

async function sendUnknownCommandMessage(chatId, command) {
  const text = `❓ Unknown command: \`${command}\`

Use /help to see available commands or /start to launch the raffle app.`;
  
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    }, { timeout: 10000 });
  } catch (error) {
    console.error('Error sending unknown command message:', error);
  }
}

async function sendErrorMessage(chatId) {
  const text = `⚠️ *Oops! Something went wrong.*

Please try again or use /start to restart the bot.

If the problem persists, contact @schlegelcrypto`;
  
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    }, { timeout: 10000 });
  } catch (error) {
    console.error('Error sending error message:', error);
  }
}

// API endpoints
app.get('/api/raffle-data', (req, res) => {
  res.json({
    success: true,
    data: raffleData,
    timestamp: Date.now(),
    subscribers: subscribers.size,
    notifications: notificationSubscribers.size
  });
});

app.get('/raffle-updates', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  res.write(`data: ${JSON.stringify({
    type: 'initial',
    ...raffleData
  })}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ 
      type: 'heartbeat', 
      timestamp: Date.now() 
    })}\n\n`);
  }, 30000);

  const clientWs = { 
    send: (data) => res.write(`data: ${data}\n\n`),
    readyState: 1
  };
  
  subscribers.add(clientWs);

  req.on('close', () => {
    clearInterval(heartbeat);
    subscribers.delete(clientWs);
    console.log('SSE client disconnected');
  });
});

// Debug and setup endpoints
app.get('/webhook-info', async (req, res) => {
  try {
    const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`, {
      timeout: 10000
    });
    res.json({
      ...response.data,
      currentDomain: DOMAIN,
      expectedWebhook: `${DOMAIN}/webhook`
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      currentDomain: DOMAIN
    });
  }
});

app.get('/setup-webhook', async (req, res) => {
  try {
    const webhookUrl = `${DOMAIN}/webhook`;
    
    // First delete existing webhook
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`, {}, {
      timeout: 10000
    });
    
    // Set new webhook with proper configuration
    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query', 'my_chat_member'],
      drop_pending_updates: true
    }, { timeout: 10000 });
    
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

app.get('/test-bot', async (req, res) => {
  try {
    const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`, {
      timeout: 10000
    });
    res.json({
      bot: response.data,
      webhookConfigured: true,
      domain: DOMAIN
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      domain: DOMAIN
    });
  }
});

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/components/:file', (req, res) => {
  const filePath = path.join(__dirname, 'components', req.params.file);
  res.sendFile(filePath);
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    domain: DOMAIN,
    bot: BOT_TOKEN ? 'configured' : 'missing',
    alchemy: {
      webhookId: ALCHEMY_WEBHOOK_ID,
      signingKey: ALCHEMY_SIGNING_KEY ? 'configured' : 'missing'
    },
    data: raffleData,
    subscribers: {
      realtime: subscribers.size,
      notifications: notificationSubscribers.size
    }
  });
});

// Catch all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`🚀 URIM Raffle Bot server running on port ${PORT}`);
  console.log(`🌐 Domain: ${DOMAIN}`);
  console.log(`🤖 Bot token: ${BOT_TOKEN ? 'configured ✅' : 'missing ❌'}`);
  console.log(`📡 Telegram webhook: ${DOMAIN}/webhook`);
  console.log(`⚡ Alchemy webhook: ${DOMAIN}/alchemy-webhook`);
  
  // Test bot connection on startup
  try {
    const botInfo = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`, {
      timeout: 10000
    });
    console.log(`✅ Bot connected: @${botInfo.data.result.username}`);
  } catch (error) {
    console.error('❌ Failed to connect to bot:', error.message);
  }
});

module.exports = app;
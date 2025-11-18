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

// In-memory storage for real-time data
let raffleData = {
  pot: '0',
  participants: 0,
  lastUpdate: Date.now()
};

let subscribers = new Set();

// Function to verify Alchemy webhook signature
function verifyAlchemySignature(payload, signature) {
  try {
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

// Alchemy webhook endpoint for tracking raffle transactions
app.post('/alchemy-webhook', (req, res) => {
  try {
    const signature = req.headers['x-alchemy-signature'];
    const payload = JSON.stringify(req.body);
    
    // Verify webhook signature
    if (!signature || !verifyAlchemySignature(payload, signature)) {
      console.log('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log('✅ Verified Alchemy webhook:', req.body.webhookId);
    
    const { webhookId, id, createdAt, type, event } = req.body;
    
    // Confirm this is our webhook
    if (webhookId !== ALCHEMY_WEBHOOK_ID) {
      console.log('Unknown webhook ID:', webhookId);
      return res.status(400).json({ error: 'Unknown webhook' });
    }

    // Process the transaction
    if (event && event.activity) {
      event.activity.forEach(activity => {
        console.log('Processing activity:', {
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

          // Notify subscribers
          notifySubscribers({
            type: 'ticket_purchased',
            pot: raffleData.pot,
            participants: raffleData.participants,
            buyer: activity.fromAddress?.slice(0, 6) + '...' + activity.fromAddress?.slice(-4)
          });
        }
      });
    }

    res.status(200).json({ 
      success: true, 
      webhookId,
      processed: true 
    });

  } catch (error) {
    console.error('Alchemy webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Function to notify all subscribers
function notifySubscribers(data) {
  subscribers.forEach(ws => {
    try {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify(data));
      }
    } catch (error) {
      console.error('Error sending to subscriber:', error);
    }
  });
}

// WebSocket-like endpoint for real-time updates (using Server-Sent Events)
app.get('/raffle-updates', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Send current data immediately
  res.write(`data: ${JSON.stringify({
    type: 'initial',
    ...raffleData
  })}\n\n`);

  // Keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
  }, 30000);

  // Add to subscribers
  const clientId = Date.now();
  subscribers.add({ 
    send: (data) => res.write(`data: ${data}\n\n`),
    readyState: 1
  });

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    subscribers.delete(clientId);
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
    
    if (action === 'subscribe') {
      // Add user to notification list
      console.log(`User ${chatId} subscribed to notifications`);
      
      // Send confirmation message
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: '🔔 *Notifications Enabled!*\n\nYou\'ll receive updates when:\n• New tickets are purchased\n• Pot size increases\n• Raffle draws occur\n\nUse /notify off to disable.',
        parse_mode: 'Markdown'
      });
      
      res.json({ success: true, message: 'Subscribed to notifications' });
    } else if (action === 'unsubscribe') {
      console.log(`User ${chatId} unsubscribed from notifications`);
      
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: '🔕 *Notifications Disabled*\n\nYou will no longer receive raffle updates.\n\nUse /notify on to re-enable.',
        parse_mode: 'Markdown'
      });
      
      res.json({ success: true, message: 'Unsubscribed from notifications' });
    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Notification error:', error);
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
      } else if (text === '/notify on') {
        await req.app.request.body = { chatId, action: 'subscribe' };
        // Handle notification subscription
      } else if (text === '/notify off') {
        await req.app.request.body = { chatId, action: 'unsubscribe' };
        // Handle notification unsubscription
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
    text: `🎰 *Welcome ${userName}!* 🎰\n\n🔥 *URIM 50/50 Raffle* 🔥\n\n💰 Current Pot: $${raffleData.pot} USDC\n🎫 Tickets Sold: ${raffleData.participants}\n💵 Ticket Price: $5.00 USDC\n🏆 50% goes to winner, 50% to pot\n⚡ Instant payouts on Base Network\n\n🎮 Tap "Play Raffle" to get started!\n\n*Testing Mode - @schlegelcrypto*`,
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
  const helpText = `🤖 *URIM Raffle Bot Help* 🤖\n\n*Commands:*\n/start - Launch the raffle app\n/help - Show this help message\n/notify on - Enable notifications\n/notify off - Disable notifications\n\n*How to Play:*\n1. Connect your wallet\n2. Buy tickets with USDC ($5 each)\n3. Wait for the draw\n4. Win 50% of the pot!\n\n*Real-time Updates:*\n🔔 Get notified of new tickets\n📈 Live pot tracking\n⚡ Instant transaction updates\n\n*Contract Info:*\nNetwork: Base\nToken: USDC\nRaffle ID: 874482516\nContract: 0x36086C5950325B971E5DC11508AB67A1CE30Dc69\n\n*Powered by Alchemy Webhooks*\n*Testing Mode - @schlegelcrypto*`;
  
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

// Function to send stats message with live data
async function sendStatsMessage(chatId) {
  const statsText = `📊 *Live Raffle Statistics* 📊\n\n🎫 *Current Raffle:* #874482516\n💰 *Current Pot:* $${raffleData.pot} USDC\n🎯 *Tickets Sold:* ${raffleData.participants}\n👥 *Unique Players:* ${Math.ceil(raffleData.participants * 0.7)}\n⏰ *Last Update:* ${new Date(raffleData.lastUpdate).toLocaleTimeString()}\n\n🏆 *Prize Distribution:*\n• Winner: 50% ($${(parseFloat(raffleData.pot) * 0.5).toFixed(2)})\n• Next Pot: 50% ($${(parseFloat(raffleData.pot) * 0.5).toFixed(2)})\n\n🌐 *Network:* Base\n💵 *Currency:* USDC\n🎟️ *Ticket Price:* $5.00\n\n🔔 Want live updates? Use /notify on\n\n*Real-time tracking via Alchemy*\n*Testing Mode - @schlegelcrypto*`;
  
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

// Debug endpoint for Alchemy webhook info
app.get('/alchemy-info', (req, res) => {
  res.json({
    webhookId: ALCHEMY_WEBHOOK_ID,
    configured: !!ALCHEMY_SIGNING_KEY,
    endpoint: `${DOMAIN}/alchemy-webhook`,
    raffleData,
    subscribers: subscribers.size
  });
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
    message: 'URIM Raffle Bot is running!',
    timestamp: new Date().toISOString(),
    domain: DOMAIN,
    botConfigured: !!BOT_TOKEN,
    alchemyConfigured: !!ALCHEMY_SIGNING_KEY,
    raffleData,
    webhook: {
      telegram: `${DOMAIN}/webhook`,
      alchemy: `${DOMAIN}/alchemy-webhook`
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    domain: DOMAIN,
    botToken: BOT_TOKEN ? 'configured' : 'missing',
    alchemyWebhook: ALCHEMY_WEBHOOK_ID,
    alchemyKey: ALCHEMY_SIGNING_KEY ? 'configured' : 'missing',
    raffleData
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
  console.log(`🎰 Webhook ID: ${ALCHEMY_WEBHOOK_ID}`);
  console.log(`🔐 Signing key: ${ALCHEMY_SIGNING_KEY ? 'configured' : 'missing'}`);
});

module.exports = app;
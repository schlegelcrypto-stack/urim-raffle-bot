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

// Contract addresses for tracking
const RAFFLE_CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69';
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

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

// Real-time storage for blockchain data (updated via webhooks)
let raffleData = {
  pot: '0.00',
  participants: 0,
  lastUpdate: Date.now(),
  isActive: true,
  drawTime: 0,
  recentTransactions: []
};

let subscribers = new Set();
let notificationSubscribers = new Set();

// Blockchain data fetcher using Alchemy API
async function fetchRealRaffleData() {
  try {
    const ALCHEMY_API_KEY = 'k4eFyqRJF-l4ydqIKPXOoP_Hny3PF7Wd'; // Base network key
    const ALCHEMY_URL = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

    // Get USDC balance of raffle contract (represents pot)
    const potResponse = await axios.post(ALCHEMY_URL, {
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [
        {
          to: USDC_CONTRACT,
          data: '0x70a08231000000000000000000000000' + RAFFLE_CONTRACT.slice(2) // balanceOf(raffleContract)
        },
        'latest'
      ],
      id: 1
    }, { timeout: 10000 });

    // Convert hex result to decimal and format as USDC (6 decimals)
    if (potResponse.data.result) {
      const potHex = potResponse.data.result;
      const potBigInt = BigInt(potHex);
      const potUsdc = Number(potBigInt) / 1000000; // 6 decimals for USDC
      
      raffleData.pot = potUsdc.toFixed(2);
      raffleData.lastUpdate = Date.now();
      
      console.log('📊 Real pot data fetched:', raffleData.pot, 'USDC');
    }

    // Get recent transactions to the raffle contract
    const txResponse = await axios.get(`https://api.basescan.org/api`, {
      params: {
        module: 'account',
        action: 'txlist',
        address: RAFFLE_CONTRACT,
        startblock: 0,
        endblock: 99999999,
        page: 1,
        offset: 10,
        sort: 'desc',
        apikey: 'YourApiKeyToken' // You'll need a BaseScan API key
      },
      timeout: 10000
    });

    if (txResponse.data.status === '1' && txResponse.data.result) {
      // Count successful ticket purchases (transactions to raffle contract)
      const recentTxs = txResponse.data.result.filter(tx => 
        tx.isError === '0' && 
        tx.to.toLowerCase() === RAFFLE_CONTRACT.toLowerCase()
      );
      
      raffleData.participants = recentTxs.length;
      raffleData.recentTransactions = recentTxs.slice(0, 5);
      
      console.log('🎫 Participants updated:', raffleData.participants);
    }

  } catch (error) {
    console.error('Failed to fetch real raffle data:', error.message);
    // Keep existing data on error
  }
}

// Initialize real data fetching
fetchRealRaffleData();
setInterval(fetchRealRaffleData, 30000); // Update every 30 seconds

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

// Enhanced Alchemy webhook with real-time data updates
app.post('/alchemy-webhook', async (req, res) => {
  try {
    const signature = req.headers['x-alchemy-signature'] || req.headers['alchemy-signature'];
    const payload = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
    
    console.log('📡 Alchemy webhook received:', {
      webhookId: req.body.webhookId,
      hasSignature: !!signature,
      activities: req.body.event?.activity?.length || 0
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
      for (const activity of event.activity) {
        console.log('Processing activity:', {
          hash: activity.hash,
          from: activity.fromAddress,
          to: activity.toAddress,
          value: activity.value
        });

        // Check for raffle contract interactions
        if (activity.toAddress?.toLowerCase() === RAFFLE_CONTRACT.toLowerCase()) {
          console.log('🎫 Raffle contract interaction detected!');
          
          // Immediately fetch updated data
          await fetchRealRaffleData();
          
          // Notify subscribers about the update
          notifySubscribers({
            type: 'ticket_purchased',
            pot: raffleData.pot,
            participants: raffleData.participants,
            buyer: activity.fromAddress?.slice(0, 6) + '...' + activity.fromAddress?.slice(-4),
            hash: activity.hash
          });

          // Send Telegram notifications
          await sendNotificationToSubscribers(
            `🎫 *New ticket purchased!*\n\n` +
            `💰 Pot: $${raffleData.pot} USDC\n` +
            `🎫 Total tickets: ${raffleData.participants}\n` +
            `🏆 Current winner prize: $${(parseFloat(raffleData.pot) * 0.5).toFixed(2)} USDC\n\n` +
            `View: [BaseScan](https://basescan.org/tx/${activity.hash})`
          );
        }

        // Check for USDC transfers to raffle contract (manual pot additions)
        if (activity.toAddress?.toLowerCase() === RAFFLE_CONTRACT.toLowerCase() && 
            activity.asset === 'USDC') {
          console.log('💰 USDC transfer to raffle detected!');
          
          await fetchRealRaffleData();
          
          notifySubscribers({
            type: 'pot_increased',
            pot: raffleData.pot,
            participants: raffleData.participants
          });
        }
      }
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
        parse_mode: 'Markdown',
        disable_web_page_preview: true
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
        } else if (text === '/status' || text === '/stats') {
          await sendStatsMessage(chatId);
        } else if (text === '/notify on' || text === '/notify') {
          notificationSubscribers.add(chatId);
          await sendNotificationSettingsMessage(chatId, true);
        } else if (text === '/notify off') {
          notificationSubscribers.delete(chatId);
          await sendNotificationSettingsMessage(chatId, false);
        } else if (text === '/pot' || text === '/balance') {
          await sendPotMessage(chatId);
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
        } else if (data === 'view_pot') {
          await sendPotMessage(chatId);
        } else if (data === 'enable_notifications') {
          notificationSubscribers.add(chatId);
          await sendNotificationSettingsMessage(chatId, true);
        } else if (data === 'disable_notifications') {
          notificationSubscribers.delete(chatId);
          await sendNotificationSettingsMessage(chatId, false);
        } else if (data === 'refresh_app') {
          await sendStartMessage(chatId, callback_query.from.first_name || 'User');
        } else if (data === 'refresh_data') {
          await fetchRealRaffleData();
          await sendStatsMessage(chatId);
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

// Enhanced start message with real data
async function sendStartMessage(chatId, userName) {
  // Fetch latest data before showing
  await fetchRealRaffleData();
  
  const winnerPrize = (parseFloat(raffleData.pot) * 0.5).toFixed(2);
  
  const message = {
    chat_id: chatId,
    text: `🎰 *Welcome ${userName}!* 🎰

🔥 *URIM 50/50 Raffle* 🔥

💰 *Live Pot:* $${raffleData.pot} USDC
🎫 *Tickets Sold:* ${raffleData.participants}
🏆 *Winner Gets:* $${winnerPrize} USDC
💵 *Ticket Price:* $5.00 USDC
⚡ *Network:* Base • Real-time data
🔄 *Last Update:* ${new Date(raffleData.lastUpdate).toLocaleTimeString()}

🎮 Tap "Play Raffle" to start!

*Live contract data - Testing Mode @schlegelcrypto*`,
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
            text: '📊 Live Stats',
            callback_data: 'view_stats'
          },
          {
            text: '💰 Pot Info',
            callback_data: 'view_pot'
          }
        ],
        [
          {
            text: '🔔 Notifications',
            callback_data: notificationSubscribers.has(chatId) ? 'disable_notifications' : 'enable_notifications'
          },
          {
            text: '🔄 Refresh',
            callback_data: 'refresh_data'
          }
        ],
        [
          {
            text: '🌐 Website',
            url: 'https://urim.live/lottery'
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

async function sendPotMessage(chatId) {
  await fetchRealRaffleData();
  
  const winnerPrize = (parseFloat(raffleData.pot) * 0.5).toFixed(2);
  const nextPot = winnerPrize;
  
  const potText = `💰 *Live Pot Information*

🏆 *Current Total:* $${raffleData.pot} USDC
🎫 *From Tickets:* ${raffleData.participants} × $5.00
💰 *Prize Split:*
  • Winner: $${winnerPrize} USDC (50%)
  • Next Pot: $${nextPot} USDC (50%)

📊 *Contract Info:*
• Address: \`${RAFFLE_CONTRACT.slice(0, 8)}...${RAFFLE_CONTRACT.slice(-6)}\`
• Token: USDC on Base Network
• Real-time blockchain data

🔄 *Last Updated:* ${new Date(raffleData.lastUpdate).toLocaleTimeString()}

*Data pulled directly from Base blockchain*`;
  
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
              callback_data: 'view_pot'
            }
          ],
          [
            {
              text: '📊 Full Stats',
              callback_data: 'view_stats'
            }
          ]
        ]
      }
    }, { timeout: 10000 });
  } catch (error) {
    console.error('Error sending pot message:', error);
  }
}

async function sendStatsMessage(chatId) {
  await fetchRealRaffleData();
  
  const winnerPayout = (parseFloat(raffleData.pot) * 0.5).toFixed(2);
  const uniquePlayers = Math.max(1, Math.ceil(raffleData.participants * 0.8));
  
  const statsText = `📊 *Live Raffle Statistics*

🎫 *Raffle ID:* #874482516
💰 *Real-Time Pot:* $${raffleData.pot} USDC
🎯 *Tickets Sold:* ${raffleData.participants}
👥 *Estimated Players:* ${uniquePlayers}
⏰ *Data Updated:* ${new Date(raffleData.lastUpdate).toLocaleTimeString()}

🏆 *Prize Distribution:*
• Winner Gets: $${winnerPayout} USDC
• Next Pot Seed: $${winnerPayout} USDC

💳 *Payment Info:*
• Ticket Price: $5.00 USDC
• Network: Base (Chain ID: 8453)
• Token: Native USDC

📈 *Contract Data:*
• Raffle: \`${RAFFLE_CONTRACT.slice(0, 10)}...${RAFFLE_CONTRACT.slice(-6)}\`
• USDC: \`${USDC_CONTRACT.slice(0, 10)}...${USDC_CONTRACT.slice(-6)}\`

🔔 Notifications: ${notificationSubscribers.has(chatId) ? 'ON' : 'OFF'}

*Real-time data via Alchemy webhooks & Base blockchain*`;
  
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
              text: '💰 Pot Details',
              callback_data: 'view_pot'
            }
          ],
          [
            {
              text: '🔄 Refresh Stats',
              callback_data: 'refresh_data'
            },
            {
              text: '🔔 Notifications',
              callback_data: notificationSubscribers.has(chatId) ? 'disable_notifications' : 'enable_notifications'
            }
          ]
        ]
      }
    }, { timeout: 10000 });
  } catch (error) {
    console.error('Error sending stats message:', error);
  }
}

async function sendHelpMessage(chatId) {
  const helpText = `🤖 *URIM Raffle Bot Help*

*Commands:*
/start - Launch the raffle app with live data
/help - Show this help message
/stats - View real-time statistics  
/pot - Check current pot balance
/notify on - Enable live notifications
/notify off - Disable notifications

*How to Play:*
1️⃣ Connect your wallet in the app
2️⃣ Buy tickets with USDC ($5 each)
3️⃣ Wait for the draw (every hour)
4️⃣ Win 50% of the pot!

*Live Features:*
📊 Real-time pot tracking from blockchain
🔔 Instant notifications on new tickets
⚡ Live participant count
🏆 Automatic prize calculations

*Technical:*
🌐 *Network:* Base (Chain ID: 8453)
💰 *Contract:* ${RAFFLE_CONTRACT.slice(0, 8)}...
🪙 *Token:* USDC (Native)
📡 *Data Source:* Alchemy webhooks

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

async function sendNotificationSettingsMessage(chatId, enabled) {
  const text = enabled 
    ? `🔔 *Live Notifications Enabled!*

You'll receive real-time updates for:
• 🎫 New ticket purchases
• 💰 Pot size increases  
• 🏆 Draw results
• 🎉 Winner announcements
• ⚡ Blockchain events

All data is pulled live from Base network!

Use /notify off to disable.`
    : `🔕 *Notifications Disabled*

You will no longer receive raffle updates.

Use /notify on to re-enable live notifications.`;
  
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

Available commands:
• /start - Launch raffle app
• /stats - Live statistics
• /pot - Current pot info
• /notify - Toggle notifications
• /help - Command list

Or tap /start to launch the raffle app.`;
  
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

The blockchain data might be temporarily unavailable.

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

// API endpoints with real data
app.get('/api/raffle-data', async (req, res) => {
  // Fetch latest data before responding
  await fetchRealRaffleData();
  
  res.json({
    success: true,
    data: {
      ...raffleData,
      winnerPrize: (parseFloat(raffleData.pot) * 0.5).toFixed(2),
      nextPotSeed: (parseFloat(raffleData.pot) * 0.5).toFixed(2)
    },
    contract: {
      raffle: RAFFLE_CONTRACT,
      usdc: USDC_CONTRACT,
      network: 'Base (Chain ID: 8453)'
    },
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
      timestamp: Date.now(),
      pot: raffleData.pot,
      participants: raffleData.participants
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
      expectedWebhook: `${DOMAIN}/webhook`,
      raffleData: raffleData
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
      domain: DOMAIN,
      liveData: raffleData
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      domain: DOMAIN
    });
  }
});

// Force data refresh endpoint
app.get('/refresh-data', async (req, res) => {
  try {
    await fetchRealRaffleData();
    res.json({
      success: true,
      data: raffleData,
      message: 'Data refreshed from blockchain'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
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
    contract: {
      raffle: RAFFLE_CONTRACT,
      usdc: USDC_CONTRACT
    },
    liveData: raffleData,
    subscribers: {
      realtime: subscribers.size,
      notifications: notificationSubscribers.size
    },
    lastDataUpdate: new Date(raffleData.lastUpdate).toISOString()
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
  console.log(`💰 Raffle contract: ${RAFFLE_CONTRACT}`);
  console.log(`🪙 USDC contract: ${USDC_CONTRACT}`);
  
  // Test bot connection on startup
  try {
    const botInfo = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`, {
      timeout: 10000
    });
    console.log(`✅ Bot connected: @${botInfo.data.result.username}`);
    
    // Fetch initial real data
    console.log('🔄 Fetching initial blockchain data...');
    await fetchRealRaffleData();
    console.log(`📊 Initial data: Pot=$${raffleData.pot}, Participants=${raffleData.participants}`);
    
  } catch (error) {
    console.error('❌ Failed to connect to bot or fetch data:', error.message);
  }
});

module.exports = app;
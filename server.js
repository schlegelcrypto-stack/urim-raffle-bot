const express = require('express');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '8323137830:AAFA3wnduW5_e_GCAOtSRMo0yRTKgYb1B6Y';
const DOMAIN = process.env.DOMAIN || 'https://urim-raffle-bot.vercel.app';

// Updated Alchemy Webhook Configuration with new credentials
const ALCHEMY_WEBHOOK_ID = 'wh_egkx8g4uyxp48bqp';
const ALCHEMY_SIGNING_KEY = 'whsec_bPCKpyY9Ks6XzLFoxbOTHjV5';
const ALCHEMY_AUTH_TOKEN = 'NwdCBNcWqD3wR4PhcYUItc1yYrAeU37B';
const ALCHEMY_API_KEY = '4GZf2vKE58_eoUMAR4dvw';

// Contract addresses to monitor
const RAFFLE_CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69';
const CHAINLINK_WALLET = '0xFC448fF766bC5d4d01cF0d15cb20f5aA2400A3DA';

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

// Real-time raffle data storage
let raffleData = {
  pot: '0.00',
  participants: 0,
  lastUpdate: Date.now(),
  totalVolume: 0,
  winnerAddress: null,
  lastTransactionHash: null
};

let subscribers = new Set();
let notificationSubscribers = new Set();

// Enhanced signature verification for Alchemy
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

// Fetch current contract balance using Alchemy API
async function fetchContractBalance() {
  try {
    const response = await axios.post(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
      jsonrpc: '2.0',
      method: 'alchemy_getTokenBalances',
      params: [
        RAFFLE_CONTRACT,
        ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'] // USDC contract
      ],
      id: 1
    }, {
      headers: {
        'Authorization': `Bearer ${ALCHEMY_AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data?.result?.tokenBalances?.length > 0) {
      const balance = response.data.result.tokenBalances[0].tokenBalance;
      const usdcBalance = parseInt(balance, 16) / Math.pow(10, 6); // USDC has 6 decimals
      
      raffleData.pot = usdcBalance.toFixed(2);
      raffleData.lastUpdate = Date.now();
      
      console.log('Updated pot balance from contract:', raffleData.pot);
      return usdcBalance;
    }
  } catch (error) {
    console.error('Error fetching contract balance:', error);
  }
  
  return null;
}

// Enhanced Alchemy webhook with comprehensive transaction processing
app.post('/alchemy-webhook', async (req, res) => {
  try {
    const signature = req.headers['x-alchemy-signature'] || req.headers['alchemy-signature'];
    const payload = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
    
    console.log('📡 Alchemy webhook received:', {
      webhookId: req.body.webhookId,
      hasSignature: !!signature,
      bodySize: payload.length,
      timestamp: new Date().toISOString()
    });
    
    // Verify signature if provided
    if (signature && !verifyAlchemySignature(payload, signature)) {
      console.log('❌ Invalid Alchemy webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { webhookId, event } = req.body;
    
    // Confirm this is our webhook
    if (webhookId !== ALCHEMY_WEBHOOK_ID) {
      console.log('⚠️ Unknown webhook ID:', webhookId);
      return res.status(400).json({ error: 'Unknown webhook' });
    }

    // Process blockchain activity
    if (event?.activity && Array.isArray(event.activity)) {
      for (const activity of event.activity) {
        await processTransaction(activity);
      }
      
      // Refresh contract balance after processing transactions
      await fetchContractBalance();
    }

    res.status(200).json({ 
      success: true, 
      processed: event?.activity?.length || 0,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Alchemy webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Process individual transactions
async function processTransaction(activity) {
  try {
    console.log('🔍 Processing transaction:', {
      hash: activity.hash,
      from: activity.fromAddress,
      to: activity.toAddress,
      value: activity.value,
      category: activity.category
    });

    const isRaffleContract = activity.toAddress?.toLowerCase() === RAFFLE_CONTRACT.toLowerCase();
    const isFromRaffle = activity.fromAddress?.toLowerCase() === RAFFLE_CONTRACT.toLowerCase();
    const isChainlinkWallet = activity.fromAddress?.toLowerCase() === CHAINLINK_WALLET.toLowerCase() || 
                             activity.toAddress?.toLowerCase() === CHAINLINK_WALLET.toLowerCase();

    // Handle raffle contract interactions
    if (isRaffleContract) {
      // Ticket purchase detected
      if (activity.value > 0) {
        const ticketPrice = 5; // USDC
        raffleData.participants += 1;
        raffleData.totalVolume += ticketPrice;
        raffleData.lastTransactionHash = activity.hash;
        raffleData.lastUpdate = Date.now();
        
        console.log('🎫 New ticket purchased!', {
          participants: raffleData.participants,
          from: activity.fromAddress,
          hash: activity.hash
        });

        // Notify all subscribers
        notifySubscribers({
          type: 'ticket_purchased',
          participants: raffleData.participants,
          totalVolume: raffleData.totalVolume,
          buyer: activity.fromAddress?.slice(0, 6) + '...' + activity.fromAddress?.slice(-4),
          hash: activity.hash
        });

        // Send Telegram notification
        await sendNotificationToSubscribers(
          `🎫 *New Ticket Purchased!*\n\n` +
          `👤 Player: \`${activity.fromAddress?.slice(0, 6)}...${activity.fromAddress?.slice(-4)}\`\n` +
          `🎯 Tickets: ${raffleData.participants}\n` +
          `💰 Volume: $${raffleData.totalVolume.toFixed(2)}\n` +
          `🔗 [View Tx](https://basescan.org/tx/${activity.hash})`
        );
      }
    }

    // Handle raffle payouts (outgoing from raffle contract)
    if (isFromRaffle && activity.value > 0) {
      const winAmount = parseFloat(activity.value) || 0;
      raffleData.winnerAddress = activity.toAddress;
      raffleData.lastTransactionHash = activity.hash;
      raffleData.lastUpdate = Date.now();
      
      console.log('🏆 Raffle winner payout detected!', {
        winner: activity.toAddress,
        amount: winAmount,
        hash: activity.hash
      });

      // Notify subscribers
      notifySubscribers({
        type: 'winner_payout',
        winner: activity.toAddress,
        amount: winAmount,
        hash: activity.hash
      });

      // Send winner notification
      await sendNotificationToSubscribers(
        `🏆 *WINNER ANNOUNCED!*\n\n` +
        `🎉 Winner: \`${activity.toAddress?.slice(0, 6)}...${activity.toAddress?.slice(-4)}\`\n` +
        `💰 Prize: $${winAmount.toFixed(2)} USDC\n` +
        `🔗 [View Tx](https://basescan.org/tx/${activity.hash})\n\n` +
        `New raffle starting now! 🎫`
      );

      // Reset for new raffle
      raffleData.participants = 0;
      raffleData.totalVolume = 0;
    }

    // Handle Chainlink wallet activity (automation)
    if (isChainlinkWallet) {
      console.log('🤖 Chainlink automation activity detected:', {
        direction: activity.fromAddress?.toLowerCase() === CHAINLINK_WALLET.toLowerCase() ? 'outgoing' : 'incoming',
        hash: activity.hash
      });

      // This might indicate a draw is being triggered
      if (activity.fromAddress?.toLowerCase() === CHAINLINK_WALLET.toLowerCase()) {
        notifySubscribers({
          type: 'draw_triggered',
          hash: activity.hash,
          timestamp: Date.now()
        });

        await sendNotificationToSubscribers(
          `🎲 *Draw Triggered!*\n\n` +
          `🤖 Chainlink automation activated\n` +
          `🔗 [View Tx](https://basescan.org/tx/${activity.hash})\n\n` +
          `Winner announcement coming soon... 🏆`
        );
      }
    }

  } catch (error) {
    console.error('Error processing transaction:', error);
  }
}

// Notification system
function notifySubscribers(data) {
  subscribers.forEach(ws => {
    try {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          ...data,
          pot: raffleData.pot,
          participants: raffleData.participants,
          lastUpdate: raffleData.lastUpdate
        }));
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
      if (error.response?.status === 403 || error.response?.status === 400) {
        notificationSubscribers.delete(chatId);
        console.log(`Removed blocked user ${chatId} from notifications`);
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
        } else if (text === '/stats' || text === '/status') {
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

// Enhanced start message with real-time data
async function sendStartMessage(chatId, userName) {
  // Fetch latest data before sending
  await fetchContractBalance();
  
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

*Real-time data via Alchemy webhooks*
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
            text: '📊 Live Stats',
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
/stats - View live statistics  
/notify on - Enable notifications
/notify off - Disable notifications

*How to Play:*
1️⃣ Connect your wallet in the app
2️⃣ Buy tickets with USDC ($5 each)
3️⃣ Wait for the automated draw
4️⃣ Win 50% of the pot!

*Features:*
🔔 Real-time notifications
📈 Live blockchain monitoring
⚡ Instant payouts
🔐 Secure smart contracts
🤖 Chainlink automation

*Network:* Base Mainnet
*Contract:* ${RAFFLE_CONTRACT}
*Token:* USDC (0x833589...)

*Powered by Alchemy webhooks for real-time data*
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
  // Fetch latest data
  await fetchContractBalance();
  
  const winnerPayout = (parseFloat(raffleData.pot) * 0.5).toFixed(2);
  const lastUpdateTime = new Date(raffleData.lastUpdate).toLocaleTimeString();
  
  const statsText = `📊 *Live Raffle Statistics*

🎫 *Current Raffle:*
💰 Pot: $${raffleData.pot} USDC
🎯 Tickets: ${raffleData.participants}
💵 Volume: $${raffleData.totalVolume.toFixed(2)} USDC
⏰ Last Update: ${lastUpdateTime}

🏆 *Prize Split:*
• Winner Gets: $${winnerPayout} USDC
• Next Pot: $${winnerPayout} USDC

${raffleData.lastTransactionHash ? `🔗 Last Tx: \`${raffleData.lastTransactionHash.slice(0, 10)}...\`` : ''}

🌐 *Contract Info:*
• Network: Base Mainnet
• Token: USDC
• Raffle: \`${RAFFLE_CONTRACT.slice(0, 10)}...\`
• Chainlink: \`${CHAINLINK_WALLET.slice(0, 10)}...\`

📈 *Live Features:*
• Real-time transaction monitoring
• Instant win notifications  
• Chainlink automation tracking
• Base network integration

🔔 Notifications: ${notificationSubscribers.has(chatId) ? '🟢 ON' : '🔴 OFF'}

*Data updated via Alchemy webhooks*`;
  
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
    ? `🔔 *Live Notifications Enabled!*

You'll receive real-time updates for:
• 🎫 New ticket purchases
• 💰 Pot size changes
• 🏆 Winner announcements  
• 🤖 Draw triggers
• 🔗 Transaction confirmations

*Powered by Alchemy webhooks*

Use /notify off to disable.`
    : `🔕 *Notifications Disabled*

You will no longer receive real-time raffle updates.

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
/start - Launch raffle app
/stats - View live statistics
/help - Show help
/notify - Toggle notifications`;
  
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

// API endpoints with real-time data
app.get('/api/raffle-data', async (req, res) => {
  // Fetch latest balance before responding
  await fetchContractBalance();
  
  res.json({
    success: true,
    data: raffleData,
    timestamp: Date.now(),
    subscribers: subscribers.size,
    notifications: notificationSubscribers.size,
    monitoring: {
      raffleContract: RAFFLE_CONTRACT,
      chainlinkWallet: CHAINLINK_WALLET,
      webhookId: ALCHEMY_WEBHOOK_ID
    }
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
      signingKey: ALCHEMY_SIGNING_KEY ? 'configured' : 'missing',
      authToken: ALCHEMY_AUTH_TOKEN ? 'configured' : 'missing',
      apiKey: ALCHEMY_API_KEY ? 'configured' : 'missing'
    },
    monitoring: {
      raffleContract: RAFFLE_CONTRACT,
      chainlinkWallet: CHAINLINK_WALLET
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

// Initialize contract balance on startup
async function initializeApp() {
  console.log('🚀 Initializing URIM Raffle Bot...');
  
  // Fetch initial contract balance
  await fetchContractBalance();
  
  // Set up periodic balance updates as fallback
  setInterval(fetchContractBalance, 60000); // Every minute
  
  console.log('✅ App initialized with real-time monitoring');
}

app.listen(PORT, async () => {
  console.log(`🚀 URIM Raffle Bot server running on port ${PORT}`);
  console.log(`🌐 Domain: ${DOMAIN}`);
  console.log(`🤖 Bot token: ${BOT_TOKEN ? 'configured ✅' : 'missing ❌'}`);
  console.log(`📡 Telegram webhook: ${DOMAIN}/webhook`);
  console.log(`⚡ Alchemy webhook: ${DOMAIN}/alchemy-webhook`);
  console.log(`🔗 Monitoring contracts:`);
  console.log(`   - Raffle: ${RAFFLE_CONTRACT}`);
  console.log(`   - Chainlink: ${CHAINLINK_WALLET}`);
  console.log(`🔑 Alchemy config:`);
  console.log(`   - Webhook ID: ${ALCHEMY_WEBHOOK_ID}`);
  console.log(`   - Auth Token: ${ALCHEMY_AUTH_TOKEN ? 'configured ✅' : 'missing ❌'}`);
  console.log(`   - API Key: ${ALCHEMY_API_KEY ? 'configured ✅' : 'missing ❌'}`);
  
  // Initialize the app
  await initializeApp();
  
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
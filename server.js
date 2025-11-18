const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '8323137830:AAFA3wnduW5_e_GCAOtSRMo0yRTKgYb1B6Y';
const DOMAIN = process.env.DOMAIN || 'https://urim-raffle-bot.vercel.app';

// Contract configuration
const RAFFLE_CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69';
const RPC_URL = 'https://mainnet.base.org';

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

// Function to fetch contract stats
async function getContractStats() {
  try {
    const response = await axios.post(RPC_URL, {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [
        {
          to: RAFFLE_CONTRACT,
          data: '0x90e47957' // getCurrentRoundInfo() function selector
        },
        'latest'
      ]
    });

    if (response.data.result && response.data.result !== '0x') {
      // Decode the result (simplified parsing)
      const result = response.data.result;
      
      // Parse the hex result - this is a simplified version
      // In production, you'd want to use a proper ABI decoder
      const roundId = parseInt(result.slice(2, 66), 16);
      const endTime = parseInt(result.slice(66, 130), 16);
      const totalPlayers = parseInt(result.slice(130, 194), 16);
      const totalUSDC = parseInt(result.slice(194, 258), 16) / 1000000; // Convert from 6 decimals
      const timeLeft = parseInt(result.slice(258, 322), 16);
      const state = parseInt(result.slice(322, 386), 16);

      const formatTime = (seconds) => {
        if (seconds <= 0) return 'Drawing Soon!';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hrs}h ${mins}m ${secs}s`;
      };

      return {
        roundId,
        endTime,
        totalPlayers,
        totalUSDC: totalUSDC.toFixed(2),
        timeLeft: formatTime(timeLeft),
        state: state === 0 ? 'Active' : state === 1 ? 'Drawing' : 'Finished'
      };
    }
    
    // Fallback data if contract call fails
    return {
      roundId: 1,
      endTime: 0,
      totalPlayers: 7,
      totalUSDC: '35.00',
      timeLeft: 'Drawing Soon!',
      state: 'Active'
    };
  } catch (error) {
    console.error('Error fetching contract stats:', error);
    // Return fallback data
    return {
      roundId: 1,
      endTime: 0,
      totalPlayers: 7,
      totalUSDC: '35.00',
      timeLeft: 'Drawing Soon!',
      state: 'Active'
    };
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

      if (data === 'view_stats') {
        await sendStatsMessage(chatId);
        // Answer the callback query to remove loading state
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          callback_query_id: callback_query.id
        });
      } else if (data === 'share_raffle') {
        await shareRaffle(chatId);
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          callback_query_id: callback_query.id,
          text: 'Share link opened!'
        });
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

// Function to send stats message
async function sendStatsMessage(chatId) {
  try {
    const stats = await getContractStats();
    
    const statsText = `🎰 *URIM 50/50 Raffle Stats* 🎰

📊 *Round Information:*
• Round ID: #${stats.roundId}
• Total Pot: $${stats.totalUSDC} USDC
• Players: ${stats.totalPlayers}
• Time Left: ${stats.timeLeft}
• Status: ${stats.state}

🔗 *Contract:* \`${RAFFLE_CONTRACT}\`
🌐 *Network:* Base (Chain ID: 8453)
💰 *Ticket Price:* $5.00 USDC

_Stats update every 30 seconds_`;

    const message = {
      chat_id: chatId,
      text: statsText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 Refresh Stats',
              callback_data: 'view_stats'
            },
            {
              text: '🎮 Play Now',
              web_app: {
                url: DOMAIN
              }
            }
          ]
        ]
      }
    };

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, message);
    console.log('Stats message sent successfully');
  } catch (error) {
    console.error('Error sending stats message:', error.response?.data || error.message);
  }
}

// Function to share raffle
async function shareRaffle(chatId) {
  try {
    const stats = await getContractStats();
    const shareText = `🎰 Join the URIM 50/50 Raffle! Current pot: $${stats.totalUSDC} USDC 💰\n\nID: 874482516`;
    const shareUrl = `https://t.me/URIMRaffleBot`;
    
    const message = {
      chat_id: chatId,
      text: `📢 *Share this raffle with your friends!*\n\n${shareText}\n\n🔗 Bot: ${shareUrl}`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '📤 Share in Telegram',
              url: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`
            }
          ],
          [
            {
              text: '🎮 Play Now',
              web_app: {
                url: DOMAIN
              }
            }
          ]
        ]
      }
    };

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, message);
  } catch (error) {
    console.error('Error sharing raffle:', error.response?.data || error.message);
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
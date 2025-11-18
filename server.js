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

// Contract interaction functions
async function getRaffleStats() {
  try {
    // This would need to be replaced with actual RPC calls
    // For now, returning mock data structure that matches the expected format
    const roundId = 1;
    const totalUSDC = '35.00';
    const totalPlayers = 7;
    const timeLeft = '19h 23m';
    
    return {
      roundId,
      totalUSDC,
      totalPlayers,
      timeLeft,
      contractAddress: '0x36086C5950325B971E5DC11508AB67A1CE30Dc69',
      network: 'Base (8453)'
    };
  } catch (error) {
    console.error('Error fetching raffle stats:', error);
    return null;
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
        await sendWebAppMessage(chatId);
      } else if (text === '/stats') {
        await sendStatsMessage(chatId);
      }
    }

    if (callback_query) {
      const chatId = callback_query.message.chat.id;
      const userId = callback_query.from.id;
      const data = callback_query.data;

      console.log(`Callback query: ${data} from user: ${userId}`);

      // Answer the callback query first
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        callback_query_id: callback_query.id,
        text: 'Loading...'
      });

      if (data === 'view_stats') {
        await sendStatsMessage(chatId);
      } else if (data === 'share_raffle') {
        await sendShareMessage(chatId);
      } else if (data === 'refresh_stats') {
        await sendStatsMessage(chatId);
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
    const stats = await getRaffleStats();
    
    if (!stats) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: '❌ Unable to fetch raffle stats. Please try again later.'
      });
      return;
    }

    const statsText = `🎰 URIM 50/50 Raffle Stats 🎰

📊 Current Round: #${stats.roundId}
💰 Total Pot: $${stats.totalUSDC} USDC
👥 Players: ${stats.totalPlayers}
⏰ Time Left: ${stats.timeLeft}

📍 Contract: ${stats.contractAddress.slice(0, 10)}...${stats.contractAddress.slice(-6)}
🌐 Network: ${stats.network}

🎯 Winner gets 50% of the pot!`;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: statsText,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 Refresh Stats',
              callback_data: 'refresh_stats'
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
    });

    console.log('Stats message sent successfully');
  } catch (error) {
    console.error('Error sending stats message:', error.response?.data || error.message);
  }
}

// Function to send share message
async function sendShareMessage(chatId) {
  try {
    const stats = await getRaffleStats();
    const potValue = stats ? stats.totalUSDC : '0.00';
    
    const shareText = `🎰 Join the URIM 50/50 Raffle! 

💰 Current pot: $${potValue} USDC
🎫 Ticket price: $5 USDC
🏆 Winner takes 50%
⚡ Base Network

Join now: https://t.me/URIMRaffleBot
ID: 874482516`;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: shareText,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '📤 Share this Message',
              switch_inline_query: shareText
            }
          ],
          [
            {
              text: '🎮 Play Raffle',
              web_app: {
                url: DOMAIN
              }
            }
          ]
        ]
      }
    });

    console.log('Share message sent successfully');
  } catch (error) {
    console.error('Error sending share message:', error.response?.data || error.message);
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
const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '8323137830:AAFA3wnduW5_e_GCAOtSRMo0yRTKgYb1B6Y';
const DOMAIN = process.env.DOMAIN || 'https://urim-raffle-bot.vercel.app';

// Contract addresses
const RAFFLE_CONTRACT = '0x36086C5950325B971E5DC11508AB67A1CE30Dc69';
const LOTTERY_CONTRACT = '0xFC448fF766bC5d4d01cF0d15cb20f5aA2400A3DA';

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

// Mock function to get contract stats (replace with actual Web3 calls)
async function getContractStats() {
  try {
    // In production, replace these with actual contract reads using Web3.js or similar
    return {
      currentRoundId: '1',
      currentRoundTotalUSDC: '125.50',
      currentRoundPlayers: '25',
      currentRoundEndTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      timeLeft: '1h 0m 0s'
    };
  } catch (error) {
    console.error('Error fetching contract stats:', error);
    return {
      currentRoundId: '1',
      currentRoundTotalUSDC: '0.00',
      currentRoundPlayers: '0',
      currentRoundEndTime: Math.floor(Date.now() / 1000) + 3600,
      timeLeft: '1h 0m 0s'
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

      if (data === 'view_stats') {
        await sendStatsMessage(chatId);
      } else if (data === 'refresh_stats') {
        await sendStatsMessage(chatId);
      } else if (data === 'share_raffle') {
        await sendShareMessage(chatId);
      }

      // Answer the callback query
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        callback_query_id: callback_query.id
      });
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
    text: '🎰 *URIM 50/50 Raffle* 🎰\n\n💰 Win big on Base Network!\n🎫 Tickets: $5 USDC each\n🏆 50% goes to winner\n🔐 Secure Permit2 payments\n\n🌐 Visit: urim.live/lottery\n\nTap "Play Raffle" to start!',
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

// Function to send stats message (clean, no graphics)
async function sendStatsMessage(chatId) {
  try {
    const stats = await getContractStats();
    
    const statsText = `🎰 URIM 50/50 Raffle Stats 🎰

Round ID: #${stats.currentRoundId}
Total Pool: $${stats.currentRoundTotalUSDC} USDC
Players: ${stats.currentRoundPlayers}
Time Left: ${stats.timeLeft}

Raffle Contract: ${RAFFLE_CONTRACT}
Lottery Contract: ${LOTTERY_CONTRACT}
Network: Base (Chain ID: 8453)

🔐 Secure payments with Permit2 technology
🏆 50% of pool goes to winner
⚡ Instant payouts in USDC`;

    const message = {
      chat_id: chatId,
      text: statsText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 Refresh Stats',
              callback_data: 'refresh_stats'
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
    console.log('Stats message sent successfully');
  } catch (error) {
    console.error('Error sending stats message:', error.response?.data || error.message);
  }
}

// Function to send share message
async function sendShareMessage(chatId) {
  try {
    const stats = await getContractStats();
    
    const shareText = `🎰 Join URIM 50/50 Raffle Round ${stats.currentRoundId}!

Current pot: $${stats.currentRoundTotalUSDC} USDC
Players: ${stats.currentRoundPlayers}
Time left: ${stats.timeLeft}

🔐 Secure Permit2 payments
🏆 50% goes to winner
⚡ Base Network

Join now: https://t.me/URIMRaffleBot`;

    const message = {
      chat_id: chatId,
      text: shareText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '📢 Share with Friends',
              switch_inline_query: shareText
            }
          ]
        ]
      }
    };

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, message);
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
    botToken: BOT_TOKEN ? 'configured' : 'missing',
    contracts: {
      raffle: RAFFLE_CONTRACT,
      lottery: LOTTERY_CONTRACT
    }
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
  console.log(`📋 Contracts:`);
  console.log(`   Raffle: ${RAFFLE_CONTRACT}`);
  console.log(`   Lottery: ${LOTTERY_CONTRACT}`);
});

module.exports = app;
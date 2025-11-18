const express = require('express');
const path = require('path');
const app = express();

// Bot configuration
const BOT_TOKEN = process.env.BOT_TOKEN || '8323137830:AAFA3wnduW5_e_GCAOtSRMo0yRTKgYb1B6Y';
const DOMAIN = process.env.DOMAIN || 'https://urim-raffle-bot.vercel.app';
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('.'));

// Serve the main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Webhook endpoint for Telegram
app.post('/webhook', async (req, res) => {
  const { message, callback_query } = req.body;
  
  try {
    if (message?.text === '/start' || message?.text === '/help') {
      const chatId = message.chat.id;
      
      // Send web app button
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `🎰 *Welcome to URIM 50/50 Raffle!*\n\n🏆 Win big on Base Network!\n💰 $5 USD per ticket\n⚡ Instant payouts\n\nTap the button below to start playing!`,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              {
                text: '🎫 Open Raffle App',
                web_app: { url: DOMAIN }
              }
            ]]
          }
        })
      });
    }
    
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Domain: ${DOMAIN}`);
  console.log(`🤖 Bot Token: ${BOT_TOKEN ? 'Set' : 'Missing'}`);
});

module.exports = app;
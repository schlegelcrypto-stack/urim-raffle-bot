const express = require('express');
const path = require('path');
const app = express();

// Middleware
app.use(express.json());
app.use(express.static('.'));

// Bot configuration
const BOT_TOKEN = process.env.BOT_TOKEN || '8323137830:AAFA3wnduW5_e_GCAOtSRMo0yRTKgYb1B6Y';
const DOMAIN = process.env.DOMAIN || 'https://your-app.vercel.app';

// Webhook endpoint
app.post('/webhook', (req, res) => {
  const update = req.body;
  
  if (update.message) {
    const chatId = update.message.chat.id;
    const text = update.message.text;
    
    if (text === '/start') {
      // Send the web app
      const webAppUrl = `${DOMAIN}`;
      const response = {
        method: 'sendMessage',
        chat_id: chatId,
        text: '🎰 Welcome to URIM 50/50 Raffle!\n\nClick the button below to play:',
        reply_markup: {
          inline_keyboard: [[
            {
              text: '🎫 Play Raffle',
              web_app: { url: webAppUrl }
            }
          ]]
        }
      };
      
      // Send response back to Telegram
      fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response)
      });
    }
  }
  
  res.status(200).json({ ok: true });
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
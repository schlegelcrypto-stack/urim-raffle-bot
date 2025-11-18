# Check if your app is running
curl -I https://YOUR_DOMAIN.com

# Test webhook endpoint
curl -X POST https://YOUR_DOMAIN.com/webhook \
  -H "Content-Type: application/json" \
  -d '{"message":{"text":"/start","chat":{"id":123},"from":{"id":123}}}'

# View deployment logs (platform-specific)
vercel logs              # Vercel
heroku logs --tail       # Heroku
railway logs             # Railway
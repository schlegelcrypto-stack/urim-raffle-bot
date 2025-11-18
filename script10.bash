# Replace YOUR_DOMAIN with your actual deployed domain
curl -X POST "https://api.telegram.org/bot8323137830:AAFA3wnduW5_e_GCAOtSRMo0yRTKgYb1B6Y/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://YOUR_DOMAIN.com/webhook",
    "allowed_updates": ["message", "callback_query", "inline_query"]
  }'
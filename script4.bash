# Install Heroku CLI first: https://devcenter.heroku.com/articles/heroku-cli

# Login to Heroku
heroku login

# Create new app
heroku create urim-raffle-bot-[random-suffix]

# Set environment variables
heroku config:set BOT_TOKEN=8323137830:AAFA3wnduW5_e_GCAOtSRMo0yRTKgYb1B6Y
heroku config:set NODE_ENV=production
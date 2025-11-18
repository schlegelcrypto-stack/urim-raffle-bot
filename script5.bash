# Initialize git if not already done
git init
git add .
git commit -m "Initial commit"

# Connect to Heroku and deploy
git remote add heroku https://git.heroku.com/urim-raffle-bot-[your-suffix].git
git push heroku main
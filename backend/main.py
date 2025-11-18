from aiogram import Bot, Dispatcher, types
from aiogram.types import WebAppInfo
from aiogram.utils import executor
import os

TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = "https://urim-raffle-miniapp.vercel.app"  # we’ll change this later

bot = Bot(token=TOKEN)
dp = Dispatcher(bot)

@dp.message_handler(commands=['start'])
async def start(message: types.Message):
    keyboard = types.ReplyKeyboardMarkup(resize_keyboard=True)
    webapp_button = types.WebAppInfo(url=WEBAPP_URL)
    keyboard.add(types.KeyboardButton("🎟 Enter Raffle", web_app=webapp_button))
    
    await message.answer(
        "Welcome to URIM 50/50 Raffle!\n"
        "Current pot is growing fast 🔥\n"
        "Buy tickets instantly with your wallet 👇",
        reply_markup=keyboard
    )

if __name__ == '__main__':
    executor.start_polling(dp, skip_updates=True)

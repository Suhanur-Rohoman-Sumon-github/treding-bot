import fetch from "node-fetch";
import { EMA, RSI } from "technicalindicators";
import { Telegraf } from "telegraf";

// --- CONFIG ---
const BOT_TOKEN = "8469977295:AAHZWhpCEzjOa2oO01snLZA7pJ5962dOS8A";
const CHAT_ID = 6960930765;

const CAPITAL = 300;
const RISK_PERCENT = 1.5;
const STOP_LOSS_PERCENT = 0.5;
const REWARD_RISK_RATIO = 3;

const bot = new Telegraf(BOT_TOKEN);
let position = null;

(async () => {
  try {
    await bot.telegram.sendMessage(CHAT_ID, "✅ Connected!");
    console.log("Message sent successfully!");
  } catch (err) {
    console.error("Send error:", err.description || err.message);
  }
})();

async function fetchCandles(symbol = "BTCUSDT", interval = "15m", limit = 300) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.map((c) => ({
    time: new Date(c[0]),
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
  }));
}

async function fetch24hStats(symbol = "BTCUSDT") {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
  const res = await fetch(url);
  const data = await res.json();
  return {
    high24h: parseFloat(data.highPrice),
    low24h: parseFloat(data.lowPrice),
  };
}

function calculateIndicators(closes) {
  const ema50 = EMA.calculate({ period: 50, values: closes });
  const ema200 = EMA.calculate({ period: 200, values: closes });
  const rsi = RSI.calculate({ period: 14, values: closes });
  return { ema50, ema200, rsi };
}

function calculatePositionSize(entryPrice) {
  const riskAmount = (RISK_PERCENT / 100) * CAPITAL;
  const stopLossPrice = entryPrice * (1 - STOP_LOSS_PERCENT / 100);
  const riskPerUnit = entryPrice - stopLossPrice;
  const positionSize = riskAmount / riskPerUnit;
  const takeProfitPrice = entryPrice + riskPerUnit * REWARD_RISK_RATIO;

  return {
    positionSize,
    stopLossPrice,
    takeProfitPrice,
  };
}

async function sendTelegramMessage(msg) {
  try {
    await bot.telegram.sendMessage(CHAT_ID, msg);
    console.log("Telegram message sent:", msg);
  } catch (e) {
    console.error("Telegram send error:", e.message);
  }
}

async function analyze() {
  const candles = await fetchCandles();
  const closes = candles.map((c) => c.close);
  if (closes.length < 200) return;

  const { ema50, ema200, rsi } = calculateIndicators(closes);
  const current = closes[closes.length - 1];
  const ema50Now = ema50[ema50.length - 1];
  const ema200Now = ema200[ema200.length - 1];
  const rsiNow = rsi[rsi.length - 1];

  const { high24h, low24h } = await fetch24hStats();
  const uptrend = ema50Now > ema200Now;

  if (!position) {
    if (uptrend && rsiNow < 70 && current > ema50Now) {
      const { positionSize, stopLossPrice, takeProfitPrice } =
        calculatePositionSize(current);
      position = {
        entryPrice: current,
        positionSize,
        stopLossPrice,
        takeProfitPrice,
      };
      const msg = `🚀 BUY SIGNAL\nPrice: $${current.toFixed(
        2
      )}\n24h High: $${high24h}\n24h Low: $${low24h}\nPosition size: ${positionSize.toFixed(
        6
      )} BTC\nStop Loss: $${stopLossPrice.toFixed(
        2
      )}\nTake Profit: $${takeProfitPrice.toFixed(2)}`;
      await sendTelegramMessage(msg);
    } else {
      console.log(
        `No buy signal. RSI: ${rsiNow.toFixed(2)} Price: ${current.toFixed(
          2
        )} 24h High: ${high24h} Low: ${low24h}`
      );
    }
  } else {
    const { entryPrice, stopLossPrice, takeProfitPrice } = position;
    if (current >= takeProfitPrice) {
      await sendTelegramMessage(
        `🎉 TAKE PROFIT HIT\nPrice: $${current.toFixed(2)}`
      );
      position = null;
    } else if (current <= stopLossPrice) {
      await sendTelegramMessage(
        `⚠️ STOP LOSS HIT\nPrice: $${current.toFixed(2)}`
      );
      position = null;
    }
  }
}

setInterval(analyze, 60 * 1000);
console.log("Bot started...");

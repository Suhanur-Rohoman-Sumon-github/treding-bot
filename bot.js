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

// --- BOT CONNECT ---
(async () => {
  try {
    await bot.telegram.sendMessage(CHAT_ID, "✅ Connected!");
    console.log("Message sent successfully!");
  } catch (err) {
    console.error("Send error:", err.description || err.message);
  }
})();

// --- FETCH CANDLES ---
async function fetchCandles(symbol = "BTCUSDT", interval = "15m", limit = 300) {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!Array.isArray(data)) {
      console.error("Error fetching candles:", data);
      return [];
    }

    return data.map((c) => ({
      time: new Date(c[0]),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
  } catch (err) {
    console.error("Fetch candles failed:", err.message);
    return [];
  }
}

// --- FETCH 24H STATS ---
async function fetch24hStats(symbol = "BTCUSDT") {
  try {
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data || data.code) {
      console.error("Error fetching 24h stats:", data);
      return { high24h: 0, low24h: 0 };
    }

    return {
      high24h: parseFloat(data.highPrice),
      low24h: parseFloat(data.lowPrice),
    };
  } catch (err) {
    console.error("Fetch 24h stats failed:", err.message);
    return { high24h: 0, low24h: 0 };
  }
}

// --- INDICATORS ---
function calculateIndicators(closes) {
  const ema50 = EMA.calculate({ period: 50, values: closes });
  const ema200 = EMA.calculate({ period: 200, values: closes });
  const rsi = RSI.calculate({ period: 14, values: closes });
  return { ema50, ema200, rsi };
}

// --- POSITION SIZE ---
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

// --- SEND TELEGRAM MESSAGE ---
async function sendTelegramMessage(msg) {
  try {
    await bot.telegram.sendMessage(CHAT_ID, msg);
    console.log("Telegram message sent:", msg);
  } catch (e) {
    console.error("Telegram send error:", e.message);
  }
}

// --- MAIN ANALYZE FUNCTION ---
async function analyze() {
  const candles = await fetchCandles();
  if (candles.length === 0) {
    console.log("No candle data, skipping analyze...");
    return;
  }

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
      const msg = `🚀 BUY SIGNAL
Price: $${current.toFixed(2)}
24h High: $${high24h}
24h Low: $${low24h}
Position size: ${positionSize.toFixed(6)} BTC
Stop Loss: $${stopLossPrice.toFixed(2)}
Take Profit: $${takeProfitPrice.toFixed(2)}`;
      await sendTelegramMessage(msg);
    } else {
      console.log(
        `No buy signal. RSI: ${rsiNow.toFixed(2)} Price: ${current.toFixed(
          2
        )} 24h High: ${high24h} Low: ${low24h}`
      );
    }
  } else {
    const { stopLossPrice, takeProfitPrice } = position;
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

// --- RUN BOT EVERY MINUTE ---
setInterval(analyze, 60 * 1000);
console.log("Bot started...");

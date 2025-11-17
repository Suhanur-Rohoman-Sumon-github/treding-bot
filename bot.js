import { Telegraf } from "telegraf";
import fetch from "node-fetch";
import axios from "axios";
import cron from "node-cron";
import { EMA, RSI } from "technicalindicators";

// ==========================
// CONFIG
// ==========================
const BOT_TOKEN = "8469977295:AAHZWhpCEzjOa2oO01snLZA7pJ5962dOS8A";
const CHAT_ID = 6960930765;
const API_KEY = "d6d3d69587d74a969c948d302fe214f2";

const bot = new Telegraf(BOT_TOKEN);
let positions = {};
let lastRSIValues = {};

// ==========================
// TELEGRAM HELPERS
// ==========================
async function send(msg) {
  try {
    await bot.telegram.sendMessage(CHAT_ID, msg);
    console.log("📩 Sent:", msg.split("\n")[0]);
  } catch (err) {
    console.log("❌ Telegram send error:", err.message);
  }
}

// ==========================
// FETCH CANDLES (BINANCE)
// ==========================
async function fetchBinance(symbol, interval = "5m", limit = 300) {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const r = await fetch(url);
    const json = await r.json();
    if (!Array.isArray(json)) return [];

    return json.map((c) => ({ time: c[0], close: parseFloat(c[4]) }));
  } catch (err) {
    return [];
  }
}

// ==========================
// FETCH FOREX CANDLES
// ==========================

// Fetch time series data for Forex or Crypto
async function fetchTwelveData(symbol) {
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=5min&apikey=${API_KEY}&format=json&outputsize=100`;
    const { data } = await axios.get(url);

    if (data.status === "error") {
      console.error("❌ Twelve Data API error:", data.message);
      return null;
    }

    // data.values is an array of candles, newest first
    const closes = data.values
      .map((candle) => parseFloat(candle.close))
      .reverse();

    const latestPrice = closes[closes.length - 1];

    return { closes, latestPrice };
  } catch (err) {
    console.error("❌ Twelve Data fetch error:", err.message);
    return null;
  }
}

// ==========================
// INDICATORS
// ==========================
function getIndicators(closes) {
  return {
    ema50: EMA.calculate({ period: 10, values: closes }).pop(),
    ema200: EMA.calculate({ period: 20, values: closes }).pop(),
    rsi: RSI.calculate({ period: 14, values: closes }).pop(),
  };
}

// ==========================
// MASTER ANALYZE FUNCTION
// ==========================
async function analyzeMarket(symbol, type = "forex") {
  let data = await fetchTwelveData(symbol);
  if (!data) {
    console.log(`[DEBUG] No data for ${symbol}`);
    return null;
  }

  const closes = data.closes;

  if (!closes || closes.length < 30) {
    console.log(`[DEBUG] Not enough data for ${symbol}: ${closes.length}`);
    return null;
  }

  const { ema50, ema200, rsi } = getIndicators(closes);
  const last = data.latestPrice;

  lastRSIValues[symbol] = rsi;

  return { symbol, rsi, ema50, ema200, last, type };
}

// ==========================
// FOREX LIST
// ==========================
const FOREX = [
  "EUR/USD",
  "GBP/USD",
  "AUD/USD",
  "NZD/USD",
  "USD/JPY",
  "USD/CHF",
  "USD/CAD",
];

const BTC_SYMBOL = "BTC/USDT"; // Twelve Data format

// ==========================
// SCHEDULERS
// ==========================

// --- Forex RSI every 5 min
cron.schedule("*/5 * * * *", async () => {
  console.log("🔄 Checking all RSI values...");

  const forexResults = await Promise.all(
    FOREX.map((pair) => analyzeMarket(pair, "forex"))
  );

  const btcResult = await analyzeMarket(BTC_SYMBOL, "binance");

  const allResults = [...forexResults.filter(Boolean), btcResult].filter(
    Boolean
  );

  // Build one big message with RSI info + current price
  let message = `📊 RSI Update — ${new Date().toLocaleString()}\n\n`;
  allResults.forEach(({ symbol, rsi, last }) => {
    message += `${symbol}: Price = ${last.toFixed(5)}, RSI = ${rsi.toFixed(
      2
    )}\n`;
  });

  // Add overbought/oversold alerts
  allResults.forEach(({ symbol, rsi }) => {
    if (rsi > 65)
      message += `⚠️ ${symbol} RSI Overbought (${rsi.toFixed(2)})\n`;
    if (rsi < 35) message += `⚠️ ${symbol} RSI Oversold (${rsi.toFixed(2)})\n`;
  });

  await send(message);

  // Optional: EMA trade signals for Binance pairs, sent separately
  for (const res of allResults) {
    if (res.type === "binance") {
      const { symbol, ema50, ema200, rsi, last } = res;
      if (!positions[symbol]) {
        if (ema50 > ema200 && rsi > 50) {
          positions[symbol] = true;
          await send(
            `🚀 BUY SIGNAL [${symbol}]\nPrice: ${last}\nRSI: ${rsi.toFixed(2)}`
          );
        }
      } else {
        if (ema50 < ema200 || rsi < 45) {
          positions[symbol] = null;
          await send(`📉 SELL EXIT [${symbol}]\nPrice: ${last}`);
        }
      }
    }
  }
});

// ==========================
// STARTUP MESSAGE
// ==========================
send("🤖 SUPER BOT Started!\nMonitoring Forex, BTC & Gold...");
console.log("Super Bot running...");

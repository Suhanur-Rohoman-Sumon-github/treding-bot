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
async function fetchBinance(symbol, interval = "15m", limit = 300) {
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
async function fetchForex(pair) {
  try {
    const base = pair.slice(0, 3);
    const quote = pair.slice(3);

    const url = `https://api.exchangerate.host/timeseries?base=${base}&symbols=${quote}&start_date=2024-10-01&end_date=2024-12-31`;
    const { data } = await axios.get(url);

    const closes = Object.values(data.rates).map((r) => r[quote]);
    return closes.slice(-200);
  } catch (err) {
    return [];
  }
}

// ==========================
// INDICATORS
// ==========================
function getIndicators(closes) {
  return {
    ema50: EMA.calculate({ period: 50, values: closes }).pop(),
    ema200: EMA.calculate({ period: 200, values: closes }).pop(),
    rsi: RSI.calculate({ period: 14, values: closes }).pop(),
  };
}

// ==========================
// MASTER ANALYZE FUNCTION
// ==========================
async function analyzeMarket(symbol, type = "forex") {
  let closes;

  if (type === "binance")
    closes = (await fetchBinance(symbol)).map((c) => c.close);
  else closes = await fetchForex(symbol);

  if (!closes || closes.length < 200) return;

  const { ema50, ema200, rsi } = getIndicators(closes);
  const last = closes.at(-1);

  const key = `${symbol}`;
  const prevRSI = lastRSIValues[key] ?? null;

  // RSI Update Message
  if (prevRSI !== null && prevRSI !== rsi) {
    const diff = (rsi - prevRSI).toFixed(2);
    const arrow = diff > 0 ? "↗" : "↘";

    await send(
      `📊 [${symbol}] RSI: ${rsi.toFixed(2)} (${arrow} ${Math.abs(diff)})`
    );
  }
  lastRSIValues[key] = rsi;

  // Extra RSI Alerts
  if (rsi > 65) await send(`⚠️ [${symbol}] RSI Overbought (${rsi.toFixed(2)})`);
  if (rsi < 35) await send(`⚠️ [${symbol}] RSI Oversold (${rsi.toFixed(2)})`);

  // EMA Trade Logic (Only for Binance assets)
  if (type === "binance") {
    if (!positions[key]) {
      if (ema50 > ema200 && rsi > 50) {
        positions[key] = true;
        await send(
          `🚀 BUY SIGNAL [${symbol}]\nPrice: ${last}\nRSI: ${rsi.toFixed(2)}`
        );
      }
    } else {
      if (ema50 < ema200 || rsi < 45) {
        positions[key] = null;
        await send(`📉 SELL EXIT [${symbol}]\nPrice: ${last}`);
      }
    }
  }
}

// ==========================
// FOREX LIST
// ==========================
const FOREX = [
  "EURUSD",
  "GBPUSD",
  "AUDUSD",
  "NZDUSD",
  "USDJPY",
  "USDCHF",
  "USDCAD",
];

// ==========================
// SCHEDULERS
// ==========================

// --- Forex RSI every 5 min
cron.schedule("*/5 * * * *", async () => {
  console.log("🔄 Checking Forex RSI...");
  for (const pair of FOREX) await analyzeMarket(pair, "forex");
});

// --- BTC every 5 min
setInterval(() => analyzeMarket("BTCUSDT", "binance"), 5 * 60 * 1000);

// --- XAU Every 15 min
setInterval(() => analyzeMarket("XAUUSD", "forex"), 15 * 60 * 1000);
setInterval(() => analyzeMarket("XAUEUR", "forex"), 15 * 60 * 1000);
setInterval(() => analyzeMarket("XAUAUD", "forex"), 15 * 60 * 1000);
setInterval(() => analyzeMarket("XAUGBP", "forex"), 15 * 60 * 1000);

// ==========================
// STARTUP MESSAGE
// ==========================
send("🤖 SUPER BOT Started!\nMonitoring Forex, BTC & Gold...");
console.log("Super Bot running...");

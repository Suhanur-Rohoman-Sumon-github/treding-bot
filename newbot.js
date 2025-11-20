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

// ==========================
// INIT
// ==========================
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
async function fetchBinance(symbol, interval = "4h", limit = 300) {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const r = await fetch(url);
    const json = await r.json();
    if (!Array.isArray(json)) return [];

    return json.map((c) => ({ time: c[0], close: parseFloat(c[4]) }));
  } catch (err) {
    console.log("Binance fetch error:", err.message);
    return [];
  }
}

// ==========================
// FETCH FOREX CANDLES (Massive API)
// ==========================
async function fetchForex(pair) {
  try {
    // Twelve Data expects symbol format like "EUR/USD"
    const symbol = pair.slice(0, 3) + "/" + pair.slice(3);

    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=4h&outputsize=200&apikey=d6d3d69587d74a969c948d302fe214f2`;

    const { data } = await axios.get(url);

    if (!data || !data.values) {
      console.log(`[DEBUG] Twelve Data returned no data for ${pair}`);
      return [];
    }

    // Twelve Data returns array newest first, so reverse it for oldest first
    const closes = data.values.reverse().map((v) => parseFloat(v.close));
    return closes;
  } catch (err) {
    console.log("Forex fetch error:", err.message);
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
// ANALYZE MARKET
// ==========================
async function analyzeMarket(symbol, type = "forex") {
  let closes;

  if (type === "binance") {
    closes = (await fetchBinance(symbol)).map((c) => c.close);
  } else {
    closes = await fetchForex(symbol);
    console.log(`[DEBUG] Forex closes for ${symbol}: length=${closes?.length}`);
  }

  if (!closes || closes.length < 30) {
    console.log(
      `[DEBUG] Not enough data for ${symbol}: ${closes?.length || 0} bars`
    );
    return null;
  }

  const { ema50, ema200, rsi } = getIndicators(closes);
  const last = closes.at(-1);

  lastRSIValues[symbol] = rsi;

  return { symbol, rsi, ema50, ema200, last, type };
}

// ==========================
// FOREX PAIRS
// ==========================
const FOREX = [
  "EURUSD",
  "GBPUSD",
  "AUDUSD",
  "NZDUSD",
  "USDJPY",
  "USDCHF",
  "USDCAD",
  "XAUUSD",
];
 
// ==========================
// SCHEDULER
// ==========================
cron.schedule("*/30 * * * *", async () => {
  console.log("🔄 Checking all RSI values...");

  const forexResults = await Promise.all(
    FOREX.map((pair) => analyzeMarket(pair, "forex"))
  );
  const btcResult = await analyzeMarket("BTCUSDT", "binance");

  const allResults = [...forexResults.filter(Boolean), btcResult].filter(
    Boolean
  );

  let message = `📊 RSI Update — ${new Date().toLocaleString()}\n\n`;
  allResults.forEach(({ symbol, rsi }) => {
    message += `${symbol}: ${rsi.toFixed(2)}\n`;
  });

  allResults.forEach(({ symbol, rsi }) => {
    if (rsi > 65)
      message += `⚠️ ${symbol} RSI Overbought (${rsi.toFixed(2)})\n`;
    if (rsi < 35) message += `⚠️ ${symbol} RSI Oversold (${rsi.toFixed(2)})\n`;
  });

  await send(message);

  // EMA trade signals for Binance pairs
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

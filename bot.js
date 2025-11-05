import { Telegraf } from "telegraf";
import fetch from "node-fetch";
import { EMA, RSI } from "technicalindicators";

const BOT_TOKEN = "8469977295:AAHZWhpCEzjOa2oO01snLZA7pJ5962dOS8A";
const CHAT_ID = 6960930765;
const API_KEY = "d6d3d69587d74a969c948d302fe214f2";

const CAPITAL = 1000;
const RISK_PERCENT = 2;
const STOP_LOSS_PERCENT = 1;
const TAKE_PROFIT_PERCENT = 2;

const bot = new Telegraf(BOT_TOKEN);
let positions = {};
let lastRSIValues = {};

// Split pairs into two categories
const cryptoSymbols = ["BTCUSDT", "ETHUSDT"];
const goldSymbols = ["XAU/USD", "XAU/EUR", "XAU/GBP", "XAU/AUD"];

// --- BOT CONNECT ---
(async () => {
  try {
    await bot.telegram.sendMessage(CHAT_ID, "✅ Hybrid RSI Bot connected!");
    console.log("Telegram bot connected.");
  } catch (err) {
    console.error("Failed to connect Telegram bot:", err.message);
  }
})();

// --- FETCH CANDLES FROM BINANCE ---
async function fetchBinanceCandles(
  symbol = "BTCUSDT",
  interval = "15m",
  limit = 300
) {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((c) => ({
      time: new Date(c[0]),
      close: parseFloat(c[4]),
    }));
  } catch (err) {
    console.error(`❌ Binance fetch failed for ${symbol}:`, err.message);
    return [];
  }
}

// --- FETCH CANDLES FROM TWELVE DATA ---
async function fetchTwelveCandles(
  symbol = "XAU/USD",
  interval = "15min",
  limit = 300
) {
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&outputsize=${limit}&apikey=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.values) {
      console.error(
        `❌ No data for ${symbol}:`,
        data.message || "Unknown error"
      );
      return [];
    }
    return data.values.reverse().map((c) => ({
      time: new Date(c.datetime),
      close: parseFloat(c.close),
    }));
  } catch (err) {
    console.error(`❌ Twelve Data fetch failed for ${symbol}:`, err.message);
    return [];
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
  const takeProfitPrice = entryPrice * (1 + TAKE_PROFIT_PERCENT / 100);
  const positionSize = riskAmount / (entryPrice - stopLossPrice);
  return { positionSize, stopLossPrice, takeProfitPrice };
}

// --- TELEGRAM MESSAGE ---
async function sendTelegramMessage(msg) {
  try {
    await bot.telegram.sendMessage(CHAT_ID, msg);
    console.log("📩 Sent:", msg.split("\n")[0]);
  } catch (err) {
    console.error("❌ Telegram send failed:", err.message);
  }
}

// --- ANALYZE FUNCTION ---
async function analyze(symbol, source = "binance") {
  const candles =
    source === "binance"
      ? await fetchBinanceCandles(symbol)
      : await fetchTwelveCandles(symbol);

  if (candles.length < 200) return;

  const closes = candles.map((c) => c.close);
  const { ema50, ema200, rsi } = calculateIndicators(closes);

  const current = closes.at(-1);
  const lastEMA50 = ema50.at(-1);
  const lastEMA200 = ema200.at(-1);
  const currentRSI = rsi.at(-1);

  const key = `${source}:${symbol}`;
  const lastRSI = lastRSIValues[key] ?? null;

  // --- RSI Update
  if (lastRSI !== null && currentRSI !== lastRSI) {
    const diff = (currentRSI - lastRSI).toFixed(2);
    const arrow = diff > 0 ? "↗" : "↘";
    await sendTelegramMessage(
      `📊 [${symbol}] RSI: ${currentRSI.toFixed(2)} (${arrow} ${Math.abs(
        diff
      )})`
    );

    if (currentRSI > 60)
      await sendTelegramMessage(
        `⚠️ [${symbol}] RSI Overbought (${currentRSI.toFixed(2)})`
      );
    if (currentRSI < 42)
      await sendTelegramMessage(
        `⚠️ [${symbol}] RSI Oversold (${currentRSI.toFixed(2)})`
      );
  }
  lastRSIValues[key] = currentRSI;

  // --- Trade logic
  if (!positions[key]) {
    if (lastEMA50 > lastEMA200 && currentRSI > 50) {
      const { positionSize, stopLossPrice, takeProfitPrice } =
        calculatePositionSize(current);
      positions[key] = { stopLossPrice, takeProfitPrice };

      const msg = `🚀 [${symbol}] BUY SIGNAL
Price: $${current.toFixed(2)}
RSI: ${currentRSI.toFixed(2)}
Position Size: ${positionSize.toFixed(6)} units
SL: $${stopLossPrice.toFixed(2)}
TP: $${takeProfitPrice.toFixed(2)}`;
      await sendTelegramMessage(msg);
    }
  } else {
    const { stopLossPrice, takeProfitPrice } = positions[key];
    if (current >= takeProfitPrice) {
      await sendTelegramMessage(
        `🎉 [${symbol}] TAKE PROFIT HIT @ $${current.toFixed(2)}`
      );
      positions[key] = null;
    } else if (current <= stopLossPrice) {
      await sendTelegramMessage(
        `❌ [${symbol}] STOP LOSS HIT @ $${current.toFixed(2)}`
      );
      positions[key] = null;
    }
  }
}

// --- MAIN LOOP ---
setInterval(() => analyze("BTCUSDT"), 60 * 1000);
setInterval(() => analyze("ETHUSDT"), 60 * 1000);

// XAU pairs (reduce frequency to save API)
setInterval(() => analyze("XAUUSD"), 15 * 60 * 1000); // every 15 minutes
setInterval(() => analyze("XAUEUR"), 15 * 60 * 1000);
setInterval(() => analyze("XAUAUD"), 15 * 60 * 1000);
setInterval(() => analyze("XAUGBP"), 15 * 60 * 1000);

console.log("🤖 Bot started... Crypto every 1min, XAU pairs every 15min...");

import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import axios from "axios";
import cron from "node-cron";
import { EMA, RSI, ATR } from "technicalindicators";

// ==========================
// CONFIG
// ==========================
const BOT_TOKEN = "8469977295:AAHZWhpCEzjOa2oO01snLZA7pJ5962dOS8A";
const CHAT_ID = 6960930765;
const API_KEY = "d6d3d69587d74a969c948d302fe214f2";

// ==========================
// INIT
// ==========================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
let positions = {};

// ==========================
// TELEGRAM HELPERS
// ==========================
async function send(msg) {
  try {
    await bot.sendMessage(CHAT_ID, msg);
    console.log("📩 Sent:", msg.split("\n")[0]);
  } catch (err) {
    console.log("❌ Telegram send error:", err.message);
  }
}

// ==========================
// FETCH BINANCE CANDLES (4H)
// ==========================
async function fetchBinance(symbol, interval = "4h", limit = 300) {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const r = await fetch(url);
    const json = await r.json();
    if (!Array.isArray(json)) return [];

    return json.map((c) => ({
      time: c[0],
      close: parseFloat(c[4]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      volume: parseFloat(c[5]),
    }));
  } catch (err) {
    console.log("Binance fetch error:", err.message);
    return [];
  }
}

// ==========================
// FETCH FOREX OHLC (Twelve Data)
// ==========================
async function fetchForexOHLC(pair, interval) {
  try {
    const symbol = pair.slice(0, 3) + "/" + pair.slice(3);
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&outputsize=200&apikey=${API_KEY}`;
    const { data } = await axios.get(url);
    if (!data || !data.values) return null;

    const values = data.values.reverse();

    const highs = values.map((v) => parseFloat(v.high));
    const lows = values.map((v) => parseFloat(v.low));
    const closes = values.map((v) => parseFloat(v.close));
    return { highs, lows, closes };
  } catch (err) {
    console.log(`[ERROR] Forex OHLC fetch ${interval} error:`, err.message);
    return null;
  }
}

// ==========================
// FETCH FOREX CLOSES ONLY (for daily RSI)
// ==========================
async function fetchForexInterval(pair, interval) {
  try {
    const symbol = pair.slice(0, 3) + "/" + pair.slice(3);
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&outputsize=200&apikey=${API_KEY}`;
    const { data } = await axios.get(url);
    if (!data || !data.values) {
      console.log(`[DEBUG] No data for ${pair} ${interval}`);
      return [];
    }
    return data.values.reverse().map((v) => parseFloat(v.close));
  } catch (err) {
    console.log(`[ERROR] Forex fetch ${interval} error:`, err.message);
    return [];
  }
}

// ==========================
// INDICATORS CALCULATION
// ==========================
function getIndicators(closes) {
  return {
    ema50: EMA.calculate({ period: 50, values: closes }).pop(),
    ema200: EMA.calculate({ period: 200, values: closes }).pop(),
    rsi: RSI.calculate({ period: 14, values: closes }).pop(),
  };
}

// ==========================
// MULTI-TIMEFRAME ANALYSIS
// ==========================
async function analyzeMarketMultiTF(symbol, type = "forex") {
  if (type !== "forex") {
    const klines = await fetchBinance(symbol, "4h");
    if (klines.length < 30) return null;

    const closes = klines.map((c) => c.close);
    const highs = klines.map((c) => c.high);
    const lows = klines.map((c) => c.low);
    const volumes = klines.map((c) => c.volume);

    const { ema50, ema200, rsi } = getIndicators(closes);

    const atrValues = ATR.calculate({
      period: 14,
      high: highs,
      low: lows,
      close: closes,
    });
    const atr = atrValues.length ? atrValues[atrValues.length - 1] : null;

    const recentVolumes = volumes.slice(-20);
    const avgVolume =
      recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const lastVolume = volumes[volumes.length - 1];

    return {
      symbol,
      rsi4h: rsi,
      ema50_4h: ema50,
      ema200_4h: ema200,
      last4h: closes.at(-1),
      atr,
      avgVolume,
      lastVolume,
      type,
    };
  }

  const ohlc4h = await fetchForexOHLC(symbol, "4h");
  const closes1d = await fetchForexInterval(symbol, "1day");

  if (!ohlc4h || ohlc4h.closes.length < 30 || closes1d.length < 30) {
    console.log(`[DEBUG] Not enough data for ${symbol} multi-TF`);
    return null;
  }

  const { highs, lows, closes: closes4h } = ohlc4h;
  const {
    ema50: ema50_4h,
    ema200: ema200_4h,
    rsi: rsi4h,
  } = getIndicators(closes4h);
  const {
    ema50: ema50_1d,
    ema200: ema200_1d,
    rsi: rsi1d,
  } = getIndicators(closes1d);

  const atrValues = ATR.calculate({
    period: 14,
    high: highs,
    low: lows,
    close: closes4h,
  });
  const atr = atrValues.length ? atrValues[atrValues.length - 1] : null;

  return {
    symbol,
    rsi4h,
    ema50_4h,
    ema200_4h,
    last4h: closes4h.at(-1),
    rsi1d,
    ema50_1d,
    ema200_1d,
    last1d: closes1d.at(-1),
    atr,
    type,
  };
}

// ==========================
// FOREX PAIRS LIST
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
// MAIN CRON SCHEDULE (every 30 mins)
// ==========================
cron.schedule("*/30 * * * *", async () => {
  console.log("🔄 Checking all RSI values multi-timeframe...");

  const forexResults = await Promise.all(
    FOREX.map((pair) => analyzeMarketMultiTF(pair, "forex"))
  );
  const btcResult = await analyzeMarketMultiTF("BTCUSDT", "binance");

  const allResults = [...forexResults.filter(Boolean), btcResult].filter(
    Boolean
  );

  let message = `📊 RSI Update — ${new Date().toLocaleString()}\n\n`;
  allResults.forEach(({ symbol, rsi4h, rsi1d, rsi }) => {
    if (rsi4h !== undefined)
      message += `${symbol} 4H RSI: ${rsi4h.toFixed(2)}\n`;
    if (rsi1d !== undefined)
      message += `${symbol} 1D RSI: ${rsi1d.toFixed(2)}\n`;
    if (rsi !== undefined) message += `${symbol} RSI: ${rsi.toFixed(2)}\n`;
  });

  allResults.forEach(({ symbol, rsi4h, rsi1d, rsi }) => {
    if ((rsi4h && rsi4h > 65) || (rsi1d && rsi1d > 65) || (rsi && rsi > 65))
      message += `⚠️ ${symbol} RSI Overbought\n`;
    if ((rsi4h && rsi4h < 35) || (rsi1d && rsi1d < 35) || (rsi && rsi < 35))
      message += `⚠️ ${symbol} RSI Oversold\n`;
  });

  await send(message);

  for (const res of allResults) {
    if (res.type === "forex") {
      const {
        symbol,
        ema50_4h,
        ema200_4h,
        ema50_1d,
        ema200_1d,
        rsi4h,
        rsi1d,
        last4h,
        atr,
      } = res;

      if (!positions[symbol]) {
        if (
          ema50_4h > ema200_4h &&
          ema50_1d > ema200_1d &&
          rsi4h > 50 &&
          rsi1d > 50
        ) {
          positions[symbol] = true;
          const entryPrice = last4h;
          if (atr) {
            const sl = (entryPrice - 1.5 * atr).toFixed(5);
            const tp = (entryPrice + 3 * atr).toFixed(5);
            await send(
              `🚀 BUY SIGNAL [${symbol}]\nPrice: ${entryPrice}\n4H RSI: ${rsi4h.toFixed(
                2
              )}\n1D RSI: ${rsi1d.toFixed(2)}\nSL: ${sl}\nTP: ${tp}`
            );
          } else {
            await send(
              `🚀 BUY SIGNAL [${symbol}]\nPrice: ${entryPrice}\n4H RSI: ${rsi4h.toFixed(
                2
              )}\n1D RSI: ${rsi1d.toFixed(2)}\nSL/TP data unavailable`
            );
          }
        }
      } else {
        if (
          ema50_4h < ema200_4h ||
          ema50_1d < ema200_1d ||
          rsi4h < 45 ||
          rsi1d < 45
        ) {
          positions[symbol] = null;
          await send(`📉 SELL EXIT [${symbol}]\nPrice: ${last4h}`);
        }
      }
    }

    if (res.type === "binance") {
      const {
        symbol,
        ema50_4h,
        ema200_4h,
        rsi4h,
        last4h,
        atr,
        avgVolume,
        lastVolume,
      } = res;

      if (!positions[symbol]) {
        if (lastVolume > avgVolume && ema50_4h > ema200_4h && rsi4h > 50) {
          positions[symbol] = true;
          const entryPrice = last4h;
          if (atr) {
            const sl = (entryPrice - 1.5 * atr).toFixed(5);
            const tp = (entryPrice + 3 * atr).toFixed(5);
            await send(
              `🚀 BUY SIGNAL [${symbol}]\nPrice: ${entryPrice}\nRSI: ${rsi4h.toFixed(
                2
              )}\nSL: ${sl}\nTP: ${tp}\nVolume Filter: Passed`
            );
          } else {
            await send(
              `🚀 BUY SIGNAL [${symbol}]\nPrice: ${entryPrice}\nRSI: ${rsi4h.toFixed(
                2
              )}\nSL/TP data unavailable\nVolume Filter: Passed`
            );
          }
        }
      } else {
        if (ema50_4h < ema200_4h || rsi4h < 45) {
          positions[symbol] = null;
          await send(`📉 SELL EXIT [${symbol}]\nPrice: ${last4h}`);
        }
      }
    }
  }
});

// ==========================
// INTERACTIVE TELEGRAM COMMANDS
// ==========================
bot.onText(/\/status/, async (msg) => {
  let message = "📊 Current Positions:\n";
  for (const [symbol, pos] of Object.entries(positions)) {
    message += `${symbol}: ${pos ? "LONG" : "NONE"}\n`;
  }
  bot.sendMessage(msg.chat.id, message);
});

bot.onText(/\/rsi (.+)/, async (msg, match) => {
  const symbol = match[1].toUpperCase();
  if (!FOREX.includes(symbol) && symbol !== "BTCUSDT") {
    return bot.sendMessage(msg.chat.id, "Unknown symbol or unsupported.");
  }

  const result = await analyzeMarketMultiTF(
    symbol,
    symbol === "BTCUSDT" ? "binance" : "forex"
  );
  if (!result) return bot.sendMessage(msg.chat.id, "No data available.");

  const rsi4h = result.rsi4h !== undefined ? result.rsi4h.toFixed(2) : "N/A";
  const rsi1d = result.rsi1d !== undefined ? result.rsi1d.toFixed(2) : "N/A";
  const rsi = result.rsi !== undefined ? result.rsi.toFixed(2) : "N/A";

  bot.sendMessage(
    msg.chat.id,
    `RSI for ${symbol}:\n4H: ${rsi4h}\n1D: ${rsi1d}\nBinance(4H): ${rsi}`
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "/status - Show current open positions\n" +
      "/rsi SYMBOL - Get RSI for a symbol (e.g. /rsi EURUSD)\n" +
      "/help - Show this help message"
  );
});

// ==========================
// STARTUP MESSAGE & BOT LAUNCH
// ==========================
send("🤖 SUPER BOT Started!\nMonitoring Forex, BTC & Gold...");
console.log("Super Bot running...");

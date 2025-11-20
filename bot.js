import { Telegraf } from "telegraf";
import fetch from "node-fetch";
import axios from "axios";
import cron from "node-cron";
import { EMA, RSI, ATR, MACD } from "technicalindicators";

// CONFIG: Replace these tokens and chat IDs with your actual ones
const botNews = new Telegraf("8550095850:AAGcdpapAcFLAIEs8Nsb8xICavr5k0S3IwY");
const chatIdNews = 6960930765;

const botSignals = new Telegraf(
  "8469977295:AAHZWhpCEzjOa2oO01snLZA7pJ5962dOS8A"
);
const chatIdSignals = 6960930765;

const botUpdates = new Telegraf(
  "8474279260:AAH2rR7xxdLmueq4NXxK0M5DyYR5pRTQrcU"
);
const chatIdUpdates = 6960930765;

const API_KEY = "d6d3d69587d74a969c948d302fe214f2"; // Twelve Data API key
const Indecis_API_KEY = "79049b204b17405b8c6ac06888416064"; // Twelve Data API key
const FINNHUB_API_KEY = "d4djcihr01qmhtc4n0n0d4djcihr01qmhtc4n0ng"; // Finnhub API key

// TELEGRAM SEND HELPERS
async function sendNewsMessage(msg) {
  try {
    await botNews.telegram.sendMessage(chatIdNews, msg, {
      parse_mode: "Markdown",
    });
    console.log("📩 Sent News:", msg.split("\n")[0]);
  } catch (err) {
    console.log("❌ Telegram send error (News):", err.message);
  }
}

async function sendSignalMessage(msg) {
  try {
    await botSignals.telegram.sendMessage(chatIdSignals, msg, {
      parse_mode: "Markdown",
    });
    console.log("📩 Sent Signal:", msg.split("\n")[0]);
  } catch (err) {
    console.log("❌ Telegram send error (Signal):", err.message);
  }
}

async function sendUpdateMessage(msg) {
  try {
    await botUpdates.telegram.sendMessage(chatIdUpdates, msg, {
      parse_mode: "Markdown",
    });
    console.log("📩 Sent Update:", msg.split("\n")[0]);
  } catch (err) {
    console.log("❌ Telegram send error (Update):", err.message);
  }
}

// TRACKERS
let positions = {}; // track open positions per symbol
let lastRSIValues = {};
let lastATRValues = {};

const CRYPTO_PAIRS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "BNBUSDT",
  "ADAUSDT",
];

// FETCH BINANCE CANDLES (crypto)
async function fetchBinance(symbol, interval = "15m", limit = 300) {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const r = await fetch(url);
    const json = await r.json();
    if (!Array.isArray(json)) return [];

    return json.map((c) => ({
      time: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
    }));
  } catch (err) {
    console.log("Binance fetch error:", err.message);
    return [];
  }
}

// PAIRS TO MONITOR
const FOREX_PAIRS = [
  "EURUSD",
  "GBPUSD",
  "AUDUSD",
  "NZDUSD",
  "USDJPY",
  "USDCHF",
  "USDCAD",
  "XAUUSD",
];

// FETCH FOREX CANDLES (Twelve Data)
async function fetchForex(pair) {
  try {
    const symbol = pair.slice(0, 3) + "/" + pair.slice(3);
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=15min&outputsize=200&apikey=${API_KEY}`;
    const { data } = await axios.get(url);
    if (!data || !data.values) {
      console.log(`[DEBUG] Twelve Data returned no data for ${pair}`);
      return [];
    }
    // reverse for oldest first
    return data.values.reverse().map((v) => ({
      time: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
    }));
  } catch (err) {
    console.log("Forex fetch error:", err.message);
    return [];
  }
}
const INDEX_PAIRS = [
  "DAX", // DAX
  "FTSE", // FTSE 100
  "NAS100", // NASDAQ Composite (IXIC)
  "DJI", // Dow Jones
  "SPX", // S&P 500
  "FCHI", // CAC40
  "EURAUD",
  "EURGBP",
];

// Modify fetchIndecis like this:
async function fetchIndecis(pair) {
  try {
    // For indices, use pair as-is without splitting with '/'
    const isIndex = ["DE30", "FTSE", "NAS100", "DJI", "SPX", "FCHI"].includes(
      pair
    );

    const symbol = isIndex ? pair : pair.slice(0, 3) + "/" + pair.slice(3);

    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=15min&outputsize=200&apikey=${Indecis_API_KEY}`;
    const { data } = await axios.get(url);
    if (!data || !data.values) {
      console.log(`[DEBUG] Twelve Data returned no data for ${pair}`);
      return [];
    }
    // reverse for oldest first
    return data.values.reverse().map((v) => ({
      time: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
    }));
  } catch (err) {
    console.log("Forex fetch error:", err.message);
    return [];
  }
}

// GET INDICATORS
function getIndicators(candles) {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const ema50 = EMA.calculate({ period: 20, values: closes }).pop();
  const ema200 = EMA.calculate({ period: 50, values: closes }).pop();
  const rsi = RSI.calculate({ period: 14, values: closes }).pop();
  const atr = ATR.calculate({
    period: 14,
    high: highs,
    low: lows,
    close: closes,
  }).pop();

  // MACD standard params
  const macdInput = {
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  };
  const macdResults = MACD.calculate(macdInput);
  const macd = macdResults.length ? macdResults.pop() : null;

  return { ema50, ema200, rsi, atr, macd };
}

// SUPPORT AND RESISTANCE CALCULATION
function findSupportResistance(candles, lookback = 20) {
  const recentCandles = candles.slice(-lookback);
  const support = Math.min(...recentCandles.map((c) => c.low));
  const resistance = Math.max(...recentCandles.map((c) => c.high));
  return { support, resistance };
}

// ANALYZE MARKET (handles both Forex and Binance)
async function analyzeMarket(symbol, type) {
  let candles = [];
  if (type === "binance") {
    candles = await fetchBinance(symbol);
  } else if (type === "forex") {
    candles = await fetchForex(symbol);
  } else if (type === "indecis") {
    candles = await fetchIndecis(symbol);
  }

  if (!candles || candles.length < 20) {
    console.log(
      `[DEBUG] Not enough data for ${symbol}: ${candles?.length || 0} candles`
    );
    return null;
  }

  const indicators = getIndicators(candles);
  if (!indicators.rsi || !indicators.atr) {
    console.log(`[DEBUG] Missing indicators for ${symbol}`);
    return null;
  }

  const { support, resistance } = findSupportResistance(candles);

  lastRSIValues[symbol] = indicators.rsi;
  lastATRValues[symbol] = indicators.atr;

  return {
    symbol,
    ...indicators,
    lastClose: candles[candles.length - 1].close,
    lastLow: candles[candles.length - 1].low,
    lastHigh: candles[candles.length - 1].high,
    support,
    resistance,
    type,
  };
}

// STRATEGY & SIGNALS
async function checkSignals(marketData) {
  if (!marketData) {
    return;
  }

  const {
    symbol,
    ema50,
    ema200,
    rsi,
    atr,
    macd,
    lastClose,
    type,
    support,
    resistance,
  } = marketData;

  const stopLossBuffer = atr * 1.5;

  if (!positions[symbol]) {
    // Buy: EMA50 > EMA200, RSI between 30 and 50, MACD histogram positive (uptrend)
    if (
      ema50 > ema200 &&
      rsi >= 30 &&
      rsi <= 50 &&
      macd &&
      macd.histogram > 0
    ) {
      positions[symbol] = {
        entryPrice: lastClose,
        stopLoss: lastClose - stopLossBuffer,
      };

      await sendSignalMessage(
        `🚀 BUY SIGNAL [${symbol}]\n` +
          `Price: ${lastClose.toFixed(5)}\n` +
          `RSI: ${rsi.toFixed(2)}\n` +
          `Support: ${support.toFixed(5)}\n` +
          `Resistance: ${resistance.toFixed(5)}\n` +
          `Stoploss: ${(lastClose - stopLossBuffer).toFixed(5)}\n` +
          `Type: ${type}`
      );
    }
  } else {
    // Sell: EMA50 < EMA200 OR RSI outside 25-55 OR price hits stoploss
    if (
      ema50 < ema200 ||
      rsi < 25 ||
      rsi > 55 ||
      lastClose <= positions[symbol].stopLoss
    ) {
      await sendSignalMessage(
        `📉 SELL/EXIT [${symbol}]\n` +
          `Price: ${lastClose.toFixed(5)}\n` +
          `RSI: ${rsi.toFixed(2)}\n` +
          `Support: ${support.toFixed(5)}\n` +
          `Resistance: ${resistance.toFixed(5)}\n` +
          `Type: ${type}`
      );
      positions[symbol] = null;
    } else {
      // Trailing stop loss update
      const newStopLoss = Math.max(
        positions[symbol].stopLoss,
        lastClose - stopLossBuffer
      );

      if (newStopLoss !== positions[symbol].stopLoss) {
        positions[symbol].stopLoss = newStopLoss;
      }
    }
  }
}

// FETCH FINNHUB NEWS
async function fetchFinnhubNews(category) {
  try {
    const url = `https://finnhub.io/api/v1/news?category=${category}&token=${FINNHUB_API_KEY}`;
    const response = await axios.get(url);
    return response.data || [];
  } catch (error) {
    console.error(
      `Error fetching Finnhub news for ${category}:`,
      error.message
    );
    return [];
  }
}

// SEND HIGH IMPACT NEWS (last 1 hour)
async function sendNews() {
  try {
    const url = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
    const res = await fetch(url);
    const news = await res.json();

    const oneHourAgo = Date.now() - 60 * 60 * 1000; // timestamp for 1 hour ago

    const filteredForex = news.filter(
      (n) => n.impact === "High" && new Date(n.date).getTime() >= oneHourAgo
    );

    if (filteredForex.length === 0) {
      await sendNewsMessage(
        "📢 No high impact news found for current forex pairs in the last 1 hour."
      );
      return;
    }

    let message = "📰 *High Impact News for Current Pairs (Last 1 Hour)*\n\n";

    filteredForex.forEach((n) => {
      const localDate = new Date(n.date).toLocaleString();
      message +=
        `🔸 [${n.country}] ${n.title}\n` +
        `🗓 Date: ${localDate}\n` +
        `⚠️ Impact: ${n.impact}\n` +
        `📊 Forecast: ${n.forecast}\n` +
        `📉 Previous: ${n.previous}\n\n`;
    });

    await sendNewsMessage(message);
  } catch (err) {
    console.log("News fetch error:", err.message);
  }
}

// SEND LATEST CATEGORY NEWS UPDATES (last 5 minutes)
async function sendNewsUpdates() {
  const categories = ["forex", "crypto"];
  const now = Date.now();
  const FIVE_MINUTES = 5 * 60 * 10000;

  let messages = [];

  for (const category of categories) {
    const news = await fetchFinnhubNews(category);

    const recentNews = news.filter(
      (item) => now - item.datetime * 1000 <= FIVE_MINUTES
    );

    if (recentNews.length > 0) {
      let message = `📰 *Latest ${category} News (last 5 minutes)*\n\n`;
      recentNews.slice(0, 5).forEach((item) => {
        message += `🔸 [${item.source}] ${item.headline}\n${item.url}\n\n`;
      });
      messages.push(message);
    }
  }

  if (messages.length === 0) {
    await sendUpdateMessage("📢 No recent news in the last 5 minutes.");
  } else {
    for (const msg of messages) {
      await sendUpdateMessage(msg);
    }
  }
}

// CRON JOBS

// Run every 5 minutes: send news & news updates
cron.schedule("*/20 * * * *", async () => {
  await sendNewsUpdates();
});
cron.schedule("*/30 * * * *", async () => {
  await sendNews();
});

// Run every 30 minutes: check market signals
cron.schedule("*/15 * * * *", async () => {
  const results = [];

  // Forex
  for (const pair of FOREX_PAIRS) {
    const data = await analyzeMarket(pair, "forex");
    if (data) results.push(data);
    await checkSignals(data);
  }
  for (const pair of INDEX_PAIRS) {
    const data = await analyzeMarket(pair, "indecis");
    if (data) results.push(data);
    await checkSignals(data);
  }

  // Crypto
  for (const pair of CRYPTO_PAIRS) {
    const data = await analyzeMarket(pair, "binance");
    if (data) results.push(data);
    await checkSignals(data);
  }

  function getRsiIcon(rsi) {
    if (rsi >= 70) return "🔥🔥"; // very high RSI - overbought
    if (rsi >= 60) return "🔥"; // high RSI
    if (rsi >= 50) return "⚡"; // medium-high RSI
    if (rsi >= 40) return "⚡⚡"; // medium-low RSI
    if (rsi >= 30) return "🌟"; // low RSI
    return "❄️"; // very low RSI - oversold
  }

  let rsiMessage = `📊 *RSI Update* — _${new Date().toLocaleString()}_\n\n`;

  results.forEach(({ symbol, rsi, lastClose, support, resistance }) => {
    const icon = getRsiIcon(rsi);
    rsiMessage += `*${symbol}*: \`${rsi.toFixed(
      2
    )}\` ${icon} | Price: \`${lastClose.toFixed(
      5
    )}\` | Support: \`${support.toFixed(
      5
    )}\` | Resistance: \`${resistance.toFixed(5)}\`\n\n`;
  });

  rsiMessage += `\n_⚠️ RSI (Relative Strength Index) helps identify overbought or oversold conditions._\n`;

  await sendSignalMessage(rsiMessage);
});

// STARTUP MESSAGE for signals bot
sendSignalMessage(
  "🤖 SUPER BOT Started! Monitoring Forex + BTC with EMA, RSI, ATR, MACD & Support/Resistance."
);
console.log("Super Bot running with combined power...");

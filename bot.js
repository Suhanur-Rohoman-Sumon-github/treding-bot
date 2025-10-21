import fetch from "node-fetch";
import { EMA, RSI } from "technicalindicators";
import { Telegraf } from "telegraf";

// --- CONFIG ---
const BOT_TOKEN = "8469977295:AAHZWhpCEzjOa2oO01snLZA7pJ5962dOS8A";
const CHAT_ID = 6960930765; // your chat ID

const CAPITAL = 300;
const RISK_PERCENT = 1.5;
const STOP_LOSS_PERCENT = 0.5;
const REWARD_RISK_RATIO = 3;

const bot = new Telegraf(BOT_TOKEN);
let position = null;

// --- BOT CONNECT ---
(async () => {
  try {
    await bot.telegram.sendMessage(CHAT_ID, "✅ Connected to CoinGecko feed!");
    console.log("Bot connected and running...");
  } catch (err) {
    console.error("Send error:", err.description || err.message);
  }
})();

// --- FETCH HOURLY CANDLES FROM COINGECKO ---
async function fetchCandles(days = 7) {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.prices || data.prices.length === 0) {
      console.error("Error fetching candles:", data);
      return [];
    }

    return data.prices.map((p) => ({
      time: new Date(p[0]),
      open: p[1],
      high: p[1],
      low: p[1],
      close: p[1],
    }));
  } catch (err) {
    console.error("Fetch candles failed:", err.message);
    return [];
  }
}



// --- INDICATORS ---
function calculateIndicators(closes) {
  // Shortened periods for more frequent signals
  const emaShort = EMA.calculate({ period: 10, values: closes });
  const emaLong = EMA.calculate({ period: 20, values: closes });
  const rsi = RSI.calculate({ period: 14, values: closes });
  return { emaShort, emaLong, rsi };
}

async function fetch24hStats() {
  try {
    const url =
      "https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&market_data=true";
    const res = await fetch(url);
    const data = await res.json();

    const high24h = data.market_data.high_24h.usd;
    const low24h = data.market_data.low_24h.usd;
    const current = data.market_data.current_price.usd;
    const priceChange24h = data.market_data.price_change_percentage_24h;
    console.log(high24h, low24h, current, priceChange24h);
    return { high24h, low24h, current, priceChange24h };
  } catch (err) {
    console.error("Fetch 24h stats failed:", err.message);
    return { high24h: 0, low24h: 0, current: 0, priceChange24h: 0 };
  }
}

// --- POSITION SIZE ---
function calculatePositionSize(entryPrice) {
  const riskAmount = (RISK_PERCENT / 100) * CAPITAL;
  const stopLossPrice = entryPrice * (1 - STOP_LOSS_PERCENT / 100);
  const riskPerUnit = entryPrice - stopLossPrice;
  const positionSize = riskAmount / riskPerUnit;
  const takeProfitPrice = entryPrice + riskPerUnit * REWARD_RISK_RATIO;

  return { positionSize, stopLossPrice, takeProfitPrice };
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
  console.log("Analyzing market data...");

  const candles = await fetchCandles();
  console.log("Fetched candles:", candles.length);

  if (candles.length === 0) {
    console.log("No candle data, skipping analyze...");
    return;
  }

  const closes = candles.map((c) => c.close);
  if (closes.length < 20) {
    console.log("Not enough data for indicators.");
    return;
  }

  const { emaShort, emaLong, rsi } = calculateIndicators(closes);
  const current = closes[closes.length - 1];
  const emaShortNow = emaShort[emaShort.length - 1];
  const emaLongNow = emaLong[emaLong.length - 1];
  const rsiNow = rsi[rsi.length - 1];

  const { high24h, low24h } = await fetch24hStats();

  const uptrend = emaShortNow > emaLongNow;

  if (!position) {
    if (uptrend && rsiNow < 70 && current > emaShortNow) {
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
RSI: ${rsiNow.toFixed(2)}
24h High: $${high24h}
24h Low: $${low24h}
Position size: ${positionSize.toFixed(6)} BTC
Stop Loss: $${stopLossPrice.toFixed(2)}
Take Profit: $${takeProfitPrice.toFixed(2)}`;
      await sendTelegramMessage(msg);
    } else {
      console.log(
        `No buy signal. RSI: ${rsiNow.toFixed(2)} | Price: $${current.toFixed(
          2
        )} | EMA10: ${emaShortNow.toFixed(2)} | EMA20: ${emaLongNow.toFixed(2)}`
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
console.log("📈 Bot started using CoinGecko hourly API...");

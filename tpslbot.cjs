// super-power-sl-tp-calculator.js
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

class SuperPowerSLTPCalculator {
  constructor(telegramToken, twelveDataApiKey) {
    this.bot = new TelegramBot(telegramToken, { polling: true });
    this.twelveDataApiKey = twelveDataApiKey;
    this.baseURL = "https://api.twelvedata.com";
    this.userSessions = new Map();
    this.setupBotHandlers();
  }

  setupBotHandlers() {
    // Start command
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      this.sendWelcomeMessage(chatId);
    });

    // Super calculate with advanced analysis
    this.bot.onText(/\/super (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const symbol = match[1].toUpperCase();
      await this.superCalculate(chatId, symbol);
    });

    // Quick calculate
    this.bot.onText(/\/sltp (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const symbol = match[1].toUpperCase();
      await this.quickCalculate(chatId, symbol);
    });

    // Custom entry calculation
    this.bot.onText(/\/calculate (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const params = match[1].split(" ");
      await this.customCalculate(chatId, params);
    });

    // Risk management
    this.bot.onText(/\/setrisk (.+)/, (msg, match) => {
      const chatId = msg.chat.id;
      const risk = parseFloat(match[1]);
      this.setUserRisk(chatId, risk);
    });

    this.bot.onText(/\/setcapital (.+)/, (msg, match) => {
      const chatId = msg.chat.id;
      const capital = parseFloat(match[1]);
      this.setUserCapital(chatId, capital);
    });

    this.bot.onText(/\/help/, (msg) => {
      const chatId = msg.chat.id;
      this.sendHelpMessage(chatId);
    });
  }

  setUserCapital(chatId, capital) {
    if (!this.userSessions.has(chatId)) {
      this.userSessions.set(chatId, {});
    }
    const user = this.userSessions.get(chatId);
    user.capital = capital;
    user.riskPercent = user.riskPercent || 1.0;

    this.bot.sendMessage(
      chatId,
      `💰 *Capital Set:* $${capital}\n` +
        `⚡ *Risk:* ${user.riskPercent}% per trade\n\n` +
        `*Now use:*\n` +
        `🎯 /super BTC - Advanced analysis\n` +
        `⚡ /sltp EURUSD - Quick SL/TP\n` +
        `📊 /calculate BTC LONG 45000 - Custom entry`,
      { parse_mode: "Markdown" }
    );
  }

  setUserRisk(chatId, riskPercent) {
    if (!this.userSessions.has(chatId)) {
      this.userSessions.set(chatId, {});
    }
    const user = this.userSessions.get(chatId);
    user.riskPercent = Math.min(Math.max(riskPercent, 0.1), 5.0);

    this.bot.sendMessage(
      chatId,
      `⚡ *Risk Updated:* ${riskPercent}% per trade\n\n` +
        `Lot sizes will be calculated based on this risk.`,
      { parse_mode: "Markdown" }
    );
  }

  sendWelcomeMessage(chatId) {
    const welcomeMsg = `
🎯 *SUPER POWER SL/TP CALCULATOR* 💪

*Advanced Features:*
✅ Multi-indicator analysis (RSI, MACD, ADX, ATR, EMA)
✅ Dynamic lot sizing based on your capital
✅ Smart SL/TP with current trend direction
✅ Volatility-adjusted position sizing

*Commands:*
🎯 /super BTC - Advanced analysis with all indicators
⚡ /sltp EURUSD - Quick SL/TP calculation
📊 /calculate SYMBOL DIRECTION ENTRY_PRICE

💵 /setcapital 100 - Set your capital
⚡ /setrisk 1 - Set risk percentage
🆘 /help - Help guide

*Examples:*
/super BTC
/sltp EURUSD
/calculate GOLD LONG 2050
/calculate BTC SHORT 45000

*Perfect for your TradingView signals!*
        `;

    this.bot.sendMessage(chatId, welcomeMsg, { parse_mode: "Markdown" });
  }

  async getForexFromTwelveData(symbol, interval = "15min", outputsize = 100) {
    try {
      const response = await axios.get(`${this.baseURL}/time_series`, {
        params: {
          symbol,
          interval,
          outputsize,
          apikey: this.twelveDataApiKey,
          format: "JSON",
        },
      });

      if (!response.data?.values) {
        console.log("TwelveData Error:", response.data);
        return null;
      }

      return response.data.values.reverse();
    } catch (error) {
      console.error(`Error fetching forex ${symbol}:`, error.message);
      return null;
    }
  }

  async getMarketData(symbol, interval = "15min", outputsize = 100) {
    try {
      let s = symbol.toUpperCase();

      // --- Check CRYPTO ---
      const cryptoList = [
        "BTC",
        "ETH",
        "SOL",
        "BNB",
        "XRP",
        "ADA",
        "DOGE",
        "AVAX",
      ];
      if (cryptoList.includes(s)) {
        console.log("📌 Using Binance API for crypto");
        return await this.getCryptoFromBinance(s + "USDT"); // BTCUSDT, ETHUSDT
      }

      // --- GOLD (XAUUSD) ---
      if (s === "GOLD" || s === "XAU") s = "XAU/USD";

      // --- FOREX ---
      if (s.includes("/")) {
        console.log("📌 Using TwelveData API for forex");
        return await this.getForexFromTwelveData(s);
      }

      // --- Default (index, stock) ---
      console.log("📌 Using TwelveData for default:", s);
      return await this.getForexFromTwelveData(s);
    } catch (error) {
      console.error(`Error fetching ${symbol}:`, error.message);
      return null;
    }
  }

  async getCryptoFromBinance(symbol) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=100`;

    const res = await axios.get(url);
    return res.data.map((k) => ({
      datetime: new Date(k[0]),
      open: k[1],
      high: k[2],
      low: k[3],
      close: k[4],
    }));
  }

  // ADVANCED TECHNICAL INDICATORS
  calculateEMA(data, period) {
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }

  calculateRSI(data, period) {
    let gains = 0,
      losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = data[i] - data[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    const rs = gains / Math.max(losses, 0.001); // Avoid division by zero
    return 100 - 100 / (1 + rs);
  }

  calculateMACD(data) {
    const ema12 = this.calculateEMA(data, 12);
    const ema26 = this.calculateEMA(data, 26);
    const macdLine = ema12 - ema26;
    const signalLine = this.calculateEMA(
      data
        .slice(-9)
        .map(
          (_, i) => this.calculateEMA(data, 12) - this.calculateEMA(data, 26)
        ),
      9
    );
    return { macdLine, signalLine, histogram: macdLine - signalLine };
  }

  calculateADX(highs, lows, closes, period) {
    // Simplified ADX calculation
    let plusDM = 0,
      minusDM = 0,
      tr = 0;

    for (let i = 1; i < period; i++) {
      const upMove = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];

      if (upMove > downMove && upMove > 0) plusDM += upMove;
      if (downMove > upMove && downMove > 0) minusDM += downMove;

      const trueRange = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      tr += trueRange;
    }

    const plusDI = (plusDM / tr) * 100;
    const minusDI = (minusDM / tr) * 100;
    const dx = (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;

    return dx;
  }

  calculateATR(highs, lows, closes) {
    let trueRanges = [];
    for (let i = 1; i < highs.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }
    return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
  }

  // DETERMINE TREND DIRECTION WITH MULTIPLE INDICATORS
  determineTrendDirection(analysis) {
    const { ema8, ema21, rsi, macd, adx } = analysis;

    let bullishScore = 0;
    let bearishScore = 0;

    // EMA Trend (40 points)
    if (ema8 > ema21) bullishScore += 40;
    else bearishScore += 40;

    // RSI Momentum (20 points)
    if (rsi > 50) bullishScore += 20;
    else bearishScore += 20;

    // MACD Momentum (20 points)
    if (macd.histogram > 0) bullishScore += 20;
    else bearishScore += 20;

    // ADX Trend Strength (20 points) - Only count if strong trend
    if (adx > 25) {
      if (bullishScore > bearishScore) bullishScore += 20;
      else bearishScore += 20;
    }

    // Determine final direction
    if (bullishScore > bearishScore + 10) return "STRONG_BULLISH";
    if (bullishScore > bearishScore) return "BULLISH";
    if (bearishScore > bullishScore + 10) return "STRONG_BEARISH";
    if (bearishScore > bullishScore) return "BEARISH";

    return "NEUTRAL";
  }

  // ADVANCED SL/TP CALCULATION
  calculateAdvancedSLTP(entryPrice, trendDirection, atr, analysis) {
    const { rsi, adx, volatilityRatio } = analysis;

    // Dynamic multipliers based on market conditions
    let slMultiplier, tpMultiplier;

    if (trendDirection.includes("STRONG")) {
      // Strong trend - wider SL/TP for bigger moves
      slMultiplier = trendDirection.includes("BULLISH") ? 1.2 : 1.3;
      tpMultiplier = 3.5; // Higher reward in strong trends
    } else if (adx > 25) {
      // Good trend strength
      slMultiplier = 1.5;
      tpMultiplier = 3.0;
    } else if (volatilityRatio > 2.0) {
      // High volatility - wider SL
      slMultiplier = 2.0;
      tpMultiplier = 2.5; // Lower RR in high volatility
    } else {
      // Normal conditions
      slMultiplier = 1.8;
      tpMultiplier = 2.8;
    }

    // RSI adjustment
    if (rsi > 70 || rsi < 30) {
      tpMultiplier *= 0.8; // Reduce TP in extreme RSI
    }

    if (trendDirection.includes("BULLISH")) {
      const sl = entryPrice - atr * slMultiplier;
      const tp = entryPrice + atr * tpMultiplier;
      return { sl, tp, type: "LONG" };
    } else {
      const sl = entryPrice + atr * slMultiplier;
      const tp = entryPrice - atr * tpMultiplier;
      return { sl, tp, type: "SHORT" };
    }
  }

  // SMART LOT SIZE CALCULATION
  calculateSmartLotSize(entryPrice, slPrice, riskPercent, capital, assetType) {
    const riskAmount = capital * (riskPercent / 100);
    const priceDifference = Math.abs(entryPrice - slPrice);

    let baseSize = riskAmount / priceDifference;

    // Asset-specific adjustments
    const adjustments = {
      forex: { multiplier: 10000, min: 0.01, max: 50 },
      crypto: { multiplier: 1, min: 0.0001, max: 1 },
      gold: { multiplier: 100, min: 0.01, max: 20 },
      indices: { multiplier: 10, min: 0.1, max: 10 },
    };

    const asset = this.getAssetType(assetType);
    const adjustment = adjustments[asset] || adjustments.crypto;

    let lotSize = baseSize * adjustment.multiplier;

    return Math.max(adjustment.min, Math.min(adjustment.max, lotSize));
  }

  getAssetType(symbol) {
    if (
      symbol.includes("EUR") ||
      symbol.includes("USD") ||
      symbol.includes("JPY") ||
      symbol.includes("GBP")
    ) {
      return "forex";
    } else if (symbol.includes("XAU") || symbol === "GOLD") {
      return "gold";
    } else if (["SPX", "DJI", "IXIC", "FTSE", "DAX", "N225"].includes(symbol)) {
      return "indices";
    } else {
      return "crypto";
    }
  }

  async superCalculate(chatId, symbol) {
    const user = this.userSessions.get(chatId);
    if (!user || !user.capital) {
      this.bot.sendMessage(
        chatId,
        "❌ Please set capital first: /setcapital 100"
      );
      return;
    }

    this.bot.sendMessage(chatId, `🔍 *Advanced analysis for ${symbol}...*`, {
      parse_mode: "Markdown",
    });

    const data = await this.getMarketData(symbol);
    if (!data) {
      this.bot.sendMessage(chatId, `❌ Could not fetch data for ${symbol}`);
      return;
    }

    const closes = data.map((candle) => parseFloat(candle.close));
    const highs = data.map((candle) => parseFloat(candle.high));
    const lows = data.map((candle) => parseFloat(candle.low));

    const currentPrice = closes[closes.length - 1];

    // CALCULATE ALL INDICATORS
    const ema8 = this.calculateEMA(closes, 8);
    const ema21 = this.calculateEMA(closes, 21);
    const ema50 = this.calculateEMA(closes, 50);
    const rsi = this.calculateRSI(closes, 14);
    const macd = this.calculateMACD(closes);
    const adx = this.calculateADX(highs, lows, closes, 14);
    const atr = this.calculateATR(highs, lows, closes);
    const volatilityRatio = (atr / currentPrice) * 100;

    const analysis = {
      ema8,
      ema21,
      ema50,
      rsi,
      macd,
      adx,
      atr,
      volatilityRatio,
    };

    // DETERMINE TREND DIRECTION
    const trendDirection = this.determineTrendDirection(analysis);

    if (trendDirection === "NEUTRAL") {
      this.bot.sendMessage(
        chatId,
        `⚠️ *No Clear Trend for ${symbol}*\n\n` +
          `Market is currently ranging/neutral.\n` +
          `Wait for clearer direction or use manual:\n` +
          `/calculate ${symbol} LONG ${currentPrice.toFixed(2)}`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    // CALCULATE ADVANCED SL/TP
    const { sl, tp, type } = this.calculateAdvancedSLTP(
      currentPrice,
      trendDirection,
      atr,
      analysis
    );

    // CALCULATE LOT SIZE
    const lotSize = this.calculateSmartLotSize(
      currentPrice,
      sl,
      user.riskPercent,
      user.capital,
      symbol
    );

    const riskAmount = user.capital * (user.riskPercent / 100);
    const potentialLoss = Math.abs(currentPrice - sl) * lotSize;
    const potentialProfit = Math.abs(tp - currentPrice) * lotSize;
    const riskReward = (potentialProfit / potentialLoss).toFixed(2);

    await this.sendSuperResult(chatId, {
      symbol,
      entry: currentPrice,
      direction: type,
      trendStrength: trendDirection,
      sl,
      tp,
      lotSize,
      riskAmount,
      potentialLoss,
      potentialProfit,
      riskReward,
      analysis,
      atr,
    });
  }

  async sendSuperResult(chatId, result) {
    const { analysis } = result;
    const trendEmoji = result.trendStrength.includes("STRONG") ? "🚀" : "📈";
    const directionEmoji = result.direction === "LONG" ? "🟢" : "🔴";

    const message = `
${trendEmoji} *SUPER POWER SL/TP ANALYSIS*

*Trade Setup:*
${directionEmoji} ${result.symbol} ${
      result.direction
    } | 💰 $${result.entry.toFixed(4)}
🎯 Trend: ${result.trendStrength.replace("_", " ")}
📊 Confidence: ${result.trendStrength.includes("STRONG") ? "HIGH" : "MEDIUM"}

*Technical Indicators:*
📈 EMA 8/21: ${analysis.ema8 > analysis.ema21 ? "BULLISH" : "BEARISH"}
🌀 RSI: ${analysis.rsi.toFixed(1)} ${
      analysis.rsi > 70
        ? "(Overbought)"
        : analysis.rsi < 30
        ? "(Oversold)"
        : "(Neutral)"
    }
📊 MACD: ${analysis.macd.histogram > 0 ? "BULLISH" : "BEARISH"}
💪 ADX: ${analysis.adx.toFixed(1)} ${
      analysis.adx > 25 ? "(Strong Trend)" : "(Weak Trend)"
    }
🌊 ATR: ${result.atr.toFixed(4)} (${analysis.volatilityRatio.toFixed(2)}%)

*Risk Management:*
🛡️ *Stop Loss:* $${result.sl.toFixed(4)}
🎯 *Take Profit:* $${result.tp.toFixed(4)}
⚖️ *Lot Size:* ${result.lotSize.toFixed(6)}
💸 *Risk Amount:* $${result.riskAmount.toFixed(2)}

*Trade Analysis:*
📈 *Risk/Reward:* ${result.riskReward}:1
💰 *Potential Loss:* $${result.potentialLoss.toFixed(2)}
💰 *Potential Profit:* $${result.potentialProfit.toFixed(2)}
📊 *Distance to SL:* ${Math.abs(result.entry - result.sl).toFixed(4)} (${(
      (Math.abs(result.entry - result.sl) / result.entry) *
      100
    ).toFixed(2)}%)

*Execution Instructions:*
1. Enter ${result.direction} at: $${result.entry.toFixed(4)}
2. Set Stop Loss at: $${result.sl.toFixed(4)}
3. Set Take Profit at: $${result.tp.toFixed(4)}
4. Use Lot Size: ${result.lotSize.toFixed(6)}

*Based on multi-indicator analysis for maximum accuracy!* ✅
        `;

    await this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }

  async quickCalculate(chatId, symbol) {
    const user = this.userSessions.get(chatId);
    if (!user || !user.capital) {
      this.bot.sendMessage(
        chatId,
        "❌ Please set capital first: /setcapital 100"
      );
      return;
    }

    this.bot.sendMessage(chatId, `⚡ Quick SL/TP for ${symbol}...`);

    const data = await this.getMarketData(symbol);
    if (!data) {
      this.bot.sendMessage(chatId, `❌ Could not fetch data for ${symbol}`);
      return;
    }

    const closes = data.map((candle) => parseFloat(candle.close));
    const highs = data.map((candle) => parseFloat(candle.high));
    const lows = data.map((candle) => parseFloat(candle.low));

    const currentPrice = closes[closes.length - 1];
    const atr = this.calculateATR(highs, lows, closes);

    // Simple trend detection
    const ema8 = this.calculateEMA(closes, 8);
    const ema21 = this.calculateEMA(closes, 21);
    const direction = ema8 > ema21 ? "LONG" : "SHORT";

    const { sl, tp, type } = this.calculateAdvancedSLTP(
      currentPrice,
      direction,
      atr,
      {
        rsi: 50,
        adx: 20,
        volatilityRatio: (atr / currentPrice) * 100,
      }
    );

    const lotSize = this.calculateSmartLotSize(
      currentPrice,
      sl,
      user.riskPercent,
      user.capital,
      symbol
    );

    const riskAmount = user.capital * (user.riskPercent / 100);
    const potentialLoss = Math.abs(currentPrice - sl) * lotSize;
    const potentialProfit = Math.abs(tp - currentPrice) * lotSize;
    const riskReward = (potentialProfit / potentialLoss).toFixed(2);

    const quickMessage = `
⚡ *QUICK SL/TP FOR ${symbol}*

*Trade Setup:*
💰 Entry: $${currentPrice.toFixed(4)}
📈 Direction: ${type}
🛡️ Stop Loss: $${sl.toFixed(4)}
🎯 Take Profit: $${tp.toFixed(4)}

*Position Size:*
⚖️ Lot Size: ${lotSize.toFixed(6)}
💸 Risk: $${riskAmount.toFixed(2)}
📈 R:R Ratio: ${riskReward}:1

*For advanced analysis use:* /super ${symbol}
        `;

    await this.bot.sendMessage(chatId, quickMessage, {
      parse_mode: "Markdown",
    });
  }

  async customCalculate(chatId, params) {
    const user = this.userSessions.get(chatId);
    if (!user || !user.capital) {
      this.bot.sendMessage(
        chatId,
        "❌ Please set capital first: /setcapital 100"
      );
      return;
    }

    if (params.length < 3) {
      this.bot.sendMessage(
        chatId,
        "❌ Usage: /calculate SYMBOL DIRECTION ENTRY_PRICE\n\n" +
          "Examples:\n" +
          "/calculate BTC LONG 45000\n" +
          "/calculate EURUSD SHORT 1.0950\n" +
          "/calculate GOLD LONG 2050"
      );
      return;
    }

    const symbol = params[0].toUpperCase();
    const direction = params[1].toUpperCase();
    const entryPrice = parseFloat(params[2]);

    if (!["LONG", "SHORT"].includes(direction)) {
      this.bot.sendMessage(chatId, "❌ Direction must be LONG or SHORT");
      return;
    }

    this.bot.sendMessage(
      chatId,
      `📊 Calculating SL/TP for ${symbol} ${direction} at ${entryPrice}...`
    );

    const data = await this.getMarketData(symbol);
    if (!data) {
      this.bot.sendMessage(chatId, `❌ Could not fetch data for ${symbol}`);
      return;
    }

    const highs = data.map((candle) => parseFloat(candle.high));
    const lows = data.map((candle) => parseFloat(candle.low));
    const closes = data.map((candle) => parseFloat(candle.close));

    const atr = this.calculateATR(highs, lows, closes);

    const { sl, tp, type } = this.calculateAdvancedSLTP(
      entryPrice,
      direction,
      atr,
      {
        rsi: 50,
        adx: 20,
        volatilityRatio: (atr / entryPrice) * 100,
      }
    );

    const lotSize = this.calculateSmartLotSize(
      entryPrice,
      sl,
      user.riskPercent,
      user.capital,
      symbol
    );

    const riskAmount = user.capital * (user.riskPercent / 100);
    const potentialLoss = Math.abs(entryPrice - sl) * lotSize;
    const potentialProfit = Math.abs(tp - entryPrice) * lotSize;
    const riskReward = (potentialProfit / potentialLoss).toFixed(2);

    const customMessage = `
📊 *CUSTOM SL/TP CALCULATION*

*Your Trade:*
💎 ${symbol} ${type} at $${entryPrice.toFixed(4)}
🛡️ Stop Loss: $${sl.toFixed(4)}
🎯 Take Profit: $${tp.toFixed(4)}

*Position Management:*
⚖️ Lot Size: ${lotSize.toFixed(6)}
💸 Risk Amount: $${riskAmount.toFixed(2)}
📈 Risk/Reward: ${riskReward}:1
💰 Potential P&L: -$${potentialLoss.toFixed(2)} / +$${potentialProfit.toFixed(
      2
    )}

*Ready to execute!* ✅
        `;

    await this.bot.sendMessage(chatId, customMessage, {
      parse_mode: "Markdown",
    });
  }

  sendHelpMessage(chatId) {
    const helpMsg = `
🆘 *SUPER POWER SL/TP CALCULATOR HELP*

*What I Do:*
- Advanced SL/TP calculation with multiple indicators
- Smart lot sizing based on your capital and risk
- Automatic trend direction detection
- Volatility-adjusted position sizing

*Technical Indicators Used:*
✅ EMA 8/21/50 - Trend direction
✅ RSI 14 - Momentum strength  
✅ MACD - Momentum confirmation
✅ ADX 14 - Trend strength
✅ ATR 14 - Volatility measurement

*Commands:*
🎯 /super SYMBOL - Advanced analysis (recommended)
⚡ /sltp SYMBOL - Quick SL/TP calculation
📊 /calculate SYMBOL DIRECTION ENTRY - Custom entry

💵 /setcapital AMOUNT - Set your capital
⚡ /setrisk PERCENT - Set risk percentage (0.1-5%)

*Examples:*
🎯 /super BTC - Full analysis for Bitcoin
⚡ /sltp EURUSD - Quick Forex SL/TP
📊 /calculate GOLD LONG 2050 - Custom gold trade

*Perfect companion for your TradingView bot!*
        `;

    this.bot.sendMessage(chatId, helpMsg, { parse_mode: "Markdown" });
  }
}

// Start the super power bot
function startSuperBot() {
  const telegramToken = "8469977295:AAHZWhpCEzjOa2oO01snLZA7pJ5962dOS8A";
  const twelveDataApiKey = "d6d3d69587d74a969c948d302fe214f2";

  if (!telegramToken || !twelveDataApiKey) {
    console.error("❌ Missing environment variables");
    process.exit(1);
  }

  const bot = new SuperPowerSLTPCalculator(telegramToken, twelveDataApiKey);
  console.log("🚀 SUPER POWER SL/TP Calculator Started!");
  console.log("📊 Multi-Indicator Analysis: ACTIVE");
  console.log("💪 Smart Lot Sizing: ACTIVE");
  console.log("🤖 Bot is listening on Telegram...");
}

// Export for use
module.exports = { SuperPowerSLTPCalculator };

// Start if run directly
if (require.main === module) {
  startSuperBot();
}

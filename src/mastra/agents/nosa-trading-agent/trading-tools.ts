import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { Hyperliquid } from "hyperliquid";
import { hyperliquidConfig } from "../../config";

interface FearGreedResponse {
  data: Array<{
    value: string;
    value_classification: string;
    timestamp: string;
    time_until_update?: string;
  }>;
}

interface UserSession {
  privateKey: string;
  walletAddress: string;
  expiresAt: number;
  hyperliquidClient: Hyperliquid;
}

interface CandleData {
  t: number;
  T: number;
  s: string;
  i: string;
  o: number;
  c: number;
  h: number;
  l: number;
  v: number;
  n: number;
}

interface MarketMetrics {
  price: number;
  change24h: number;
  volume24h: number;
  rsi: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  avgVolatility: number;
}

const userSessions = new Map<string, UserSession>();
const SESSION_TIMEOUT = 60 * 60 * 1000;

function getSessionId(context: any): string {
  return context.userId || context.sessionId || context.conversationId || 'default-session';
}

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [sessionId, session] of userSessions.entries()) {
    if (session.expiresAt < now) {
      userSessions.delete(sessionId);
    }
  }
}

function getAuthenticatedClient(context: any): Hyperliquid | null {
  cleanupExpiredSessions();
  const sessionId = getSessionId(context);
  const session = userSessions.get(sessionId);
  
  if (!session || session.expiresAt < Date.now()) {
    return null;
  }
  
  return session.hyperliquidClient;
}

function createHyperliquidClient(privateKey?: string): Hyperliquid {
  return new Hyperliquid({
    privateKey,
    testnet: hyperliquidConfig.testnet || false,
    enableWs: false,
  });
}

function getDisplaySymbol(coinName: string): string {
  if (coinName.endsWith('-PERP')) return coinName;
  return `${coinName}-PERP`;
}

function getApiCoin(symbol: string): string {
  return symbol.replace('-PERP', '');
}

function getAccountRiskProfile(accountBalance: number): { usagePct: number; riskPct: number } {
  if (accountBalance < 10) return { usagePct: 85, riskPct: 85 };      // Aggressive for micro accounts
  if (accountBalance < 50) return { usagePct: 50, riskPct: 50 };      // Moderate for small accounts  
  if (accountBalance < 500) return { usagePct: 20, riskPct: 20 };     // Conservative for medium accounts
  return { usagePct: 5, riskPct: 2 };                                 // Very conservative for large accounts
}

function getPriceFromAllMids(allMids: any, symbol: string): number {
  if (!allMids || typeof allMids !== 'object') {
    console.error('Invalid getAllMids response:', allMids);
    return 0;
  }
  
  const coin = getApiCoin(symbol);
  const displaySymbol = getDisplaySymbol(symbol);
  
  if (allMids[coin] !== undefined) {
    const price = parseFloat(allMids[coin]);
    if (!isNaN(price) && price > 0) return price;
  }
  
  if (allMids[displaySymbol] !== undefined) {
    const price = parseFloat(allMids[displaySymbol]);
    if (!isNaN(price) && price > 0) return price;
  }
  
  console.error(`No price found for ${symbol}. Coin: ${coin}. Available:`, Object.keys(allMids).slice(0, 10));
  return 0;
}

// Helper function to get lot size and tick size for proper rounding
async function getAssetSpecs(client: Hyperliquid, symbol: string): Promise<{
  lotSize: number;
  tickSize: number;
  minOrderValue: number;
}> {
  try {
    const meta = await client.info.perpetuals.getMeta();
    const coin = getApiCoin(symbol);
    
    const asset = meta.universe.find((u: any) => u.name === coin);
    if (!asset) {
      console.warn(`Asset specs not found for ${symbol}, using defaults`);
      return { lotSize: 0.0001, tickSize: 0.0001, minOrderValue: 10 };
    }
    
    // Parse lot size from szDecimals (size decimals)
    let lotSize = 0.0001; // default
    if (asset.szDecimals && typeof asset.szDecimals === 'number' && asset.szDecimals > 0) {
      lotSize = 1 / Math.pow(10, asset.szDecimals);
    }
    
    // Parse tick size from price decimals or use sensible default
    let tickSize = 0.0001; // default
    if (asset.maxLeverage && typeof asset.maxLeverage === 'number') {
      // Higher leverage assets typically have smaller tick sizes
      if (asset.maxLeverage >= 50) {
        tickSize = 0.00001; // 5 decimals for high leverage
      } else if (asset.maxLeverage >= 20) {
        tickSize = 0.0001;  // 4 decimals for medium leverage
      } else {
        tickSize = 0.001;   // 3 decimals for low leverage
      }
    }
    
    console.log(`Asset specs for ${symbol}: lotSize=${lotSize}, tickSize=${tickSize}, maxLev=${asset.maxLeverage}`);
    return { 
      lotSize,
      tickSize,
      minOrderValue: 10 
    };
  } catch (error) {
    console.warn(`Failed to get asset specs for ${symbol}:`, error);
    return { lotSize: 0.0001, tickSize: 0.0001, minOrderValue: 10 };
  }
}

// Round size to lot size
function roundToLotSize(size: number, lotSize: number): number {
  if (lotSize <= 0) return size;
  return Math.round(size / lotSize) * lotSize;
}

// Round price to tick size
function roundToTickSize(price: number, tickSize: number): number {
  if (tickSize <= 0) return price;
  return Math.round(price / tickSize) * tickSize;
}

function calculateTechnicalIndicators(candles: CandleData[]): {
  rsi: number;
  sma: number;
  ema: number;
  bollinger: { upper: number; middle: number; lower: number };
  macd: { macd: number; signal: number; histogram: number };
} {
  if (candles.length < 20) return {
    rsi: 50,
    sma: candles[candles.length - 1]?.c || 0,
    ema: candles[candles.length - 1]?.c || 0,
    bollinger: { upper: 0, middle: 0, lower: 0 },
    macd: { macd: 0, signal: 0, histogram: 0 }
  };

  const closes = candles.map(c => c.c);
  const period = 14;
  
  const gains = [];
  const losses = [];
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  const sma = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  let ema = closes[0];
  const multiplier = 2 / (20 + 1);
  for (let i = 1; i < closes.length; i++) {
    ema = (closes[i] * multiplier) + (ema * (1 - multiplier));
  }

  const std = Math.sqrt(closes.slice(-20).reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / 20);
  const bollinger = {
    upper: sma + (std * 2),
    middle: sma,
    lower: sma - (std * 2)
  };

  const ema12 = closes.slice(-12).reduce((a, b) => a + b, 0) / 12;
  const ema26 = closes.slice(-26).reduce((a, b) => a + b, 0) / 26;
  const macd = ema12 - ema26;
  const signal = macd;
  const histogram = macd - signal;

  return { rsi, sma, ema, bollinger, macd: { macd, signal, histogram } };
}

function calculateWinningMetrics(candles: CandleData[]): {
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  avgVolatility: number;
} {
  if (candles.length < 30) return { winRate: 50, sharpeRatio: 0, maxDrawdown: 0, avgVolatility: 0 };

  const returns = [];
  const volatilities = [];
  
  for (let i = 1; i < candles.length; i++) {
    const ret = (candles[i].c - candles[i - 1].c) / candles[i - 1].c;
    returns.push(ret);
    
    const volatility = Math.abs(candles[i].h - candles[i].l) / candles[i].c;
    volatilities.push(volatility);
  }

  const winningReturns = returns.filter(r => r > 0);
  const winRate = (winningReturns.length / returns.length) * 100;
  
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdReturn = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
  const sharpeRatio = stdReturn === 0 ? 0 : (avgReturn * Math.sqrt(252)) / (stdReturn * Math.sqrt(252));
  
  let maxDrawdown = 0;
  let peak = candles[0].c;
  for (const candle of candles) {
    if (candle.c > peak) peak = candle.c;
    const drawdown = (peak - candle.c) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  const avgVolatility = volatilities.reduce((a, b) => a + b, 0) / volatilities.length;

  return { winRate, sharpeRatio, maxDrawdown: maxDrawdown * 100, avgVolatility: avgVolatility * 100 };
}

async function getEnhancedMarketData(client: Hyperliquid, coin: string): Promise<MarketMetrics> {
  try {
    console.log(`Fetching enhanced data for ${coin}...`);
    
    const endTime = Date.now();
    const startTime = endTime - (7 * 24 * 60 * 60 * 1000);
    
    const candles = await client.info.getCandleSnapshot(coin, "1h", startTime, endTime) as CandleData[];
    
    if (!candles || candles.length === 0) {
      console.warn(`No candles for ${coin}`);
      return { price: 0, change24h: 0, volume24h: 0, rsi: 50, winRate: 50, sharpeRatio: 0, maxDrawdown: 0, avgVolatility: 0 };
    }

    const latest = candles[candles.length - 1];
    const dayAgo = candles[candles.length - 24] || candles[0];
    
    const price = latest.c;
    const change24h = ((latest.c - dayAgo.o) / dayAgo.o) * 100;
    const volume24h = candles.slice(-24).reduce((sum, c) => sum + c.v, 0);
    
    const technicals = calculateTechnicalIndicators(candles);
    const winMetrics = calculateWinningMetrics(candles);
    
    console.log(`${coin}: Price=${price}, Change=${change24h.toFixed(2)}%, WinRate=${winMetrics.winRate.toFixed(1)}%`);
    
    return {
      price,
      change24h,
      volume24h,
      rsi: technicals.rsi,
      ...winMetrics
    };
  } catch (error) {
    console.error(`Error fetching data for ${coin}:`, error);
    return { price: 0, change24h: 0, volume24h: 0, rsi: 50, winRate: 50, sharpeRatio: 0, maxDrawdown: 0, avgVolatility: 0 };
  }
}

function calculateAdvancedOpportunityScore(data: MarketMetrics, fearGreedIndex: number): number {
  let score = 0;
  
  const winRateScore = Math.min(data.winRate, 100);
  score += winRateScore * 0.4;
  
  const sharpeScore = Math.max(0, Math.min(100, (data.sharpeRatio + 2) * 25));
  score += sharpeScore * 0.2;
  
  let momentumScore = 50;
  if (data.rsi > 70) momentumScore += 15;
  else if (data.rsi < 30) momentumScore += 20;
  else if (data.rsi > 45 && data.rsi < 55) momentumScore -= 10;
  
  if (Math.abs(data.change24h) > 5) momentumScore += 15;
  score += Math.min(100, momentumScore) * 0.2;
  
  const volumeScore = Math.min(100, (data.volume24h / 1000000) * 10);
  score += volumeScore * 0.1;
  
  let sentimentScore = 0;
  if (fearGreedIndex > 75 && data.rsi > 65) sentimentScore = 80;
  else if (fearGreedIndex < 25 && data.rsi < 35) sentimentScore = 70;
  else if (Math.abs(fearGreedIndex - 50) > 20) sentimentScore = 30;
  score += sentimentScore * 0.1;
  
  if (data.maxDrawdown > 50) score *= 0.8;
  
  return Math.max(0, Math.min(100, score));
}

function identifyRealPatterns(candles: CandleData[], symbol: string): Array<{
  pattern: string;
  timeframe: string;
  confidence: number;
  signal: "bullish" | "bearish" | "neutral";
  description: string;
  entry?: number;
  target?: number;
  stopLoss?: number;
}> {
  if (candles.length < 50) return [];
  
  const patterns: Array<{
    pattern: string;
    timeframe: string;
    confidence: number;
    signal: "bullish" | "bearish" | "neutral";
    description: string;
    entry?: number;
    target?: number;
    stopLoss?: number;
  }> = [];
  
  const closes = candles.map(c => c.c);
  const highs = candles.map(c => c.h);
  const lows = candles.map(c => c.l);
  const volumes = candles.map(c => c.v);
  
  const currentPrice = closes[closes.length - 1];
  const recentHigh = Math.max(...highs.slice(-20));
  const recentLow = Math.min(...lows.slice(-20));
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  
  const highPoints = [];
  const lowPoints = [];
  for (let i = 10; i < candles.length - 10; i++) {
    const isHigh = highs[i] > highs[i-5] && highs[i] > highs[i+5];
    const isLow = lows[i] < lows[i-5] && lows[i] < lows[i+5];
    if (isHigh) highPoints.push({ index: i, price: highs[i] });
    if (isLow) lowPoints.push({ index: i, price: lows[i] });
  }
  
  if (highPoints.length >= 2 && lowPoints.length >= 2) {
    const recentHighs = highPoints.slice(-2);
    const recentLows = lowPoints.slice(-2);
    
    const highSlope = (recentHighs[1].price - recentHighs[0].price) / (recentHighs[1].index - recentHighs[0].index);
    const lowSlope = (recentLows[1].price - recentLows[0].price) / (recentLows[1].index - recentLows[0].index);
    
    if (highSlope > 0 && lowSlope > 0 && lowSlope > highSlope && recentVolume < avgVolume * 0.8) {
      patterns.push({
        pattern: "RISING WEDGE",
        timeframe: "1h",
        confidence: 78,
        signal: "bearish" as const,
        description: "Rising wedge with volume decline - bearish breakdown expected",
        entry: currentPrice * 0.998,
        target: currentPrice * 0.92,
        stopLoss: currentPrice * 1.025,
      });
    }
  }
  
  if (highPoints.length >= 2) {
    const lastTwo = highPoints.slice(-2);
    const priceDiff = Math.abs(lastTwo[1].price - lastTwo[0].price) / lastTwo[0].price;
    if (priceDiff < 0.02 && currentPrice < recentHigh * 0.95) {
      patterns.push({
        pattern: "DOUBLE TOP",
        timeframe: "1h",
        confidence: 72,
        signal: "bearish" as const,
        description: "Double top formation with rejection - bearish reversal signal",
        entry: currentPrice * 0.997,
        target: currentPrice * 0.90,
        stopLoss: currentPrice * 1.03,
      });
    }
  }
  
  const shortMA = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const longMA = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const priceAboveMA = currentPrice > longMA * 1.05;
  const consolidation = (recentHigh - recentLow) / currentPrice < 0.04;
  
  if (priceAboveMA && consolidation && recentVolume > avgVolume) {
    patterns.push({
      pattern: "BULLISH FLAG",
      timeframe: "1h",
      confidence: 69,
      signal: "bullish" as const,
      description: "Bullish flag consolidation with volume - continuation expected",
      entry: currentPrice * 1.002,
      target: currentPrice * 1.12,
      stopLoss: currentPrice * 0.975,
    });
  }
  
  const resistanceLevel = recentHigh;
  const supportTests = lows.slice(-10).filter(low => Math.abs(low - recentLow) / recentLow < 0.01).length;
  
  if (supportTests >= 2 && currentPrice < resistanceLevel * 0.98) {
    patterns.push({
      pattern: "DESCENDING TRIANGLE",
      timeframe: "1h",
      confidence: 75,
      signal: "bearish" as const,
      description: "Descending triangle with horizontal support - breakdown likely",
      entry: currentPrice * 0.998,
      target: currentPrice * 0.88,
      stopLoss: currentPrice * 1.03,
    });
  }
  
  console.log(`Found ${patterns.length} patterns for ${symbol}`);
  return patterns;
}

function analyzeSetup(rsi: number, change24h: number, fearGreedIndex: number, winRate: number) {
  if (winRate > 70 && rsi > 70 && fearGreedIndex > 60) {
    return {
      type: "High Win Rate Bearish Reversal",
      direction: "SHORT",
      reasoning: `${winRate.toFixed(1)}% win rate with overbought conditions and greed - premium contrarian setup`,
      confidence: 85,
    };
  } else if (winRate > 65 && rsi < 30 && fearGreedIndex < 40) {
    return {
      type: "High Win Rate Bullish Reversal", 
      direction: "LONG",
      reasoning: `${winRate.toFixed(1)}% win rate with oversold conditions and fear - strong reversal signal`,
      confidence: 80,
    };
  } else if (winRate > 60 && Math.abs(change24h) > 6) {
    return {
      type: "High Win Rate Momentum",
      direction: change24h > 0 ? "LONG" : "SHORT",
      reasoning: `${winRate.toFixed(1)}% win rate with strong momentum - trend continuation likely`,
      confidence: 75,
    };
  } else if (winRate > 55) {
    return {
      type: "Consistent Performer",
      direction: rsi > 50 ? "LONG" : "SHORT",
      reasoning: `${winRate.toFixed(1)}% win rate - reliable performer with decent setup`,
      confidence: 65,
    };
  } else {
    return {
      type: "Low Probability Setup",
      direction: "NEUTRAL",
      reasoning: `${winRate.toFixed(1)}% win rate - wait for better opportunity`,
      confidence: 40,
    };
  }
}

function generateAdvancedSignals(data: MarketMetrics, fearGreedIndex: number): string[] {
  const signals = [];
  
  if (data.winRate > 70) signals.push(`🏆 High Win Rate: ${data.winRate.toFixed(1)}%`);
  if (data.sharpeRatio > 1) signals.push(`📈 Strong Sharpe: ${data.sharpeRatio.toFixed(2)}`);
  if (data.rsi < 30) signals.push("🔴 RSI Oversold");
  if (data.rsi > 70) signals.push("🔴 RSI Overbought");
  if (Math.abs(data.change24h) > 8) signals.push("⚡ High Volatility");
  if (data.change24h > 5) signals.push("🟢 Strong Bullish Move");
  if (data.change24h < -5) signals.push("🔴 Strong Bearish Move");
  if (fearGreedIndex > 75) signals.push("😰 Extreme Greed");
  if (fearGreedIndex < 25) signals.push("😨 Extreme Fear");
  if (data.maxDrawdown < 10) signals.push("🛡️ Low Risk Profile");
  if (data.winRate > 60 && fearGreedIndex > 65) signals.push("⚠ Premium Contrarian Setup");
  
  return signals;
}

export const authenticateUser = createTool({
  id: "authenticate-user",
  description: "Authenticate user with Hyperliquid API credentials",
  inputSchema: z.object({
    command: z.string().describe("Auth command: 'auth [privateKey] [walletAddress]'"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    status: z.string(),
    message: z.string(),
    accountInfo: z.object({
      walletAddress: z.string(),
      accountValue: z.number(),
      availableMargin: z.number(),
    }).optional(),
  }),
  execute: async ({ context }) => {
    const sessionId = getSessionId(context);
    const { command } = context;
    
    try {
      const parts = command.trim().split(/\s+/);
      
      if (parts[0].toLowerCase() !== 'auth' || parts.length !== 3) {
        return {
          success: false,
          status: "INVALID_FORMAT",
          message: "Format: auth [privateKey] [walletAddress]\n\nGet credentials at: https://app.hyperliquid.xyz/API",
        };
      }
      
      const privateKey = parts[1];
      const walletAddress = parts[2];
      
      if (!privateKey.match(/^0x[0-9a-fA-F]{64}$/)) {
        return {
          success: false,
          status: "INVALID_PRIVATE_KEY",
          message: "Private key must be 64 hex characters with 0x prefix",
        };
      }
      
      if (!walletAddress.match(/^0x[0-9a-fA-F]{40}$/)) {
        return {
          success: false,
          status: "INVALID_WALLET_ADDRESS", 
          message: "Wallet address must be 40 hex characters with 0x prefix",
        };
      }
      
      const client = createHyperliquidClient(privateKey);
      
      const userState = await client.info.perpetuals.getClearinghouseState(walletAddress);
      
      const expiresAt = Date.now() + SESSION_TIMEOUT;
      userSessions.set(sessionId, {
        privateKey,
        walletAddress,
        expiresAt,
        hyperliquidClient: client,
      });
      
      cleanupExpiredSessions();
      
      const accountValue = parseFloat(userState.marginSummary.accountValue);
      const totalMarginUsed = parseFloat(userState.marginSummary.totalMarginUsed);
      const availableMargin = accountValue - totalMarginUsed;
      
      console.log(`Auth successful for ${walletAddress}, Account: $${accountValue}`);
      
      return {
        success: true,
        status: "AUTHENTICATED",
        message: `✅ Authentication successful!\n\n💰 Account Value: ${accountValue.toLocaleString()}\n📊 Available Margin: ${availableMargin.toLocaleString()}\n⏰ Session expires in 60 minutes\n\nReady to execute trades!`,
        accountInfo: {
          walletAddress,
          accountValue,
          availableMargin,
        },
      };
      
    } catch (error) {
      console.error('Authentication error:', error);
      return {
        success: false,
        status: "CONNECTION_FAILED",
        message: `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\nCheck: API wallet authorized, correct addresses, network connection`,
      };
    }
  },
});

export const getAllAvailableSymbols = createTool({
  id: "get-available-symbols",
  description: "Get all available trading symbols from Hyperliquid",
  inputSchema: z.object({}),
  outputSchema: z.object({
    symbols: z.array(z.string()),
    count: z.number(),
  }),
  execute: async ({ context }) => {
    try {
      const client = getAuthenticatedClient(context) || createHyperliquidClient();
      const meta = await client.info.perpetuals.getMeta();
      
      const symbols = meta.universe.map((asset: any) => getDisplaySymbol(asset.name));
      
      console.log(`Found ${symbols.length} available symbols`);
      return { symbols, count: symbols.length };
    } catch (error) {
      console.error('Failed to fetch symbols:', error);
      throw new Error(`Failed to fetch available symbols: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

export const findTopOpportunities = createTool({
  id: "find-top-opportunities",
  description: "Find top 5 trading opportunities ranked by winning probability and advanced metrics",
  inputSchema: z.object({
    maxSymbols: z.number().optional().default(30).describe("Maximum symbols to scan"),
    minVolume: z.number().optional().default(2000000).describe("Minimum 24h volume filter"),
    topCount: z.number().optional().default(5).describe("Number of top opportunities to return"),
  }),
  outputSchema: z.object({
    opportunities: z.array(z.object({
      symbol: z.string(),
      score: z.number(),
      price: z.number(),
      change24h: z.number(),
      volume: z.number(),
      rsi: z.number(),
      winRate: z.number(),
      sharpeRatio: z.number(),
      maxDrawdown: z.number(),
      signals: z.array(z.string()),
      setup: z.object({
        type: z.string(),
        direction: z.string(),
        reasoning: z.string(),
        confidence: z.number(),
      }),
    })),
    scanSummary: z.object({
      totalScanned: z.number(),
      opportunitiesFound: z.number(),
      avgWinRate: z.number(),
      topWinRate: z.number(),
    }),
  }),
  execute: async ({ context }) => {
    const { maxSymbols, minVolume, topCount } = context;
    
    try {
      console.log(`Scanning ${maxSymbols} symbols for top ${topCount} opportunities...`);
      
      const client = getAuthenticatedClient(context) || createHyperliquidClient();
      
      const [meta, allMids, fearGreedResponse] = await Promise.all([
        client.info.perpetuals.getMeta(),
        client.info.getAllMids(),
        fetch("https://api.alternative.me/fng/")
      ]);
      
      const fearGreedData: FearGreedResponse = await fearGreedResponse.json();
      const fearGreedIndex = parseInt(fearGreedData.data[0].value);
      
      console.log(`Fear & Greed Index: ${fearGreedIndex}`);
      
      const allSymbols = meta.universe.slice(0, maxSymbols).map((asset: any) => asset.name);
      const opportunities = [];
      
      for (const coin of allSymbols) {
        try {
          const displaySymbol = getDisplaySymbol(coin);
          const price = getPriceFromAllMids(allMids, displaySymbol);
          
          if (price === 0) continue;
          
          const marketData = await getEnhancedMarketData(client, coin);
          
          if (marketData.volume24h < minVolume) continue;
          
          const score = calculateAdvancedOpportunityScore(marketData, fearGreedIndex);
          
          if (score > 55) {
            const setup = analyzeSetup(marketData.rsi, marketData.change24h, fearGreedIndex, marketData.winRate);
            
            opportunities.push({
              symbol: displaySymbol,
              score,
              price: marketData.price,
              change24h: marketData.change24h,
              volume: marketData.volume24h,
              rsi: Math.round(marketData.rsi * 100) / 100,
              winRate: Math.round(marketData.winRate * 100) / 100,
              sharpeRatio: Math.round(marketData.sharpeRatio * 100) / 100,
              maxDrawdown: Math.round(marketData.maxDrawdown * 100) / 100,
              signals: generateAdvancedSignals(marketData, fearGreedIndex),
              setup,
            });
          }
        } catch (error) {
          console.warn(`Error analyzing ${coin}:`, error);
          continue;
        }
      }
      
      opportunities.sort((a, b) => {
        const winRateDiff = b.winRate - a.winRate;
        return Math.abs(winRateDiff) > 5 ? winRateDiff : b.score - a.score;
      });
      
      const topOpportunities = opportunities.slice(0, topCount);
      
      const avgWinRate = opportunities.length > 0 
        ? opportunities.reduce((sum, opp) => sum + opp.winRate, 0) / opportunities.length 
        : 0;
      
      const topWinRate = topOpportunities.length > 0 ? topOpportunities[0].winRate : 0;
      
      console.log(`Found ${opportunities.length} opportunities, top win rate: ${topWinRate.toFixed(1)}%`);
      
      return {
        opportunities: topOpportunities,
        scanSummary: {
          totalScanned: allSymbols.length,
          opportunitiesFound: opportunities.length,
          avgWinRate: Math.round(avgWinRate * 100) / 100,
          topWinRate: Math.round(topWinRate * 100) / 100,
        },
      };
    } catch (error) {
      console.error('Opportunity scanning failed:', error);
      throw new Error(`Opportunity scanning failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

export const analyzeMarkets = createTool({
  id: "analyze-markets",
  description: "Analyze current market conditions with enhanced winning rate metrics",
  inputSchema: z.object({
    symbols: z.array(z.string()).optional().default([]),
    timeframe: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]).optional().default("1h"),
    useTopOpportunities: z.boolean().optional().default(true),
  }),
  outputSchema: z.object({
    marketOverview: z.object({
      totalVolume: z.number(),
      dominantTrend: z.string(),
      volatilityLevel: z.string(),
      fearGreedIndex: z.number(),
      sentiment: z.string(),
      avgWinRate: z.number(),
    }),
    assets: z.array(z.object({
      symbol: z.string(),
      price: z.number(),
      change24h: z.number(),
      volume: z.number(),
      fundingRate: z.number(),
      technicals: z.object({
        rsi: z.number(),
        trend: z.string(),
        momentum: z.string(),
      }),
      winRate: z.number(),
      opportunityScore: z.number().optional(),
      setup: z.object({
        type: z.string(),
        direction: z.string(),
        reasoning: z.string(),
        confidence: z.number(),
      }).optional(),
    })),
    recommendations: z.array(z.string()),
  }),
  execute: async ({ context, runtimeContext }) => {
    const { symbols, timeframe, useTopOpportunities } = context;
    
    try {
      console.log(`Analyzing markets with timeframe: ${timeframe}`);
      
      const client = getAuthenticatedClient(context) || createHyperliquidClient();
      
      const fearGreedResponse = await fetch("https://api.alternative.me/fng/");
      const fearGreedData: FearGreedResponse = await fearGreedResponse.json();
      const fearGreedIndex = parseInt(fearGreedData.data[0].value);
      const sentiment = fearGreedData.data[0].value_classification;

      let validAssets = [];
      
      if (useTopOpportunities && symbols.length === 0) {
        console.log('Using top opportunities analysis...');
        const topOpportunities = await findTopOpportunities.execute({
          context: { maxSymbols: 25, minVolume: 3000000, topCount: 8 },
          runtimeContext
        });
        
        validAssets = topOpportunities.opportunities.map(opp => ({
          symbol: opp.symbol,
          price: opp.price,
          change24h: opp.change24h,
          volume: opp.volume,
          fundingRate: 0,
          technicals: {
            rsi: opp.rsi,
            trend: opp.rsi > 60 ? "bullish" : opp.rsi < 40 ? "bearish" : "neutral",
            momentum: Math.abs(opp.change24h) > 3 ? "strong" : "weak",
          },
          winRate: opp.winRate,
          opportunityScore: opp.score,
          setup: opp.setup,
        }));
      } else {
        const targetSymbols = symbols.length > 0 ? symbols : ["BTC", "ETH", "SOL"];
        console.log(`Analyzing specific symbols: ${targetSymbols.join(', ')}`);
        
        const allMids = await client.info.getAllMids();
        
        const assets = await Promise.all(targetSymbols.map(async (symbol) => {
          const displaySymbol = getDisplaySymbol(symbol);
          const coin = getApiCoin(symbol);
          
          const price = getPriceFromAllMids(allMids, displaySymbol);
          
          if (price === 0) {
            console.warn(`Skipping ${displaySymbol} - no price data`);
            return null;
          }
          
          const marketData = await getEnhancedMarketData(client, coin);
          
          const trend = marketData.rsi > 60 ? "bullish" : marketData.rsi < 40 ? "bearish" : "neutral";
          const momentum = Math.abs(marketData.change24h) > 3 ? "strong" : "weak";
          
          const setup = analyzeSetup(marketData.rsi, marketData.change24h, fearGreedIndex, marketData.winRate);
          const opportunityScore = calculateAdvancedOpportunityScore(marketData, fearGreedIndex);
          
          return {
            symbol: displaySymbol,
            price: marketData.price,
            change24h: marketData.change24h,
            volume: marketData.volume24h,
            fundingRate: 0,
            technicals: {
              rsi: Math.round(marketData.rsi * 100) / 100,
              trend,
              momentum,
            },
            winRate: Math.round(marketData.winRate * 100) / 100,
            opportunityScore,
            setup,
          };
        }));
        
        validAssets = assets.filter(asset => asset !== null);
      }
      
      if (validAssets.length === 0) {
        throw new Error("No valid asset data found. Check symbol names and API connection.");
      }
      
      const totalVolume = validAssets.reduce((sum, asset) => sum + asset.volume, 0);
      const bullishAssets = validAssets.filter(a => a.technicals.trend === "bullish").length;
      const bearishAssets = validAssets.filter(a => a.technicals.trend === "bearish").length;
      const avgWinRate = validAssets.reduce((sum, a) => sum + a.winRate, 0) / validAssets.length;
      
      const dominantTrend = bullishAssets > bearishAssets ? "bullish" : 
                           bearishAssets > bullishAssets ? "bearish" : "neutral";
      
      const volatilityLevel = validAssets.some(a => Math.abs(a.change24h) > 5) ? "high" : 
                             validAssets.some(a => Math.abs(a.change24h) > 2) ? "medium" : "low";

      const recommendations = [];
      
      const highWinRateAssets = validAssets.filter(a => a.winRate > 65);
      if (highWinRateAssets.length > 0) {
        recommendations.push(`🏆 ${highWinRateAssets.length} assets with >65% win rate identified`);
      }
      
      if (avgWinRate > 60) {
        recommendations.push(`📊 Portfolio average win rate: ${avgWinRate.toFixed(1)}% - Strong performers detected`);
      }
      
      if (fearGreedIndex < 25 && avgWinRate > 55) {
        recommendations.push("💎 FEAR + High win rates = Premium buying opportunity");
      } else if (fearGreedIndex > 75 && avgWinRate > 60) {
        recommendations.push("⚠ GREED + High win rates = Premium shorting opportunity");
      }
      
      if (volatilityLevel === "high" && avgWinRate > 60) {
        recommendations.push("⚡ High volatility + Strong win rates = Optimal trading conditions");
      }
      
      const topSetups = validAssets.filter(a => a.setup && a.setup.confidence > 75);
      if (topSetups.length > 0) {
        recommendations.push(`🎯 ${topSetups.length} premium setups with >75% confidence`);
      }

      console.log(`Analysis complete: ${validAssets.length} assets, avg win rate: ${avgWinRate.toFixed(1)}%`);

      return {
        marketOverview: {
          totalVolume,
          dominantTrend,
          volatilityLevel,
          fearGreedIndex,
          sentiment,
          avgWinRate: Math.round(avgWinRate * 100) / 100,
        },
        assets: validAssets,
        recommendations,
      };
    } catch (error) {
      console.error('Market analysis failed:', error);
      throw new Error(`Market analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

export const recognizePatterns = createTool({
  id: "recognize-patterns",
  description: "Identify real chart patterns using advanced technical analysis",
  inputSchema: z.object({
    symbol: z.string().describe("Trading symbol (e.g., BTC-PERP)"),
    timeframes: z.array(z.enum(["15m", "1h", "4h", "1d"])).optional().default(["1h", "4h"]),
  }),
  outputSchema: z.object({
    patterns: z.array(z.object({
      pattern: z.string(),
      timeframe: z.string(),
      confidence: z.number(),
      signal: z.enum(["bullish", "bearish", "neutral"]),
      description: z.string(),
      entry: z.number().optional(),
      target: z.number().optional(),
      stopLoss: z.number().optional(),
    })),
    overallSignal: z.enum(["strong_bearish", "bearish", "neutral", "bullish", "strong_bullish"]),
    patternCount: z.object({
      bearish: z.number(),
      bullish: z.number(),
      neutral: z.number(),
    }),
  }),
  execute: async ({ context }) => {
    const { symbol, timeframes } = context;
    
    try {
      console.log(`Analyzing patterns for ${symbol} on timeframes: ${timeframes.join(', ')}`);
      
      const client = getAuthenticatedClient(context) || createHyperliquidClient();
      const allMids = await client.info.getAllMids();
      const currentPrice = getPriceFromAllMids(allMids, symbol);
      
      if (currentPrice === 0) {
        throw new Error(`Unable to fetch price for ${symbol}`);
      }

      const patterns = [];
      const coin = getApiCoin(symbol);
      
      for (const timeframe of timeframes) {
        try {
          const endTime = Date.now();
          const startTime = endTime - (7 * 24 * 60 * 60 * 1000);
          
          const candles = await client.info.getCandleSnapshot(coin, timeframe, startTime, endTime) as CandleData[];
          
          if (candles && candles.length > 50) {
            const timeframePatterns = identifyRealPatterns(candles, symbol);
            patterns.push(...timeframePatterns.map(p => ({ ...p, timeframe })));
          }
        } catch (error) {
          console.warn(`Error getting ${timeframe} data for ${symbol}:`, error);
        }
      }
      
      const bearishCount = patterns.filter(p => p.signal === "bearish").length;
      const bullishCount = patterns.filter(p => p.signal === "bullish").length;
      const neutralCount = patterns.filter(p => p.signal === "neutral").length;
      
      let overallSignal: "strong_bearish" | "bearish" | "neutral" | "bullish" | "strong_bullish";
      
      const avgBearishConfidence = bearishCount > 0 ? 
        patterns.filter(p => p.signal === "bearish").reduce((sum, p) => sum + p.confidence, 0) / bearishCount : 0;
      const avgBullishConfidence = bullishCount > 0 ? 
        patterns.filter(p => p.signal === "bullish").reduce((sum, p) => sum + p.confidence, 0) / bullishCount : 0;
      
      if (bearishCount >= 2 && avgBearishConfidence > 70) overallSignal = "strong_bearish";
      else if (bearishCount >= 1 && avgBearishConfidence > 60) overallSignal = "bearish";
      else if (bullishCount >= 2 && avgBullishConfidence > 70) overallSignal = "strong_bullish";
      else if (bullishCount >= 1 && avgBullishConfidence > 60) overallSignal = "bullish";
      else overallSignal = "neutral";
      
      console.log(`Pattern analysis complete for ${symbol}: ${patterns.length} patterns found, signal: ${overallSignal}`);
      
      return {
        patterns,
        overallSignal,
        patternCount: {
          bearish: bearishCount,
          bullish: bullishCount,
          neutral: neutralCount,
        },
      };
    } catch (error) {
      console.error('Pattern recognition failed:', error);
      throw new Error(`Pattern recognition failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

export const generateRecommendation = createTool({
  id: "generate-recommendation",
  description: "Generate comprehensive trading recommendations using advanced analysis and AI reasoning",
  inputSchema: z.object({
    symbol: z.string().describe("Trading symbol to analyze"),
    riskTolerance: z.enum(["conservative", "moderate", "aggressive"]).optional().default("moderate"),
  }),
  outputSchema: z.object({
    recommendation: z.object({
      action: z.enum(["STRONG_BUY", "BUY", "HOLD", "SELL", "STRONG_SELL"]),
      confidence: z.number(),
      timeHorizon: z.string(),
      reasoning: z.string(),
    }),
    tradeSetup: z.object({
      direction: z.enum(["LONG", "SHORT"]),
      entry: z.number(),
      targets: z.array(z.number()),
      stopLoss: z.number(),
      suggestedLeverage: z.number(),
      riskRewardRatio: z.number(),
    }),
    riskAssessment: z.object({
      riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "EXTREME"]),
      probabilitySuccess: z.number(),
      winRate: z.number(),
      maxDrawdownExpected: z.number(),
    }),
    keyFactors: z.array(z.string()),
    note: z.string(),
  }),
  execute: async ({ context, runtimeContext }) => {
    const { symbol, riskTolerance } = context;
    
    try {
      console.log(`Generating recommendation for ${symbol} with ${riskTolerance} risk tolerance`);
      
      const client = getAuthenticatedClient(context) || createHyperliquidClient();
      
      const fearGreedResponse = await fetch("https://api.alternative.me/fng/");
      const fearGreedData: FearGreedResponse = await fearGreedResponse.json();
      const fearGreedIndex = parseInt(fearGreedData.data[0].value);
      
      const allMids = await client.info.getAllMids();
      const currentPrice = getPriceFromAllMids(allMids, symbol);
      
      if (currentPrice === 0) {
        throw new Error(`Unable to fetch current price for ${symbol}`);
      }
      
      const coin = getApiCoin(symbol);
      const marketData = await getEnhancedMarketData(client, coin);
      
      const patternResult = await recognizePatterns.execute({
        context: { symbol, timeframes: ["1h", "4h"] },
        runtimeContext
      });
      
      let action: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";
      let confidence: number;
      let reasoning: string;
      let direction: "LONG" | "SHORT";
      
      const bearishPatterns = patternResult.patterns.filter(p => p.signal === "bearish").length;
      const bullishPatterns = patternResult.patterns.filter(p => p.signal === "bullish").length;
      const overallSignal = patternResult.overallSignal;
      const winRate = marketData.winRate;
      const sharpeRatio = marketData.sharpeRatio;
      
      if (winRate > 70 && overallSignal === "strong_bearish" && fearGreedIndex > 60) {
        action = "STRONG_SELL";
        direction = "SHORT";
        confidence = 90;
        reasoning = `${winRate.toFixed(1)}% win rate + bearish patterns + greed = premium short setup`;
      } else if (winRate > 65 && overallSignal === "bearish" && bearishPatterns >= 2) {
        action = "SELL";
        direction = "SHORT";
        confidence = 80;
        reasoning = `${winRate.toFixed(1)}% win rate + confirmed bearish patterns = strong short`;
      } else if (winRate > 70 && overallSignal === "strong_bullish" && fearGreedIndex < 40) {
        action = "STRONG_BUY";
        direction = "LONG";
        confidence = 85;
        reasoning = `${winRate.toFixed(1)}% win rate + bullish patterns + fear = premium long setup`;
      } else if (winRate > 65 && overallSignal === "bullish" && bullishPatterns >= 2) {
        action = "BUY";
        direction = "LONG";
        confidence = 75;
        reasoning = `${winRate.toFixed(1)}% win rate + confirmed bullish patterns = strong long`;
      } else if (winRate > 60 && Math.abs(marketData.change24h) > 5) {
        action = marketData.change24h > 0 ? "BUY" : "SELL";
        direction = marketData.change24h > 0 ? "LONG" : "SHORT";
        confidence = 70;
        reasoning = `${winRate.toFixed(1)}% win rate + strong momentum = trend continuation`;
      } else if (winRate < 45 || marketData.maxDrawdown > 40) {
        action = "HOLD";
        direction = "LONG";
        confidence = 30;
        reasoning = `${winRate.toFixed(1)}% win rate too low - avoid this asset`;
      } else {
        action = "HOLD";
        direction = "LONG";
        confidence = 50;
        reasoning = `${winRate.toFixed(1)}% win rate + mixed signals = wait for clarity`;
      }
      
      const keyFactors = [
        `Win Rate: ${winRate.toFixed(1)}% (${winRate > 65 ? "Excellent" : winRate > 55 ? "Good" : "Poor"})`,
        `Patterns: ${bearishPatterns} bearish, ${bullishPatterns} bullish`,
        `Sharpe: ${sharpeRatio.toFixed(2)}`,
        `F&G: ${fearGreedIndex} (${fearGreedIndex > 75 ? "Extreme Greed" : fearGreedIndex < 25 ? "Extreme Fear" : "Neutral"})`,
        `RSI: ${Math.round(marketData.rsi)} (${marketData.rsi > 70 ? "Overbought" : marketData.rsi < 30 ? "Oversold" : "Neutral"})`,
        `24h: ${marketData.change24h.toFixed(2)}%`,
        `Max DD: ${marketData.maxDrawdown.toFixed(1)}%`
      ];

      let suggestedLeverage: number;
      let entry: number;
      let stopLoss: number;
      let targets: number[];
      
      const leverageMap = {
        conservative: confidence > 80 ? 2 : 1,
        moderate: confidence > 80 ? 3 : confidence > 60 ? 2 : 1,
        aggressive: confidence > 80 ? 5 : confidence > 60 ? 3 : 2
      };
      
      suggestedLeverage = leverageMap[riskTolerance];
      
      if (direction === "SHORT") {
        entry = currentPrice * 0.999;
        stopLoss = currentPrice * 1.03;
        targets = [
          currentPrice * 0.95,
          currentPrice * 0.90,
          currentPrice * 0.85,
        ];
      } else {
        entry = currentPrice * 1.001;
        stopLoss = currentPrice * 0.97;
        targets = [
          currentPrice * 1.05,
          currentPrice * 1.10,
          currentPrice * 1.15,
        ];
      }
      
      const riskRewardRatio = Math.abs(targets[0] - entry) / Math.abs(stopLoss - entry);
      
      const riskLevel: "LOW" | "MEDIUM" | "HIGH" | "EXTREME" = 
        confidence > 80 ? "LOW" : 
        confidence > 60 ? "MEDIUM" : 
        confidence > 40 ? "HIGH" : "EXTREME";
      
      const maxDrawdownExpected = riskTolerance === "conservative" ? 5 : 
                                  riskTolerance === "moderate" ? 10 : 15;
      
      console.log(`Recommendation: ${action} ${symbol}, confidence: ${confidence}%`);
      
      return {
        recommendation: {
          action,
          confidence,
          timeHorizon: "1-7 days",
          reasoning,
        },
        tradeSetup: {
          direction,
          entry: Math.round(entry * 100000) / 100000,
          targets: targets.map(t => Math.round(t * 100000) / 100000),
          stopLoss: Math.round(stopLoss * 100000) / 100000,
          suggestedLeverage,
          riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
        },
        riskAssessment: {
          riskLevel,
          probabilitySuccess: confidence,
          winRate: Math.round(winRate * 100) / 100,
          maxDrawdownExpected,
        },
        keyFactors,
        note: "This is a theoretical recommendation. Use 'calculatePositionSize' with your account balance for actual position sizing.",
      };
    } catch (error) {
      console.error('Recommendation generation failed:', error);
      throw new Error(`Recommendation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

export const checkTradeAuth = createTool({
  id: "check-trade-auth",
  description: "Check Hyperliquid trading authorization status",
  inputSchema: z.object({
    action: z.enum(["check", "status"]).optional().default("check"),
  }),
  outputSchema: z.object({
    isAuthorized: z.boolean(),
    authUrl: z.string().optional(),
    walletAddress: z.string().optional(),
    status: z.string(),
    instructions: z.string(),
  }),
  execute: async ({ context }) => {
    const sessionId = getSessionId(context);
    const session = userSessions.get(sessionId);
    
    if (!session || session.expiresAt < Date.now()) {
      return {
        isAuthorized: false,
        authUrl: "https://app.hyperliquid.xyz/API",
        status: "NOT_AUTHENTICATED",
        instructions: "🔐 Authentication Required\n\nSteps:\n1. Visit: https://app.hyperliquid.xyz/API\n2. Generate API Wallet\n3. Authorize for trading\n4. Send: auth [your-private-key] [your-wallet-address]",
      };
    }
    
    console.log(`Auth check: ${session.walletAddress} authenticated`);
    return {
      isAuthorized: true,
      walletAddress: session.walletAddress,
      status: "AUTHENTICATED",
      instructions: `✅ Connected to Hyperliquid\n\nWallet: ${session.walletAddress}\nSession expires: ${new Date(session.expiresAt).toLocaleString()}\n\nReady to execute trades!`,
    };
  },
});

export const getAccountInfo = createTool({
  id: "get-account-info",
  description: "Get perpetuals account information for futures trading",
  inputSchema: z.object({}),
  outputSchema: z.object({
    account: z.object({
      walletAddress: z.string(),
      accountValue: z.number(),
      totalNtlPos: z.number(),
      totalRawUsd: z.number(),
      totalMarginUsed: z.number(),
      availableMargin: z.number(),
      withdrawable: z.number(),
    }),
    marginSummary: z.object({
      marginRatio: z.number(),
      maintenanceMargin: z.number(),
      freeCollateral: z.number(),
      crossMaintenanceMarginUsed: z.number(),
    }),
    tradingBalance: z.object({
      totalUSDC: z.number(),
      availableForTrading: z.number(),
      usedAsMargin: z.number(),
    }),
  }),
  execute: async ({ context }) => {
    const client = getAuthenticatedClient(context);
    
    if (!client) {
      throw new Error("Authentication required. Use: auth [private-key] [wallet-address]");
    }
    
    const sessionId = getSessionId(context);
    const session = userSessions.get(sessionId)!;
    const walletAddress = session.walletAddress;
    
    try {
      const userState = await client.info.perpetuals.getClearinghouseState(walletAddress);
      
      const account = {
        walletAddress,
        accountValue: parseFloat(userState.marginSummary.accountValue),
        totalNtlPos: parseFloat(userState.marginSummary.totalNtlPos),
        totalRawUsd: parseFloat(userState.marginSummary.totalRawUsd),
        totalMarginUsed: parseFloat(userState.marginSummary.totalMarginUsed),
        availableMargin: parseFloat(userState.marginSummary.accountValue) - parseFloat(userState.marginSummary.totalMarginUsed),
        withdrawable: parseFloat(userState.withdrawable || userState.marginSummary.accountValue),
      };
      
      const marginRatio = account.totalMarginUsed / account.accountValue;
      const maintenanceMargin = parseFloat(userState.marginSummary.totalMarginUsed) * 0.5;
      const freeCollateral = account.accountValue - account.totalMarginUsed;
      const crossMaintenanceMarginUsed = parseFloat(userState.crossMaintenanceMarginUsed || "0");
      
      console.log(`Account info: $${account.accountValue} total, $${account.availableMargin} available`);
      
      return {
        account,
        marginSummary: {
          marginRatio: Math.round(marginRatio * 10000) / 100,
          maintenanceMargin,
          freeCollateral,
          crossMaintenanceMarginUsed,
        },
        tradingBalance: {
          totalUSDC: account.accountValue,
          availableForTrading: account.availableMargin,
          usedAsMargin: account.totalMarginUsed,
        },
      };
    } catch (error) {
      console.error('Failed to fetch account info:', error);
      throw new Error(`Failed to fetch account info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

export const getPositions = createTool({
  id: "get-positions",
  description: "Get all current open positions with P&L and risk metrics",
  inputSchema: z.object({}),
  outputSchema: z.object({
    positions: z.array(z.object({
      symbol: z.string(),
      side: z.enum(["long", "short"]),
      size: z.number(),
      entryPrice: z.number(),
      markPrice: z.number(),
      unrealizedPnl: z.number(),
      unrealizedPnlPercent: z.number(),
      leverage: z.number(),
      marginUsed: z.number(),
      liquidationPrice: z.number(),
    })),
    totalUnrealizedPnl: z.number(),
    positionCount: z.number(),
    riskMetrics: z.object({
      portfolioRisk: z.number(),
      largestPosition: z.number(),
      totalExposure: z.number(),
    }),
  }),
  execute: async ({ context }) => {
    const client = getAuthenticatedClient(context);
    
    if (!client) {
      throw new Error("Authentication required. Use: auth [private-key] [wallet-address]");
    }
    
    const sessionId = getSessionId(context);
    const session = userSessions.get(sessionId)!;
    const walletAddress = session.walletAddress;
    
    try {
      const userState = await client.info.perpetuals.getClearinghouseState(walletAddress);
      
      const positions = userState.assetPositions.map((pos: any) => {
        const size = parseFloat(pos.position.szi);
        const entryPrice = parseFloat(pos.position.entryPx || "0");
        const unrealizedPnl = parseFloat(pos.position.unrealizedPnl);
        const marginUsed = parseFloat(pos.position.marginUsed);
        
        const markPrice = entryPrice + (size !== 0 ? unrealizedPnl / size : 0);
        const unrealizedPnlPercent = entryPrice > 0 ? (unrealizedPnl / (entryPrice * Math.abs(size))) * 100 : 0;
        const leverage = marginUsed > 0 ? (Math.abs(size) * markPrice) / marginUsed : 1;
        
        return {
          symbol: getDisplaySymbol(pos.position.coin),
          side: size > 0 ? "long" as const : "short" as const,
          size: Math.abs(size),
          entryPrice,
          markPrice,
          unrealizedPnl,
          unrealizedPnlPercent: Math.round(unrealizedPnlPercent * 100) / 100,
          leverage: Math.round(leverage * 100) / 100,
          marginUsed,
          liquidationPrice: parseFloat(pos.position.liquidationPx || "0"),
        };
      }).filter((pos: any) => pos.size > 0);
      
      const totalUnrealizedPnl = positions.reduce((sum: number, pos) => sum + pos.unrealizedPnl, 0);
      const totalExposure = positions.reduce((sum: number, pos) => sum + (pos.size * pos.markPrice), 0);
      const largestPosition = Math.max(...positions.map(pos => pos.size * pos.markPrice), 0);
      
      console.log(`Positions: ${positions.length} open, total PnL: $${totalUnrealizedPnl.toFixed(2)}`);
      
      return {
        positions,
        totalUnrealizedPnl: Math.round(totalUnrealizedPnl * 100) / 100,
        positionCount: positions.length,
        riskMetrics: {
          portfolioRisk: totalExposure > 0 ? Math.round((totalExposure / parseFloat(userState.marginSummary.accountValue)) * 10000) / 100 : 0,
          largestPosition: Math.round(largestPosition * 100) / 100,
          totalExposure: Math.round(totalExposure * 100) / 100,
        },
      };
    } catch (error) {
      console.error('Failed to fetch positions:', error);
      throw new Error(`Failed to fetch positions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

export const getTradeHistory = createTool({
  id: "get-trade-history",
  description: "Get recent trading history and performance metrics",
  inputSchema: z.object({
    limit: z.number().optional().default(50),
  }),
  outputSchema: z.object({
    trades: z.array(z.object({
      symbol: z.string(),
      side: z.string(),
      size: z.number(),
      price: z.number(),
      time: z.string(),
      pnl: z.number(),
      fee: z.number(),
    })),
    performance: z.object({
      totalTrades: z.number(),
      totalPnl: z.number(),
      totalFees: z.number(),
      winRate: z.number(),
      avgWin: z.number(),
      avgLoss: z.number(),
      profitFactor: z.number(),
    }),
  }),
  execute: async ({ context }) => {
    const client = getAuthenticatedClient(context);
    
    if (!client) {
      throw new Error("Authentication required. Use: auth [private-key] [wallet-address]");
    }
    
    const sessionId = getSessionId(context);
    const session = userSessions.get(sessionId)!;
    const walletAddress = session.walletAddress;
    const { limit } = context;
    
    try {
      const fills = await client.info.getUserFills(walletAddress);
      
      const recentTrades = fills.slice(0, limit).map((fill: any) => ({
        symbol: getDisplaySymbol(fill.coin),
        side: fill.side,
        size: parseFloat(fill.sz),
        price: parseFloat(fill.px),
        time: new Date(fill.time).toISOString(),
        pnl: parseFloat(fill.closedPnl || "0"),
        fee: parseFloat(fill.fee || "0"),
      }));
      
      const totalTrades = recentTrades.length;
      const totalPnl = recentTrades.reduce((sum: number, trade) => sum + trade.pnl, 0);
      const totalFees = recentTrades.reduce((sum: number, trade) => sum + trade.fee, 0);
      
      const profitableTrades = recentTrades.filter(trade => trade.pnl > 0);
      const losingTrades = recentTrades.filter(trade => trade.pnl < 0);
      
      const winRate = totalTrades > 0 ? (profitableTrades.length / totalTrades) * 100 : 0;
      const avgWin = profitableTrades.length > 0 ? 
        profitableTrades.reduce((sum: number, trade) => sum + trade.pnl, 0) / profitableTrades.length : 0;
      const avgLoss = losingTrades.length > 0 ? 
        Math.abs(losingTrades.reduce((sum: number, trade) => sum + trade.pnl, 0) / losingTrades.length) : 0;
      const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;
      
      console.log(`Trade history: ${totalTrades} trades, ${winRate.toFixed(1)}% win rate, $${totalPnl.toFixed(2)} PnL`);
      
      return {
        trades: recentTrades,
        performance: {
          totalTrades,
          totalPnl: Math.round(totalPnl * 100) / 100,
          totalFees: Math.round(totalFees * 100) / 100,
          winRate: Math.round(winRate * 100) / 100,
          avgWin: Math.round(avgWin * 100) / 100,
          avgLoss: Math.round(avgLoss * 100) / 100,
          profitFactor: Math.round(profitFactor * 100) / 100,
        },
      };
    } catch (error) {
      console.error('Failed to fetch trade history:', error);
      throw new Error(`Failed to fetch trade history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

export const calculatePositionSize = createTool({
  id: "calculate-position-size",
  description: "Calculate optimal position size using dynamic risk management based on account size",
  inputSchema: z.object({
    entryPrice: z.number().describe("Planned entry price"),
    stopLoss: z.number().describe("Stop loss price"),
    leverage: z.number().min(1).max(20).describe("Leverage to use (1-20x)"),
    symbol: z.string().describe("Trading symbol"),
    winRate: z.number().optional().describe("Historical win rate for this asset"),
  }),
  outputSchema: z.object({
    positionSize: z.number(),
    notionalValue: z.number(),
    marginRequired: z.number(),
    riskAmount: z.number(),
    maxLoss: z.number(),
    recommendedSize: z.number(),
    warnings: z.array(z.string()),
    riskMetrics: z.object({
      stopDistance: z.number(),
      riskRatio: z.number(),
      leverageRisk: z.string(),
      winRateAdjustment: z.number(),
      dynamicRiskUsed: z.number(),
    }),
  }),
  execute: async ({ context }) => {
    const { entryPrice, stopLoss, leverage, symbol, winRate } = context;
    
    try {
      const client = getAuthenticatedClient(context);
      if (!client) {
        throw new Error("🔐 Authentication required. Use: auth [private-key] [wallet-address]");
      }
      
      const sessionId = getSessionId(context);
      const session = userSessions.get(sessionId)!;
      const walletAddress = session.walletAddress;
      
      const accountInfo = await client.info.perpetuals.getClearinghouseState(walletAddress);
      const accountBalance = parseFloat(accountInfo.marginSummary.accountValue);
      const usedMargin = parseFloat(accountInfo.marginSummary.totalMarginUsed);
      const availableMargin = accountBalance - usedMargin;
      
      if (availableMargin <= 0) {
        throw new Error("💸 No available margin for new positions");
      }
      
      const riskProfile = getAccountRiskProfile(accountBalance);
      const usableMargin = availableMargin * (riskProfile.usagePct / 100);
      const maxNotional = usableMargin * leverage;
      const maxPositionSize = maxNotional / entryPrice;
      
      const stopDistance = Math.abs(entryPrice - stopLoss);
      const stopDistancePercent = (stopDistance / entryPrice) * 100;
      
      // For micro accounts, prioritize meeting minimum order size over tight risk management
      let finalPositionSize = maxPositionSize;
      
      // Only apply stop loss constraints for larger accounts
      if (accountBalance >= 10) {
        const maxAcceptableRisk = accountBalance * (riskProfile.riskPct / 100);
        const maxLossAtCurrentSize = maxPositionSize * stopDistance;
        
        if (maxLossAtCurrentSize > maxAcceptableRisk) {
          finalPositionSize = maxAcceptableRisk / stopDistance;
        }
      }
      
      const minNotional = 5;
      const minPositionSize = minNotional / entryPrice;
      
      if (finalPositionSize < minPositionSize) {
        throw new Error(`Position too small. Account needs ~${(minPositionSize * entryPrice).toFixed(2)} notional. Current max: ${(finalPositionSize * entryPrice).toFixed(2)}`);
      }
      
      const finalNotional = finalPositionSize * entryPrice;
      const finalMarginRequired = finalNotional / leverage;
      const finalMaxLoss = finalPositionSize * stopDistance;
      
      const warnings = [];
      
      if (finalMarginRequired > availableMargin * 0.95) {
        warnings.push("⚠️ Using >95% of available margin");
      }
      
      if (accountBalance < 10) {
        warnings.push("ℹ️ Micro account: Using aggressive position sizing to enable trading");
      }
      
      if (stopDistancePercent > 10) {
        warnings.push("⚠️ Very wide stop loss - high risk per trade");
      }
      
      if (leverage > 15) {
        warnings.push("⚠️ Very high leverage increases liquidation risk");
      }
      
      if (finalMarginRequired > availableMargin) {
        warnings.push("❌ Position exceeds available margin");
        finalPositionSize = (availableMargin * leverage) / entryPrice;
      }
      
      console.log(`Position calc: ${finalPositionSize.toFixed(4)} ${symbol} (${finalNotional.toFixed(2)} notional, ${finalMarginRequired.toFixed(2)} margin, ${riskProfile.usagePct}% usage)`);
      
      return {
        positionSize: Math.round(finalPositionSize * 10000) / 10000,
        notionalValue: Math.round(finalNotional * 100) / 100,
        marginRequired: Math.round(finalMarginRequired * 100) / 100,
        riskAmount: Math.round(finalMaxLoss * 100) / 100,
        maxLoss: Math.round(finalMaxLoss * 100) / 100,
        recommendedSize: Math.round(finalPositionSize * 10000) / 10000,
        warnings,
        riskMetrics: {
          stopDistance: Math.round(stopDistancePercent * 100) / 100,
          riskRatio: Math.round((finalMaxLoss / accountBalance) * 10000) / 100,
          leverageRisk: leverage <= 3 ? "LOW" : leverage <= 7 ? "MEDIUM" : "HIGH",
          winRateAdjustment: winRate ? Math.round((winRate / 60) * 100) / 100 : 100,
          dynamicRiskUsed: riskProfile.usagePct,
        },
      };
    } catch (error) {
      console.error('Position size calculation failed:', error);
      throw new Error(`Position size calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

export const executeTrade = createTool({
  id: "execute-trade",
  description: "Execute a trade on Hyperliquid with proper risk management and lot size compliance",
  inputSchema: z.object({
    symbol: z.string().describe("Trading symbol (e.g., BTC-PERP)"),
    side: z.enum(["buy", "sell"]).describe("Order side"),
    size: z.number().describe("Position size"),
    orderType: z.enum(["market", "limit"]).optional().default("limit"),
    price: z.number().nullable().optional().describe("Limit price (required for limit orders)"),
    reduceOnly: z.boolean().optional().default(false),
    leverage: z.number().nullable().optional().describe("Leverage to set"),
    stopLoss: z.number().nullable().optional().describe("Stop loss price"),
    takeProfit: z.number().nullable().optional().describe("Take profit price"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    orderId: z.string().optional(),
    executedPrice: z.number().optional(),
    executedSize: z.number().optional(),
    status: z.string(),
    message: z.string(),
    fees: z.number().optional(),
  }),
  execute: async ({ context }) => {
    const { symbol, side, size, orderType, price, reduceOnly, leverage, stopLoss, takeProfit } = context;
    
    const client = getAuthenticatedClient(context);
    if (!client) {
      throw new Error("Authentication required. Use: auth [private-key] [wallet-address]");
    }
    
    const sessionId = getSessionId(context);
    const session = userSessions.get(sessionId)!;
    const walletAddress = session.walletAddress;
    
    try {
      const coin = getApiCoin(symbol);
      
      console.log(`=== ORDER EXECUTION ===`);
      console.log(`Executing ${side} ${size} ${symbol} at ${price || 'market'}`);
      
      // Get asset specifications for lot/tick size rounding
      const assetSpecs = await getAssetSpecs(client, symbol);
      
      const userState = await client.info.perpetuals.getClearinghouseState(walletAddress);
      const availableMargin = parseFloat(userState.marginSummary.accountValue) - 
                             parseFloat(userState.marginSummary.totalMarginUsed);
      
      const currentPrice = price || await (async () => {
        const allMids = await client.info.getAllMids();
        return getPriceFromAllMids(allMids, symbol);
      })();
      
      if (currentPrice === 0) {
        throw new Error(`Unable to fetch current price for ${symbol}`);
      }
      
      // Round size to lot size
      const roundedSize = roundToLotSize(size, assetSpecs.lotSize);
      console.log(`Size rounded from ${size} to ${roundedSize} (lot size: ${assetSpecs.lotSize})`);
      
      if (roundedSize <= 0) {
        throw new Error(`Rounded size is zero. Original: ${size}, Lot size: ${assetSpecs.lotSize}`);
      }
      
      const requiredMargin = (roundedSize * currentPrice) / (leverage || 1);
      
      console.log(`=== MARGIN CHECK ===`);
      console.log(`Available margin: ${availableMargin}`);
      console.log(`Required margin: ${requiredMargin}`);
      
      if (requiredMargin > availableMargin && !reduceOnly) {
        return {
          success: false,
          status: "INSUFFICIENT_FUNDS",
          message: `Required margin (${requiredMargin.toFixed(2)}) exceeds available margin (${availableMargin.toFixed(2)})`,
        };
      }
      
      if (leverage) {
        try {
          await client.exchange.updateLeverage(symbol, "cross", leverage);
          console.log(`Leverage set to ${leverage}x for ${symbol}`);
        } catch (leverageError) {
          console.warn(`Failed to set leverage: ${leverageError}`);
        }
      }
      
      const orderRequest: any = {
        coin: symbol,
        is_buy: side === "buy",
        sz: roundedSize,
        reduce_only: reduceOnly,
      };
      
      if (orderType === "limit") {
        if (!price) {
          throw new Error("Price required for limit orders");
        }
        // Round price to tick size
        const roundedPrice = roundToTickSize(price, assetSpecs.tickSize);
        console.log(`Price rounded from ${price} to ${roundedPrice} (tick size: ${assetSpecs.tickSize})`);
        
        orderRequest.limit_px = roundedPrice;
        orderRequest.order_type = { limit: { tif: "Gtc" } };
      } else {
        // For market orders, use a price slightly away from current market
        const marketPrice = side === "buy" ? currentPrice * 1.001 : currentPrice * 0.999;
        const roundedMarketPrice = roundToTickSize(marketPrice, assetSpecs.tickSize);
        console.log(`Market price rounded to ${roundedMarketPrice}`);
        
        orderRequest.limit_px = roundedMarketPrice;
        orderRequest.order_type = { limit: { tif: "Ioc" } };
      }
      
      console.log(`=== ORDER REQUEST ===`);
      console.log(`Order request:`, JSON.stringify(orderRequest, null, 2));
      
      const orderResponse = await client.exchange.placeOrder({
        orders: [orderRequest],
        grouping: "na",
      });
      
      console.log(`=== ORDER RESPONSE ===`);
      console.log(`Full response:`, JSON.stringify(orderResponse, null, 2));
      console.log(`Status:`, orderResponse.status);
      
      if (orderResponse.status !== "ok") {
        console.error('Order failed with status:', orderResponse.status);
        return {
          success: false,
          status: "FAILED",
          message: `Order failed: ${JSON.stringify(orderResponse)}`,
        };
      }
      
      const responseData = orderResponse.response?.data;
      if (responseData) {
        console.log('Response data:', JSON.stringify(responseData, null, 2));
        
        if (responseData.statuses) {
          responseData.statuses.forEach((status: any, index: number) => {
            console.log(`Order ${index} status:`, JSON.stringify(status, null, 2));
          });
        }
      }
      
      const orderData = orderResponse.response?.data?.statuses?.[0];
      if (!orderData) {
        return {
          success: false,
          status: "FAILED",
          message: "No order status returned",
        };
      }
      
      // Check for errors in order status
      if (orderData.error) {
        console.error('Order error:', orderData.error);
        return {
          success: false,
          status: "FAILED",
          message: `Order error: ${orderData.error}`,
        };
      }
      
      setTimeout(async () => {
        try {
          const openOrders = await client.info.getUserOpenOrders(walletAddress);
          console.log('=== OPEN ORDERS AFTER PLACEMENT ===');
          console.log('Open orders:', JSON.stringify(openOrders, null, 2));
          
          const relatedOrder = openOrders.find(order => order.coin === symbol);
          if (relatedOrder) {
            console.log('Found related order:', relatedOrder);
          } else {
            console.log('No related order found in open orders');
          }
        } catch (orderCheckError) {
          console.error('Failed to check open orders:', orderCheckError);
        }
      }, 1000);
      
      if (orderData.filled) {
        const filled = orderData.filled;
        console.log(`Order filled: ${filled.totalSz} at ${filled.avgPx}`);
        
        return {
          success: true,
          orderId: filled.oid?.toString(),
          executedPrice: parseFloat(filled.avgPx || "0"),
          executedSize: parseFloat(filled.totalSz || "0"),
          status: "FILLED",
          message: `Order executed successfully. Size: ${filled.totalSz}, Price: ${filled.avgPx}`,
          fees: 0,
        };
      } else if (orderData.resting) {
        console.log('Order is resting on book');
        return {
          success: true,
          orderId: orderData.resting.oid?.toString(),
          status: "PENDING",
          message: `Order placed successfully, waiting for fill. Size: ${roundedSize}`,
        };
      } else {
        console.log('Order placed, waiting for fill');
        return {
          success: true,
          orderId: orderData.oid?.toString(),
          status: "PENDING",
          message: `Order placed successfully, waiting for fill. Size: ${roundedSize}`,
        };
      }
    } catch (error) {
      console.error('=== ORDER ERROR ===');
      console.error('Error details:', error);
      return {
        success: false,
        status: "ERROR",
        message: `Trade execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

export const closePosition = createTool({
  id: "close-position",
  description: "Close an existing position partially or completely",
  inputSchema: z.object({
    symbol: z.string().describe("Symbol to close (e.g., BTC-PERP)"),
    size: z.number().optional().describe("Size to close (omit for full position)"),
    orderType: z.enum(["market", "limit"]).optional().default("market"),
    price: z.number().optional().describe("Limit price for closing"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    closedSize: z.number(),
    executedPrice: z.number().optional(),
    pnl: z.number().optional(),
    status: z.string(),
    message: z.string(),
  }),
  execute: async ({ context, runtimeContext }) => {
    const { symbol, size, orderType, price } = context;
    
    const client = getAuthenticatedClient(context);
    if (!client) {
      throw new Error("Authentication required. Use: auth [private-key] [wallet-address]");
    }
    
    const sessionId = getSessionId(context);
    const session = userSessions.get(sessionId)!;
    const walletAddress = session.walletAddress;
    
    try {
      const userState = await client.info.perpetuals.getClearinghouseState(walletAddress);
      const coin = getApiCoin(symbol);
      const position = userState.assetPositions.find((pos: any) => 
        pos.position.coin === coin
      );
      
      if (!position) {
        return {
          success: false,
          closedSize: 0,
          status: "NO_POSITION",
          message: `No position found for ${symbol}`,
        };
      }
      
      const currentSize = parseFloat(position.position.szi);
      const positionSide = currentSize > 0 ? "long" : "short";
      const closeSize = size || Math.abs(currentSize);
      
      if (closeSize > Math.abs(currentSize)) {
        return {
          success: false,
          closedSize: 0,
          status: "INVALID_SIZE",
          message: `Close size (${closeSize}) exceeds position size (${Math.abs(currentSize)})`,
        };
      }
      
      const orderSide = positionSide === "long" ? "sell" : "buy";
      
      console.log(`Closing ${closeSize} of ${symbol} position (${positionSide})`);
      
      const closeResult = await executeTrade.execute({
        context: {
          symbol,
          side: orderSide,
          size: closeSize,
          orderType,
          price,
          reduceOnly: true,
        },
        runtimeContext
      });
      
      if (closeResult.success) {
        const entryPrice = parseFloat(position.position.entryPx || "0");
        const exitPrice = closeResult.executedPrice || price || 0;
        const pnl = positionSide === "long" 
          ? (exitPrice - entryPrice) * closeSize
          : (entryPrice - exitPrice) * closeSize;
        
        console.log(`Position closed: PnL = $${pnl.toFixed(2)}`);
        
        return {
          success: true,
          closedSize: closeResult.executedSize || closeSize,
          executedPrice: closeResult.executedPrice,
          pnl: Math.round(pnl * 100) / 100,
          status: "CLOSED",
          message: `Successfully closed ${closeSize} of ${symbol} position`,
        };
      } else {
        return {
          success: false,
          closedSize: 0,
          status: "CLOSE_FAILED",
          message: closeResult.message,
        };
      }
    } catch (error) {
      console.error('Position close failed:', error);
      return {
        success: false,
        closedSize: 0,
        status: "ERROR",
        message: `Position close failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

export const updateStopLoss = createTool({
  id: "update-stop-loss",
  description: "Update or set stop loss for an existing position with proper lot/tick size handling",
  inputSchema: z.object({
    symbol: z.string().describe("Symbol to update stop loss for"),
    stopPrice: z.number().describe("New stop loss price"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    orderId: z.string().optional(),
    stopPrice: z.number(),
    status: z.string(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const { symbol, stopPrice } = context;
    
    const client = getAuthenticatedClient(context);
    if (!client) {
      throw new Error("Authentication required. Use: auth [private-key] [wallet-address]");
    }
    
    const sessionId = getSessionId(context);
    const session = userSessions.get(sessionId)!;
    const walletAddress = session.walletAddress;
    
    try {
      const userState = await client.info.perpetuals.getClearinghouseState(walletAddress);
      const coin = getApiCoin(symbol);
      const position = userState.assetPositions.find((pos: any) => 
        pos.position.coin === coin
      );
      
      if (!position) {
        return {
          success: false,
          stopPrice,
          status: "NO_POSITION",
          message: `No position found for ${symbol}`,
        };
      }
      
      const currentSize = parseFloat(position.position.szi);
      const positionSide = currentSize > 0 ? "long" : "short";
      
      // Get asset specifications for proper rounding
      const assetSpecs = await getAssetSpecs(client, symbol);
      const roundedStopPrice = roundToTickSize(stopPrice, assetSpecs.tickSize);
      const roundedSize = roundToLotSize(Math.abs(currentSize), assetSpecs.lotSize);
      
      console.log(`Stop price rounded from ${stopPrice} to ${roundedStopPrice}`);
      console.log(`Position size rounded from ${Math.abs(currentSize)} to ${roundedSize}`);
      
      const openOrders = await client.info.getUserOpenOrders(walletAddress);
      const stopOrders = openOrders.filter((order: any) => 
        order.coin === coin && 
        order.orderType?.trigger?.tpsl === "sl"
      );
      
      console.log(`Updating stop loss for ${symbol} to ${roundedStopPrice}`);
      
      for (const order of stopOrders) {
        try {
          await client.exchange.cancelOrder({
            coin: coin,
            o: order.oid,
          });
          console.log(`Cancelled existing stop order ${order.oid}`);
        } catch (cancelError) {
          console.warn(`Failed to cancel existing stop order: ${cancelError}`);
        }
      }
      
      const stopOrderResponse = await client.exchange.placeOrder({
        orders: [{
          coin: coin,
          is_buy: positionSide === "short",
          sz: roundedSize,
          reduce_only: true,
          limit_px: roundedStopPrice,
          order_type: {
            trigger: {
              triggerPx: roundedStopPrice,
              isMarket: true,
              tpsl: "sl",
            },
          },
        }],
        grouping: "na",
      });
      
      if (stopOrderResponse.status === "ok") {
        const orderData = stopOrderResponse.response?.data?.statuses?.[0];
        
        // Check for errors in the stop order
        if (orderData?.error) {
          console.error('Stop order error:', orderData.error);
          return {
            success: false,
            stopPrice: roundedStopPrice,
            status: "FAILED",
            message: `Stop order error: ${orderData.error}`,
          };
        }
        
        console.log(`Stop loss updated successfully`);
        return {
          success: true,
          orderId: orderData?.oid?.toString(),
          stopPrice: roundedStopPrice,
          status: "UPDATED",
          message: `Stop loss updated to ${roundedStopPrice} for ${symbol}`,
        };
      } else {
        return {
          success: false,
          stopPrice: roundedStopPrice,
          status: "FAILED",
          message: `Failed to place stop loss: ${stopOrderResponse.status}`,
        };
      }
    } catch (error) {
      console.error('Stop loss update failed:', error);
      return {
        success: false,
        stopPrice,
        status: "ERROR",
        message: `Stop loss update failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

export const monitorPositions = createTool({
  id: "monitor-positions",
  description: "Monitor all positions with real-time P&L and risk alerts",
  inputSchema: z.object({
    alertThresholds: z.object({
      pnlPercent: z.number().optional().default(10),
      marginRatio: z.number().optional().default(80),
    }).optional(),
  }),
  outputSchema: z.object({
    summary: z.object({
      totalPositions: z.number(),
      totalPnl: z.number(),
      totalExposure: z.number(),
      marginUsed: z.number(),
      freeMargin: z.number(),
    }),
    positions: z.array(z.object({
      symbol: z.string(),
      side: z.string(),
      size: z.number(),
      entryPrice: z.number(),
      currentPrice: z.number(),
      pnl: z.number(),
      pnlPercent: z.number(),
      marginUsed: z.number(),
      alerts: z.array(z.string()),
    })),
    alerts: z.array(z.string()),
    riskStatus: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  }),
  execute: async ({ context, runtimeContext }) => {
    const alertThresholds = context.alertThresholds || { pnlPercent: 10, marginRatio: 80 };
    
    try {
      console.log('Monitoring positions...');
      
      const positionsResult = await getPositions.execute({ 
        context: {},
        runtimeContext 
      });
      const accountResult = await getAccountInfo.execute({ 
        context: {},
        runtimeContext 
      });
      
      const positions = positionsResult.positions;
      const account = accountResult.account;
      
      const client = getAuthenticatedClient(context) || createHyperliquidClient();
      const allMids = await client.info.getAllMids();
      
      const monitoredPositions = positions.map(pos => {
        const currentPrice = getPriceFromAllMids(allMids, pos.symbol);
        const alerts = [];
        
        if (Math.abs(pos.unrealizedPnlPercent) > alertThresholds.pnlPercent) {
          alerts.push(`${pos.unrealizedPnlPercent > 0 ? '🟢' : '🔴'} Large P&L: ${pos.unrealizedPnlPercent.toFixed(2)}%`);
        }
        
        if (pos.liquidationPrice > 0) {
          const distanceToLiq = Math.abs(currentPrice - pos.liquidationPrice) / currentPrice * 100;
          if (distanceToLiq < 10) {
            alerts.push(`⚠ Liquidation risk: ${distanceToLiq.toFixed(1)}% away`);
          }
        }
        
        if (pos.leverage > 10) {
          alerts.push(`⚡ High leverage: ${pos.leverage}x`);
        }
        
        return {
          symbol: pos.symbol,
          side: pos.side,
          size: pos.size,
          entryPrice: pos.entryPrice,
          currentPrice,
          pnl: pos.unrealizedPnl,
          pnlPercent: pos.unrealizedPnlPercent,
          marginUsed: pos.marginUsed,
          alerts,
        };
      });
      
      const portfolioAlerts = [];
      const marginRatio = (account.totalMarginUsed / account.accountValue) * 100;
      
      if (marginRatio > alertThresholds.marginRatio) {
        portfolioAlerts.push(`⚠ High margin usage: ${marginRatio.toFixed(1)}%`);
      }
      
      if (positionsResult.totalUnrealizedPnl < -account.accountValue * 0.1) {
        portfolioAlerts.push(`🔴 Large unrealized loss: ${positionsResult.totalUnrealizedPnl.toFixed(2)} USDC`);
      }
      
      let riskStatus: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
      
      if (marginRatio > 90 || positionsResult.totalUnrealizedPnl < -account.accountValue * 0.2) {
        riskStatus = "CRITICAL";
      } else if (marginRatio > 70 || positionsResult.totalUnrealizedPnl < -account.accountValue * 0.1) {
        riskStatus = "HIGH";
      } else if (marginRatio > 50 || Math.abs(positionsResult.totalUnrealizedPnl) > account.accountValue * 0.05) {
        riskStatus = "MEDIUM";
      }
      
      console.log(`Position monitoring: ${positions.length} positions, risk status: ${riskStatus}`);
      
      return {
        summary: {
          totalPositions: positions.length,
          totalPnl: positionsResult.totalUnrealizedPnl,
          totalExposure: positionsResult.riskMetrics.totalExposure,
          marginUsed: account.totalMarginUsed,
          freeMargin: account.availableMargin,
        },
        positions: monitoredPositions,
        alerts: portfolioAlerts,
        riskStatus,
      };
    } catch (error) {
      console.error('Position monitoring failed:', error);
      throw new Error(`Position monitoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});
# Hyperliquid AI Trading Intelligence Agent

Advanced cryptocurrency trading agent powered by Qwen 32B LLM and Mastra framework, designed for high-probability trading opportunities on Hyperliquid DEX.

## Project Overview

This intelligent trading agent combines advanced AI reasoning with professional trading strategies to identify and execute high-probability trades. The system focuses on data-driven analysis, emphasizing historical win rates, technical pattern recognition, and dynamic risk management scaled to account size.

### Core Features

- **Win Rate Analysis**: Primary focus on assets with proven historical success rates (>60% win rate threshold)
- **Advanced Pattern Recognition**: Real-time identification of technical patterns using actual price data
- **Dynamic Risk Management**: Automatic position sizing based on account size and win rate metrics
- **AI-Powered Decision Making**: Qwen 32B LLM for sophisticated trade reasoning and market analysis
- **Complete Trading Workflow**: From market analysis to trade execution and monitoring

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface                          │
│                     (Mastra Playground)                        │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│                   Trading Agent                                │
│              (Qwen 32B + Mastra)                              │
├─────────────────────┬───────────────────────────────────────────┤
│                     │                                         │
│  ┌─────────────────▼─────────────────┐  ┌─────────────────────┐ │
│  │      Market Analysis Tools        │  │   Account Tools     │ │
│  │                                   │  │                     │ │
│  │  • analyzeMarkets                 │  │  • getAccountInfo   │ │
│  │  • findTopOpportunities           │  │  • getPositions     │ │
│  │  • recognizePatterns              │  │  • getTradeHistory  │ │
│  │  • generateRecommendation         │  │                     │ │
│  └─────────────────┬─────────────────┘  └─────────────────────┘ │
│                    │                                            │
│  ┌─────────────────▼─────────────────┐  ┌─────────────────────┐ │
│  │      Trading Execution Tools      │  │   Risk Management   │ │
│  │                                   │  │                     │ │
│  │  • calculatePositionSize          │  │  • Dynamic Risk %   │ │
│  │  • executeTrade                   │  │  • Win Rate Adj.    │ │
│  │  • closePosition                  │  │  • Leverage Limits  │ │
│  │  • updateStopLoss                 │  │                     │ │
│  │  • monitorPositions               │  │                     │ │
│  └─────────────────┬─────────────────┘  └─────────────────────┘ │
└────────────────────┼─────────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────────┐
│                  Hyperliquid DEX                                │
│                                                                 │
│  • Real-time market data          • Order execution             │
│  • Account management             • Position monitoring         │
│  • Risk metrics                   • P&L tracking               │
└─────────────────────────────────────────────────────────────────┘
```

## Trading Tool Documentation

### Market Analysis Tools

#### `analyzeMarkets`
**Purpose**: Comprehensive market analysis with win rate focus and sentiment integration.

**Workflow**:
```
Input: symbols[], timeframe, useTopOpportunities
    ↓
Fetch Market Data → Calculate Win Rates → Generate Technical Indicators
    ↓
Integrate Fear & Greed Index → Score Opportunities → Rank by Probability
    ↓
Output: Market overview + Asset analysis + Recommendations
```

**Key Metrics**:
- Historical win rates (primary ranking factor)
- Sharpe ratio and risk-adjusted returns
- RSI, momentum, and trend analysis
- Volume and liquidity assessment
- Fear & Greed sentiment integration

#### `findTopOpportunities`

**Purpose**: Identify the highest probability trading setups across all available assets.

**Algorithm Flow**:
```
Scan Universe (30+ symbols) → Filter by Volume → Calculate Win Rates
    ↓
Technical Analysis → Pattern Recognition → Sentiment Analysis
    ↓
Advanced Scoring → Rank Opportunities → Return Top 5
```

**Scoring Weights**:
- Win Rate: 40%
- Sharpe Ratio: 20%
- Technical Momentum: 20%
- Volume/Liquidity: 10%
- Sentiment Divergence: 10%

#### `recognizePatterns`
**Purpose**: Real-time technical pattern identification using actual price data.

**Pattern Categories**:

**Bearish Reversal Patterns**:
```
Rising Wedge Pattern:
   /\    /\     ← Converging trendlines
  /  \  /  \    ← Higher highs, higher lows
 /    \/    \   ← Volume declining
/______________\ ← Breakout expected downward
```

**Bullish Continuation Patterns**:
```
Bull Flag Pattern:
      /|
     / |  ┌─── ← Consolidation after strong move
    /  |  └─── ← Volume decreases in flag
   /   |       ← Breakout continues trend upward
  /    |  /
 /     | /
```

**Confirmation Requirements**:
- Multi-timeframe alignment (1h + 4h)
- Volume validation (increase on breakouts)
- Price action confirmation
- Historical pattern success rate

#### `generateRecommendation`
**Purpose**: AI-powered trade recommendations combining all analysis factors.

**Decision Matrix**:
```
Win Rate Analysis + Technical Patterns + Sentiment → Confidence Score
    ↓
Risk Assessment + Position Sizing + Entry/Exit Levels
    ↓
Final Recommendation with Reasoning
```

### Account Management Tools

#### `getAccountInfo`
**Purpose**: Retrieve comprehensive account information for margin and risk calculations.

**Data Structure**:
```
Account Overview:
├── Account Value: $X,XXX
├── Total Margin Used: $X,XXX
├── Available Margin: $X,XXX
├── Margin Ratio: XX%
└── Free Collateral: $X,XXX
```

#### `getPositions`
**Purpose**: Monitor all open positions with real-time P&L and risk metrics.

**Position Analysis**:
```
For Each Position:
├── Symbol & Side (LONG/SHORT)
├── Size & Entry Price
├── Current P&L (USD & %)
├── Leverage & Margin Used
├── Liquidation Distance
└── Risk Alerts
```

#### `getTradeHistory`
**Purpose**: Analyze trading performance and calculate win rate statistics.

**Performance Metrics**:
- Total trades and P&L
- Win rate percentage
- Average win vs average loss
- Profit factor (gross profit/gross loss)
- Risk-adjusted returns

### Trading Execution Tools

#### `calculatePositionSize`
**Purpose**: Dynamic position sizing based on account size and risk parameters.

**Risk Scaling Algorithm**:
```
Account Size Assessment:
├── Micro (<$10): 100% risk - Account building
├── Small ($10-50): 50% risk - Aggressive growth
├── Medium ($50-500): 20% risk - Balanced approach
└── Large (>$500): 2% risk - Capital preservation

Win Rate Adjustment:
├── >70% Win Rate: 1.5x position multiplier
├── 60-70% Win Rate: 1.2x position multiplier
├── 50-60% Win Rate: 1.0x position multiplier
└── <50% Win Rate: Avoid trading
```

**Position Calculation**:
```
Risk Amount = Account Balance × Dynamic Risk %
Win Rate Adj = Risk Amount × Win Rate Multiplier
Stop Distance = |Entry Price - Stop Loss|
Base Size = Win Rate Adj ÷ Stop Distance
Final Size = Base Size × Leverage
```

#### `executeTrade`
**Purpose**: Execute trades with proper risk management and order placement.

**Execution Flow**:
```
Pre-Trade Validation → Set Leverage → Place Order → Confirm Execution
    ↓
Order Types:
├── Market Orders (IOC execution)
└── Limit Orders (GTC with spread protection)
```

#### `closePosition`
**Purpose**: Close positions partially or completely with P&L calculation.

**Closing Logic**:
```
Position Validation → Size Calculation → Reverse Order → P&L Analysis
    ↓
Support:
├── Full position closure
├── Partial position closure
└── Automatic P&L calculation
```

#### `updateStopLoss`
**Purpose**: Dynamic stop loss management for risk control.

**Stop Loss Management**:
```
Cancel Existing Stops → Calculate New Level → Place Stop Order
    ↓
Features:
├── Trailing stop functionality
├── Pattern-based stop placement
└── Risk percentage protection
```

#### `monitorPositions`
**Purpose**: Real-time position monitoring with alerts and risk assessment.

**Monitoring System**:
```
Position Analysis:
├── Real-time P&L tracking
├── Liquidation distance alerts
├── Margin usage warnings
├── Portfolio risk assessment
└── Automated alert generation

Risk Status Levels:
├── LOW: <50% margin usage
├── MEDIUM: 50-70% margin usage
├── HIGH: 70-90% margin usage
└── CRITICAL: >90% margin usage
```

### Authentication Tools

#### `authenticateUser`
**Purpose**: Secure authentication with Hyperliquid API credentials.

**Authentication Flow**:
```
Input: auth [private-key] [wallet-address]
    ↓
Validation → Connection Test → Session Creation → Account Verification
    ↓
Session Management:
├── 60-minute session timeout
├── Automatic cleanup
└── Account info caching
```

## Complete Trading Workflow Guide

### Step 1: Initial Setup and Authentication

**User Action**: Start the trading session
```
User: "I want to start trading"
```

**Agent Response**: Check authentication status and guide setup
```
Agent: "Let me check your authentication status..."
→ Calls: checkTradeAuth()
→ If not authenticated: Provides setup instructions
→ If authenticated: Proceeds to market analysis
```

**Authentication Process**:
1. Visit https://app.hyperliquid.xyz/API
2. Generate API wallet
3. Authorize for trading
4. Execute authentication command:
```
auth 0x[your-private-key] 0x[your-wallet-address]
```

### Step 2: Market Analysis and Opportunity Discovery

**User Action**: Request trading recommendations
```
User: "Show me the best trading opportunities"
```

**Agent Processing**:
```
Step 1: Market Overview
→ Calls: analyzeMarkets(useTopOpportunities: true)
→ Fetches Fear & Greed Index
→ Analyzes market sentiment

Step 2: Opportunity Scanning
→ Calls: findTopOpportunities(maxSymbols: 30, topCount: 5)
→ Scans universe for high win rate assets
→ Calculates opportunity scores

Step 3: Pattern Analysis (for top opportunities)
→ Calls: recognizePatterns() for each top asset
→ Identifies technical patterns
→ Confirms pattern validity

Step 4: Recommendation Generation
→ Calls: generateRecommendation() for best opportunity
→ Combines all analysis factors
→ Provides entry/exit strategy
```

**Agent Response Example**:
```
Top 5 Trading Opportunities (Ranked by Win Rate):

1. BTC-PERP: 74.2% Win Rate | Score: 85/100
   Setup: Rising Wedge (78% confidence) - BEARISH
   Entry: $43,250 | Target: $39,900 | Stop: $44,080
   Reasoning: Excellent win rate + bearish reversal pattern + extreme greed

2. ETH-PERP: 68.7% Win Rate | Score: 78/100
   Setup: Double Top (72% confidence) - BEARISH
   Entry: $2,845 | Target: $2,563 | Stop: $2,930
   Reasoning: Strong win rate + rejection at resistance + volume confirmation

[... additional opportunities ...]

Market Sentiment: Extreme Greed (82) - Contrarian opportunities favored
Recommendation: Focus on high win rate bearish setups
```

### Step 3: Account Assessment and Position Sizing

**User Action**: Decide to trade the recommended opportunity
```
User: "I want to trade BTC short as recommended"
```

**Agent Processing**:
```
Step 1: Account Information
→ Calls: getAccountInfo()
→ Retrieves account balance and margin details
→ Assesses available capital

Step 2: Position Size Calculation
→ Calls: calculatePositionSize(
    entryPrice: 43250,
    stopLoss: 44080,
    leverage: 3,
    symbol: "BTC-PERP",
    winRate: 74.2
)
→ Applies dynamic risk management
→ Adjusts for win rate confidence

Step 3: Risk Assessment
→ Validates position against account size
→ Checks margin requirements
→ Provides risk warnings if necessary
```

**Agent Response Example**:
```
Account Analysis:
Account Value: $2,847
Available Margin: $2,203
Dynamic Risk Used: 20% (Medium account tier)

Position Sizing for BTC-PERP Short:
Entry Price: $43,250
Stop Loss: $44,080 (1.92% distance)
Leverage: 3x
Win Rate Adjustment: 1.24x (for 74.2% win rate)

Calculated Position:
Size: 0.0423 BTC
Notional Value: $1,828
Margin Required: $609
Risk Amount: $569 (20% of account)
Max Loss: $569

Risk Assessment: MEDIUM
Warnings: None - position within safe parameters
```

### Step 4: Trade Execution

**User Action**: Confirm trade execution
```
User: "Execute the BTC short trade"
```

**Agent Processing**:
```
Step 1: Final Validation
→ Calls: getAccountInfo() (confirm sufficient margin)
→ Validates current market price
→ Confirms position parameters

Step 2: Trade Execution
→ Calls: executeTrade(
    symbol: "BTC-PERP",
    side: "sell",
    size: 0.0423,
    orderType: "limit",
    price: 43250,
    leverage: 3,
    stopLoss: 44080
)
→ Places order on Hyperliquid
→ Confirms execution

Step 3: Position Setup
→ Calls: updateStopLoss() if needed
→ Sets up monitoring parameters
```

**Agent Response Example**:
```
Trade Execution Successful!

Order Details:
Symbol: BTC-PERP
Side: SHORT
Size: 0.0423 BTC
Executed Price: $43,247
Leverage: 3x
Status: FILLED

Position Summary:
Entry: $43,247
Stop Loss: $44,080
Target 1: $41,100
Target 2: $39,900
Risk: $569 (20% of account)

Trade ID: HL_987654321
Execution Time: 2025-07-14 14:32:15 UTC
```

### Step 5: Position Monitoring and Management

**User Action**: Check position status
```
User: "How is my BTC position doing?"
```

**Agent Processing**:
```
Step 1: Position Analysis
→ Calls: getPositions()
→ Retrieves current position status
→ Calculates real-time P&L

Step 2: Risk Monitoring
→ Calls: monitorPositions()
→ Assesses current risk levels
→ Checks for alerts

Step 3: Market Update
→ Fetches current price
→ Analyzes position performance
→ Provides management suggestions
```

**Agent Response Example**:
```
BTC-PERP Position Update:

Current Status:
Position: SHORT 0.0423 BTC
Entry Price: $43,247
Current Price: $42,890
Unrealized P&L: +$151 (+26.5%)
Time in Trade: 2h 15m

Performance Metrics:
Profit Target 1: 38% complete
Distance to Stop: $1,190 (2.8%)
Position Health: GOOD

Risk Assessment:
Portfolio Risk: LOW
Margin Usage: 21.4%
No alerts

Recommendation: Position moving favorably. Consider taking partial profits at $42,500 (Target 1) and letting remainder run to Target 2.
```

### Step 6: Position Management Actions

**User Action**: Take partial profits
```
User: "Take partial profits on 50% of BTC position"
```

**Agent Processing**:
```
Step 1: Position Calculation
→ Calls: getPositions() to get current size
→ Calculates partial close amount (50% = 0.02115 BTC)
→ Validates partial close parameters

Step 2: Partial Close Execution
→ Calls: closePosition(
    symbol: "BTC-PERP",
    size: 0.02115,
    orderType: "market"
)
→ Executes partial close
→ Calculates realized P&L

Step 3: Remaining Position Update
→ Updates stop loss for remaining position
→ Recalculates risk metrics
```

**Agent Response Example**:
```
Partial Profit Taking Executed:

Closed Position:
Size Closed: 0.02115 BTC (50%)
Exit Price: $42,885
Realized P&L: +$75.50

Remaining Position:
Size: 0.02115 BTC
Entry: $43,247 (average)
Current P&L: +$76.50
Updated Risk: $284 (10% of account)

Position Status: REDUCED
Risk Level: LOW
Next Target: $39,900 (Target 2)

Recommendation: Stop loss moved to breakeven for remaining position. Let profits run to final target.
```

### Step 7: Complete Position Management

**User Action**: Monitor until exit
```
User: "Monitor position and close when appropriate"
```

**Agent Processing**:
```
Continuous Monitoring:
→ Regular calls to monitorPositions()
→ Price level monitoring
→ Pattern development tracking
→ Risk assessment updates

Exit Triggers:
→ Target level reached
→ Pattern invalidation
→ Risk parameter breach
→ Time-based exit
```

## Installation and Setup

### Prerequisites
- Node.js 20+
- pnpm (recommended package manager)
- Docker (for deployment)
- Hyperliquid account with API access

### Local Development Setup

1. **Clone and Install Dependencies**
```bash
git clone [your-repository]
cd trading-agent-challenge
pnpm install
```

2. **Environment Configuration**
```bash
cp .env.example .env
# Configure your environment variables
```

3. **Start Development Server**
```bash
pnpm run dev
```

4. **Access Playground**
Open http://localhost:8080 to test your agent

### Environment Variables

```bash
# LLM Configuration
API_BASE_URL=http://127.0.0.1:11434/api
MODEL_NAME_AT_ENDPOINT=qwen2.5:32b
HYPERLIQUID_TESTNET=false

# Production Deployment
NODE_ENV=production
PORT=8080
```

## Deployment

### Docker Deployment

1. **Build Container**
```bash
docker build -t chigozzdev/hyperliquid-trading-agent:latest .
```

2. **Test Locally**
```bash
docker run -p 8080:8080 --env-file .env yourusername/hyperliquid-trading-agent:latest
```

3. **Push to Registry**
```bash
docker push yourusername/hyperliquid-trading-agent:latest
```

### Nosana Deployment

#### Deploy Qwen 32B Model
```bash
# Install Nosana CLI
npm install -g @nosana/cli

# Fund wallet with NOS and SOL
nosana address

# Deploy model
nosana job post --file ./nos_job_def/qwen_job.json --market nvidia-3090 --timeout 200
```

#### Deploy Trading Agent
```bash
# Deploy agent
nosana job post --file ./nos_job_def/trading_agent.json --market nvidia-3060 --timeout 200
```

### Resource Requirements

| Component | GPU | VRAM | RAM | Storage |
|-----------|-----|------|-----|---------|
| Qwen 32B | Required | 64GB | 32GB | 100GB |
| Trading Agent | Optional | 0GB | 4GB | 20GB |

## Trading Strategy Details

### Primary Strategy: High Win Rate Contrarian Approach

**Core Principle**: Identify assets with proven winning track records and execute contrarian trades during sentiment extremes.

**Selection Criteria**:
- Minimum 60% historical win rate
- Sufficient liquidity (>$2M daily volume)
- Clear technical pattern confirmation
- Multi-timeframe alignment

**Execution Framework**:
1. **Extreme Greed (75-100) + High Win Rate Bearish Patterns**: Premium short opportunities
2. **Extreme Fear (0-25) + High Win Rate Bullish Patterns**: Premium long opportunities
3. **Pattern Strength Inversely Correlated with Sentiment**: Maximum opportunity when crowd is wrong

### Risk Management Philosophy

**Dynamic Risk Scaling**: Position sizes automatically adjust based on account tier to ensure tradeable amounts while maintaining appropriate risk levels.

**Account Tiers**:
- **Micro Accounts (<$10)**: 100% risk for account building
- **Small Accounts ($10-50)**: 50% risk for aggressive growth  
- **Medium Accounts ($50-500)**: 20% risk for balanced approach
- **Large Accounts (>$500)**: 2% risk for capital preservation

**Win Rate Adjustments**: Position sizes increase for assets with higher win rates, with multipliers up to 1.5x for >70% win rate assets.

## Performance Metrics

### Key Performance Indicators

- **Win Rate**: Primary metric for opportunity assessment
- **Sharpe Ratio**: Risk-adjusted return measurement
- **Maximum Drawdown**: Capital preservation metric
- **Profit Factor**: Gross profit divided by gross loss
- **Average Risk-Reward**: Target minimum 2:1 ratios

### Backtesting Results

The system emphasizes forward-looking analysis based on:
- Historical win rate patterns
- Technical pattern success rates
- Sentiment divergence profitability
- Risk-adjusted performance metrics

## Support and Documentation

### API References
- [Hyperliquid API Documentation](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api)
- [Mastra Framework Documentation](https://mastra.ai/docs)
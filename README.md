# RPC Agent Challenge

A Mastra-powered AI agent that tests and analyzes blockchain RPC endpoints across Ethereum, Polygon, BSC, Base, and Solana networks.

## Deployed Version

Access the live agent: https://434wppk4xptxrqv7weoecgdgekf6gtsyakxwxf3dsxqo.node.k8s.prd.nos.ci/

## Installation

### Prerequisites
- Node.js 16+
- Git

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/chigozzdevv/rpc-agent-challenge.git
   cd rpc-agent-challenge
   ```

2. **Install pnpm**
   ```bash
   npm install -g pnpm
   ```

3. **Install dependencies**
   ```bash
   pnpm install
   ```

4. **Configure environment**
   
   Create `.env` file:
   ```env
   API_BASE_URL=<your_api_base_url>
   MODEL_NAME_AT_ENDPOINT=qwen2.5:1.5b
   ```

   Get your API base URL:
   ```bash
   nosana job post --file nos_job_def/ollama_job.json --market nvidia-3060 --timeout 60 --wait
   ```

5. **Run the agent**
   ```bash
   pnpm dev
   ```

## Project Structure

```
rpc-agent-challenge/
├── src/
│   ├── index.ts                    # Main Mastra configuration
│   ├── config.ts                   # Model configuration  
│   └── agents/
│       └── rpc-intel/
│           ├── rpc-agent.ts        # Agent definition
│           └── rpc-tools.ts        # RPC testing tools
├── nos_job_def/
│   └── ollama_job.json            # Nosana job definition
├── .env                           # Environment variables
├── .gitignore
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── README.md
```

## Tools

### Test RPC Performance
Tests individual RPC endpoints for response time, availability, and reliability. Returns metrics including latency, block height, and tier classification (free/premium).

### Compare Network RPCs
Benchmarks all available endpoints for a specific blockchain network. Provides rankings by speed, online/offline status, and categorizes endpoints by tier.

### Recommend RPC
Analyzes your requirements (use case, budget, performance needs) and suggests optimal primary and backup endpoints. Considers factors such as latency requirements for trading bots, reliability for DeFi protocols, and cost constraints.

### Generate Integration Code
Creates production-ready code for ethers.js, web3.js, viem, or solana-web3.js. Includes optional features:
- Retry logic with exponential backoff
- Automatic failover between multiple endpoints
- Connection pooling
- Error handling

### Diagnose RPC Issue
Identifies root causes of RPC problems (timeouts, rate limiting, offline endpoints) and provides specific solutions. Tests alternative endpoints and recommends immediate replacements.

### Get All Network Status
Comprehensive health check across all supported networks. Shows average response times, fastest providers per network, and infrastructure recommendations.

## Supported Networks

| Network | Chain Type | Currency |
|---------|------------|----------|
| Ethereum | EVM | ETH |
| Polygon | EVM Layer 2 | MATIC |
| BSC | EVM | BNB |
| Base | EVM Layer 2 | ETH |
| Solana | Non-EVM | SOL |

## RPC Tiers

### Free Tier
- **Providers**: PublicNode, Ankr, dRPC, official endpoints
- **Rate Limits**: 10-100 requests/10 seconds
- **Response Time**: 200-1000ms
- **Use Cases**: Development, testing, prototypes

### Premium Tier
- **Providers**: Alchemy, Infura, QuickNode
- **Rate Limits**: Higher or unlimited
- **Response Time**: <200ms
- **Use Cases**: Production apps, trading, high-volume

## Usage Examples

### Testing Performance
```
"Test all Solana RPCs"
"Compare Ethereum endpoints"
"What's the fastest free RPC for Base?"
```

### Getting Recommendations
```
"Recommend RPC for my DeFi protocol on Polygon"
"I need low-latency RPC for trading on BSC"
"Best free options for NFT project on Ethereum"
```

### Troubleshooting
```
"My Solana RPC is timing out"
"Getting rate limited on Polygon"
"BSC endpoint returns 429 errors"
```

### Code Generation
```
"Generate ethers.js code with failover for Ethereum"
"Create Solana connection with retry logic"
"Web3.js setup for BSC with multiple endpoints"
```

## Important Notes

- Real-time testing means results reflect current network conditions
- Free RPCs enforce rate limits - agent will warn when approaching limits
- Premium RPCs require API keys from providers
- Geographic location affects response times
- Network congestion can impact all endpoints during high activity
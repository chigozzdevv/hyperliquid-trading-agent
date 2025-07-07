import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// tools interface

interface RPCResponse {
  jsonrpc: string;
  result?: any;
  error?: { code: number; message: string };
  id: number;
}

interface NetworkConfig {
  name: string;
  chainId?: number;
  testMethod: string;
  testParams: any[];
  currency: string;
}

interface RPCEndpoint {
  url: string;
  provider: string;
  tier: 'free' | 'premium';
  note?: string;
}

const NETWORKS: Record<string, NetworkConfig> = {
  ethereum: { name: "Ethereum", chainId: 1, testMethod: "eth_blockNumber", testParams: [], currency: "ETH" },
  polygon: { name: "Polygon", chainId: 137, testMethod: "eth_blockNumber", testParams: [], currency: "MATIC" },
  bsc: { name: "BSC", chainId: 56, testMethod: "eth_blockNumber", testParams: [], currency: "BNB" },
  base: { name: "Base", chainId: 8453, testMethod: "eth_blockNumber", testParams: [], currency: "ETH" },
  solana: { name: "Solana", testMethod: "getSlot", testParams: [], currency: "SOL" }
};

// rpc endpoints (can be extended to accomodate more). All response will be based on this, we have agent fallback tho

const RPC_ENDPOINTS: Record<string, RPCEndpoint[]> = {
  ethereum: [
    { url: "https://ethereum-rpc.publicnode.com", provider: "PublicNode", tier: "free" },
    { url: "https://rpc.ankr.com/eth", provider: "Ankr", tier: "free" },
    { url: "https://cloudflare-eth.com", provider: "Cloudflare", tier: "free" },
    { url: "https://rpc.flashbots.net", provider: "Flashbots", tier: "free" },
    { url: "https://eth.drpc.org", provider: "dRPC", tier: "free" },
    { url: "https://ethereum.blockpi.network/v1/rpc/public", provider: "BlockPI", tier: "free" },
    { url: "https://eth-mainnet.public.blastapi.io", provider: "Blast", tier: "free" },
    { url: "https://1rpc.io/eth", provider: "1RPC", tier: "free" },
    { url: "https://eth.meowrpc.com", provider: "MeowRPC", tier: "free" },
    { url: "https://mainnet.gateway.tenderly.co", provider: "Tenderly", tier: "free" },
    { url: "https://eth-mainnet.g.alchemy.com/v2/demo", provider: "Alchemy", tier: "premium", note: "Replace 'demo' with API key" },
    { url: "https://mainnet.infura.io/v3/demo", provider: "Infura", tier: "premium", note: "Replace 'demo' with API key" }
  ],
  polygon: [
    { url: "https://polygon-rpc.com", provider: "Polygon RPC", tier: "free" },
    { url: "https://polygon-mainnet.public.blastapi.io", provider: "Blast", tier: "free" },
    { url: "https://rpc.ankr.com/polygon", provider: "Ankr", tier: "free" },
    { url: "https://polygon.drpc.org", provider: "dRPC", tier: "free" },
    { url: "https://polygon.blockpi.network/v1/rpc/public", provider: "BlockPI", tier: "free" },
    { url: "https://rpc-mainnet.matic.network", provider: "Matic Network", tier: "free" },
    { url: "https://matic-mainnet.chainstacklabs.com", provider: "Chainstack", tier: "free" },
    { url: "https://polygon.meowrpc.com", provider: "MeowRPC", tier: "free" },
    { url: "https://1rpc.io/matic", provider: "1RPC", tier: "free" },
    { url: "https://polygon.api.onfinality.io/public", provider: "OnFinality", tier: "free" },
    { url: "https://polygon-mainnet.g.alchemy.com/v2/demo", provider: "Alchemy", tier: "premium", note: "Replace 'demo' with API key" },
    { url: "https://polygon-mainnet.infura.io/v3/demo", provider: "Infura", tier: "premium", note: "Replace 'demo' with API key" }
  ],
  bsc: [
    { url: "https://bsc-dataseed.bnbchain.org", provider: "BNB Chain", tier: "free" },
    { url: "https://bsc-rpc.publicnode.com", provider: "PublicNode", tier: "free" },
    { url: "https://rpc.ankr.com/bsc", provider: "Ankr", tier: "free" },
    { url: "https://bsc.drpc.org", provider: "dRPC", tier: "free" },
    { url: "https://bsc-dataseed1.bnbchain.org", provider: "BNB Chain 1", tier: "free" },
    { url: "https://bsc-dataseed2.bnbchain.org", provider: "BNB Chain 2", tier: "free" },
    { url: "https://bsc-dataseed3.bnbchain.org", provider: "BNB Chain 3", tier: "free" },
    { url: "https://bsc-dataseed4.bnbchain.org", provider: "BNB Chain 4", tier: "free" },
    { url: "https://bsc.blockpi.network/v1/rpc/public", provider: "BlockPI", tier: "free" },
    { url: "https://1rpc.io/bnb", provider: "1RPC", tier: "free" },
    { url: "https://bsc.meowrpc.com", provider: "MeowRPC", tier: "free" },
    { url: "https://bsc-mainnet.public.blastapi.io", provider: "Blast", tier: "free" }
  ],
  base: [
    { url: "https://mainnet.base.org", provider: "Base Official", tier: "free" },
    { url: "https://base-rpc.publicnode.com", provider: "PublicNode", tier: "free" },
    { url: "https://rpc.ankr.com/base", provider: "Ankr", tier: "free" },
    { url: "https://base.drpc.org", provider: "dRPC", tier: "free" },
    { url: "https://base.blockpi.network/v1/rpc/public", provider: "BlockPI", tier: "free" },
    { url: "https://base.meowrpc.com", provider: "MeowRPC", tier: "free" },
    { url: "https://1rpc.io/base", provider: "1RPC", tier: "free" },
    { url: "https://base.api.onfinality.io/public", provider: "OnFinality", tier: "free" },
    { url: "https://base-mainnet.public.blastapi.io", provider: "Blast", tier: "free" },
    { url: "https://gateway.tenderly.co/public/base", provider: "Tenderly", tier: "free" },
    { url: "https://base-mainnet.g.alchemy.com/v2/demo", provider: "Alchemy", tier: "premium", note: "Replace 'demo' with API key" },
    { url: "https://base-mainnet.infura.io/v3/demo", provider: "Infura", tier: "premium", note: "Replace 'demo' with API key" }
  ],
  solana: [
    { url: "https://api.mainnet-beta.solana.com", provider: "Solana Labs", tier: "free" },
    { url: "https://solana-rpc.publicnode.com", provider: "PublicNode", tier: "free" },
    { url: "https://rpc.ankr.com/solana", provider: "Ankr", tier: "free" },
    { url: "https://solana.drpc.org", provider: "dRPC", tier: "free" },
    { url: "https://api.metaplex.solana.com", provider: "Metaplex", tier: "free" },
    { url: "https://solana-mainnet.rpc.extrnode.com", provider: "ExtrNode", tier: "free" },
    { url: "https://solana.api.onfinality.io/public", provider: "OnFinality", tier: "free" },
    { url: "https://solana-mainnet.public.blastapi.io", provider: "Blast", tier: "free" },
    { url: "https://mainnet.helius-rpc.com", provider: "Helius Public", tier: "free" },
    { url: "https://api.syndica.io/access-token/public", provider: "Syndica Public", tier: "free" },
    { url: "https://solana-mainnet.g.alchemy.com/v2/demo", provider: "Alchemy", tier: "premium", note: "Replace 'demo' with API key" },
    { url: "https://rpc.quicknode.com/demo", provider: "QuickNode", tier: "premium", note: "Replace 'demo' with API key" }
  ]
};

const testRpcEndpoint = async (url: string, network: NetworkConfig): Promise<{
  url: string;
  provider: string;
  tier: 'free' | 'premium';
  status: 'online' | 'offline';
  responseTime: number;
  blockHeight?: number;
  error?: string;
}> => {
  const startTime = Date.now();
  
  const allEndpoints = RPC_ENDPOINTS[Object.keys(NETWORKS).find(key => NETWORKS[key] === network) || ''] || [];
  const endpointInfo = allEndpoints.find(ep => ep.url === url) || { url, provider: 'Unknown', tier: 'free' as const };
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const requestBody = network.name === 'Solana' 
      ? {
          jsonrpc: '2.0',
          method: network.testMethod,
          params: network.testParams.length > 0 ? network.testParams : undefined,
          id: 1
        }
      : {
          jsonrpc: '2.0',
          method: network.testMethod,
          params: network.testParams,
          id: 1
        };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      return { 
        ...endpointInfo,
        status: 'offline', 
        responseTime, 
        error: `HTTP ${response.status}: ${response.statusText}` 
      };
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return { 
        ...endpointInfo,
        status: 'offline', 
        responseTime, 
        error: 'Invalid response format - not JSON' 
      };
    }
    
    const data: RPCResponse = await response.json();
    
    if (data.error) {
      return { 
        ...endpointInfo,
        status: 'offline', 
        responseTime, 
        error: `RPC Error ${data.error.code}: ${data.error.message}` 
      };
    }
    
    let blockHeight: number | undefined;
    if (network.name === 'Solana' && data.result) {
      blockHeight = typeof data.result === 'number' ? data.result : data.result.slot;
    } else if (data.result) {
      blockHeight = parseInt(data.result, 16);
    }
    
    return { 
      ...endpointInfo,
      status: 'online', 
      responseTime, 
      blockHeight 
    };
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    let errorMessage = 'Unknown error';
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = 'Request timeout (10s)';
      } else {
        errorMessage = error.message;
      }
    }
    
    return { 
      ...endpointInfo,
      status: 'offline', 
      responseTime, 
      error: errorMessage 
    };
  }
};

export const testRpcPerformance = createTool({
  id: "test-rpc-performance",
  description: "Test performance of a specific RPC endpoint",
  inputSchema: z.object({
    rpcUrl: z.string().describe("RPC endpoint URL to test"),
    network: z.enum(["ethereum", "polygon", "bsc", "base", "solana"]).describe("Network type")
  }),
  outputSchema: z.object({
    status: z.enum(["online", "offline"]),
    responseTime: z.number(),
    blockHeight: z.number().optional(),
    provider: z.string(),
    tier: z.enum(["free", "premium"]),
    analysis: z.string(),
    recommendation: z.string()
  }),
  execute: async ({ context }) => {
    const { rpcUrl, network } = context;
    const networkConfig = NETWORKS[network];
    const result = await testRpcEndpoint(rpcUrl, networkConfig);
    
    let analysis = '';
    if (result.status === 'online') {
      const speed = result.responseTime < 200 ? 'Excellent' : 
                    result.responseTime < 500 ? 'Good' : 
                    result.responseTime < 1000 ? 'Fair' : 'Slow';
      analysis = `[ONLINE] ${result.responseTime}ms response from ${result.provider} (${result.tier} tier). ${speed} performance${result.blockHeight ? `, Block: ${result.blockHeight}` : ''}.`;
    } else {
      analysis = `[OFFLINE] ${result.provider} (${result.tier}). Error: ${result.error}`;
    }
    
    const recommendation = result.status === 'online' && result.responseTime < 500
      ? `Recommended for production use on ${networkConfig.name}. ${result.tier === 'premium' ? 'Premium service with better reliability' : 'Free tier suitable for development/light usage'}.`
      : result.status === 'online' && result.responseTime < 1000
      ? `Acceptable for development. Consider faster alternatives for production.`
      : `Consider alternative providers for better reliability and performance.`;
    
    return {
      status: result.status,
      responseTime: result.responseTime,
      blockHeight: result.blockHeight,
      provider: result.provider,
      tier: result.tier,
      analysis,
      recommendation
    };
  }
});

export const compareNetworkRpcs = createTool({
  id: "compare-network-rpcs",
  description: "Compare all RPC endpoints for a specific network",
  inputSchema: z.object({
    network: z.enum(["ethereum", "polygon", "bsc", "base", "solana"]).describe("Network to test"),
    useCase: z.string().optional().describe("Specific use case (e.g., 'DeFi', 'NFT', 'trading')"),
    tierFilter: z.enum(["free", "premium", "all"]).optional().default("all").describe("Filter by RPC tier")
  }),
  outputSchema: z.object({
    summary: z.string(),
    fastest: z.object({
      url: z.string(),
      provider: z.string(),
      tier: z.string(),
      responseTime: z.number()
    }),
    rankings: z.array(z.string()),
    tierBreakdown: z.object({
      free: z.number(),
      premium: z.number()
    }),
    recommendation: z.string()
  }),
  execute: async ({ context }) => {
    const { network, useCase = "general", tierFilter = "all" } = context;
    const networkConfig = NETWORKS[network];
    const allEndpoints = RPC_ENDPOINTS[network];
    
    const endpoints = tierFilter === "all" 
      ? allEndpoints 
      : allEndpoints.filter(ep => ep.tier === tierFilter);
    
    const results = await Promise.all(
      endpoints.map(ep => testRpcEndpoint(ep.url, networkConfig))
    );
    
    const onlineResults = results.filter(r => r.status === 'online');
    const sortedResults = onlineResults.sort((a, b) => a.responseTime - b.responseTime);
    
    const fastest = sortedResults[0];
    const rankings = sortedResults.slice(0, 10).map((r, i) => 
      `${i + 1}. ${r.provider} (${r.tier}): ${r.responseTime}ms`
    );
    
    const tierBreakdown = {
      free: results.filter(r => r.tier === 'free' && r.status === 'online').length,
      premium: results.filter(r => r.tier === 'premium' && r.status === 'online').length
    };
    
    const useCaseAdvice = useCase.toLowerCase().includes('defi') || useCase.toLowerCase().includes('trading')
      ? "For DeFi/Trading: Prioritize <200ms latency. Consider premium RPCs for production."
      : useCase.toLowerCase().includes('nft') 
      ? "For NFTs: Ensure reliable uptime and good eth_getLogs performance."
      : "General use: Balance speed, reliability, and cost.";
    
    const tierAdvice = tierFilter === "free" 
      ? " (Free tier only)"
      : tierFilter === "premium"
      ? " (Premium tier only)"
      : "";
    
    const summary = `Tested ${results.length} ${networkConfig.name} RPCs${tierAdvice}. [ONLINE: ${onlineResults.length}] [OFFLINE: ${results.length - onlineResults.length}]`;
    
    return {
      summary,
      fastest: fastest ? { 
        url: fastest.url, 
        provider: fastest.provider,
        tier: fastest.tier,
        responseTime: fastest.responseTime 
      } : {
        url: "none",
        provider: "None available",
        tier: "unknown",
        responseTime: 0
      },
      rankings,
      tierBreakdown,
      recommendation: `${useCaseAdvice} ${fastest ? `Best: ${fastest.provider} (${fastest.responseTime}ms)` : 'No RPCs available'}.`
    };
  }
});

export const recommendRpc = createTool({
  id: "recommend-rpc",
  description: "Get personalized RPC recommendation based on requirements",
  inputSchema: z.object({
    network: z.enum(["ethereum", "polygon", "bsc", "base", "solana"]).describe("Target network"),
    useCase: z.string().describe("Use case (e.g., 'DeFi protocol', 'NFT marketplace', 'trading bot')"),
    priority: z.enum(["speed", "reliability", "cost", "features"]).describe("Primary priority"),
    budget: z.enum(["free", "low", "medium", "high"]).optional().default("medium").describe("Budget constraint"),
    region: z.string().optional().describe("Geographic region")
  }),
  outputSchema: z.object({
    primaryRecommendation: z.object({
      url: z.string(),
      provider: z.string(),
      tier: z.string(),
      responseTime: z.number()
    }),
    backupRecommendation: z.object({
      url: z.string(),
      provider: z.string(),
      tier: z.string(),
      responseTime: z.number()
    }),
    reasoning: z.string(),
    implementationTips: z.array(z.string()),
    costEstimate: z.string(),
    freeAlternatives: z.array(z.string())
  }),
  execute: async ({ context }) => {
    const { network, useCase, priority, budget = "medium", region } = context;
    const networkConfig = NETWORKS[network];
    const allEndpoints = RPC_ENDPOINTS[network];
    
    const budgetFilter = budget === "free" 
      ? allEndpoints.filter(ep => ep.tier === 'free')
      : allEndpoints;
    
    const results = await Promise.all(
      budgetFilter.slice(0, 8).map(ep => testRpcEndpoint(ep.url, networkConfig))
    );
    
    const onlineResults = results.filter(r => r.status === 'online');
    
    let sortedResults = [...onlineResults];
    if (priority === 'speed') {
      sortedResults.sort((a, b) => a.responseTime - b.responseTime);
    } else if (priority === 'cost') {
      sortedResults.sort((a, b) => {
        if (a.tier === 'free' && b.tier === 'premium') return -1;
        if (a.tier === 'premium' && b.tier === 'free') return 1;
        return a.responseTime - b.responseTime;
      });
    } else {
      const reliableProviders = ['Alchemy', 'Infura', 'PublicNode', 'Ankr', 'Solana Labs'];
      sortedResults.sort((a, b) => {
        const aReliable = reliableProviders.some(p => a.provider.includes(p));
        const bReliable = reliableProviders.some(p => b.provider.includes(p));
        if (aReliable && !bReliable) return -1;
        if (!aReliable && bReliable) return 1;
        return a.responseTime - b.responseTime;
      });
    }
    
    const primary = sortedResults[0];
    const backup = sortedResults[1];
    
    const tips = [
      "Implement connection pooling for better performance",
      "Set up retry logic with exponential backoff",
      "Monitor RPC response times and implement automatic failover",
      priority === 'speed' ? "Use request batching to reduce latency" : "Use multiple RPCs for redundancy",
      budget === 'free' ? "Monitor rate limits (typically 10-100 req/10s)" : "Consider dedicated nodes for guaranteed performance"
    ];
    
    const reasoning = primary ? `Selected ${primary.provider} for ${useCase} because: ${
      priority === 'speed' ? `Fastest response (${primary.responseTime}ms)` :
      priority === 'reliability' ? `High reliability (${primary.tier} tier, ${primary.responseTime}ms)` :
      priority === 'cost' ? `Best free option (${primary.responseTime}ms)` :
      `Optimal features for ${useCase} (${primary.tier} tier)`
    }` : "No suitable RPC found";
    
    const costEstimate = budget === 'free' || primary?.tier === 'free'
      ? "Free tier: $0/month (rate limited, ~10-100 req/10s)"
      : budget === 'low'
      ? "Budget: $0-50/month (better limits)"
      : budget === 'medium'
      ? "Standard: $50-200/month (production ready)" 
      : "Premium: $200+/month (dedicated resources)";
    
    const freeAlternatives = onlineResults
      .filter(r => r.tier === 'free')
      .slice(0, 3)
      .map(r => `${r.provider}: ${r.responseTime}ms`);
    
    return {
      primaryRecommendation: primary ? {
        url: primary.url,
        provider: primary.provider,
        tier: primary.tier,
        responseTime: primary.responseTime
      } : {
        url: "No suitable RPC found",
        provider: "None",
        tier: "unknown",
        responseTime: 0
      },
      backupRecommendation: backup ? {
        url: backup.url,
        provider: backup.provider,
        tier: backup.tier,
        responseTime: backup.responseTime
      } : {
        url: "No backup available",
        provider: "None",
        tier: "unknown",
        responseTime: 0
      },
      reasoning,
      implementationTips: tips,
      costEstimate,
      freeAlternatives: freeAlternatives.length > 0 ? freeAlternatives : ["No free alternatives available"]
    };
  }
});

export const generateIntegrationCode = createTool({
  id: "generate-integration-code",
  description: "Generate production-ready integration code for RPC setup",
  inputSchema: z.object({
    framework: z.enum(["ethers", "web3js", "viem", "solana-web3"]).describe("Framework to use"),
    rpcUrl: z.string().describe("RPC endpoint URL"),
    network: z.enum(["ethereum", "polygon", "bsc", "base", "solana"]).describe("Network type"),
    features: z.array(z.string()).optional().describe("Required features (e.g., 'retry', 'failover', 'caching')")
  }),
  outputSchema: z.object({
    code: z.string(),
    explanation: z.string(),
    dependencies: z.array(z.string()),
    nextSteps: z.array(z.string())
  }),
  execute: async ({ context }) => {
    const { framework, rpcUrl, network, features = [] } = context;
    const networkConfig = NETWORKS[network];
    
    let code = "";
    let dependencies: string[] = [];
    
    if (framework === "ethers") {
      dependencies = ["ethers@^6.0.0"];
      code = `import { ethers } from 'ethers';

class ResilientProvider {
  private providers: ethers.JsonRpcProvider[];
  private currentIndex: number = 0;
  
  constructor(rpcUrls: string[]) {
    this.providers = rpcUrls.map(url => 
      new ethers.JsonRpcProvider(url, {
        chainId: ${networkConfig.chainId || 'undefined'},
        name: '${network}'
      })
    );
  }

${features.includes('retry') ? `
  async safeCall<T>(method: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await method();
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }` : ''}

${features.includes('failover') ? `
  async callWithFailover<T>(method: (provider: ethers.JsonRpcProvider) => Promise<T>): Promise<T> {
    const startIndex = this.currentIndex;
    let attempts = 0;
    
    while (attempts < this.providers.length) {
      try {
        const provider = this.providers[this.currentIndex];
        return await method(provider);
      } catch (error: any) {
        console.warn(\`Provider \${this.currentIndex} failed:\`, error);
        this.currentIndex = (this.currentIndex + 1) % this.providers.length;
        attempts++;
        
        if (this.currentIndex === startIndex) {
          throw new Error('All providers failed');
        }
      }
    }
    throw new Error('Failed to execute call');
  }` : ''}

  getProvider(): ethers.JsonRpcProvider {
    return this.providers[this.currentIndex];
  }
}

const provider = new ResilientProvider([
  "${rpcUrl}",
  "https://rpc.ankr.com/${network}",
  "https://${network}.drpc.org"
]);

export async function getBlockNumber(): Promise<number> {
  ${features.includes('failover') ? 
    'return await provider.callWithFailover(p => p.getBlockNumber());' : 
    'return await provider.getProvider().getBlockNumber();'}
}

export async function getBalance(address: string): Promise<bigint> {
  ${features.includes('failover') ? 
    'return await provider.callWithFailover(p => p.getBalance(address));' : 
    'return await provider.getProvider().getBalance(address);'}
}

export { provider };`;
    } else if (framework === "solana-web3") {
      dependencies = ["@solana/web3.js@^1.87.0"];
      code = `import { 
  Connection, 
  clusterApiUrl, 
  PublicKey,
  Commitment,
  ConnectionConfig 
} from '@solana/web3.js';

const connectionConfig: ConnectionConfig = {
  commitment: 'confirmed' as Commitment,
  wsEndpoint: undefined,
  httpHeaders: {
    'Content-Type': 'application/json',
  },
  confirmTransactionInitialTimeout: 60000,
  disableRetryOnRateLimit: false,
};

${features.includes('retry') ? `
class ResilientConnection extends Connection {
  private maxRetries: number = 3;
  
  async safeRequest<T>(method: () => Promise<T>): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await method();
      } catch (error: any) {
        lastError = error;
        
        if (error.message?.includes('429') || error.message?.includes('rate')) {
          const delay = Math.min(2000 * Math.pow(2, attempt), 20000);
          console.warn(\`Rate limited, waiting \${delay}ms...\`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (attempt < this.maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }
}` : ''}

${features.includes('failover') ? `
class FailoverConnectionManager {
  private connections: Connection[];
  private currentIndex: number = 0;
  
  constructor(endpoints: string[]) {
    this.connections = endpoints.map(endpoint => 
      new Connection(endpoint, connectionConfig)
    );
  }
  
  async execute<T>(method: (conn: Connection) => Promise<T>): Promise<T> {
    const startIndex = this.currentIndex;
    let attempts = 0;
    
    while (attempts < this.connections.length) {
      try {
        const connection = this.connections[this.currentIndex];
        return await method(connection);
      } catch (error) {
        console.warn(\`Connection \${this.currentIndex} failed:\`, error);
        this.currentIndex = (this.currentIndex + 1) % this.connections.length;
        attempts++;
        
        if (this.currentIndex === startIndex) {
          throw new Error('All connections failed');
        }
      }
    }
    throw new Error('Failed to execute request');
  }
  
  getConnection(): Connection {
    return this.connections[this.currentIndex];
  }
}

const connectionManager = new FailoverConnectionManager([
  "${rpcUrl}",
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com"
]);` : `
const connection = new Connection("${rpcUrl}", connectionConfig);`}

export async function getSlot(): Promise<number> {
  ${features.includes('failover') ? 
    'return await connectionManager.execute(conn => conn.getSlot());' :
    features.includes('retry') ?
    'return await connection.safeRequest(() => connection.getSlot());' :
    'return await connection.getSlot();'}
}

export async function getBalance(pubkey: string): Promise<number> {
  const publicKey = new PublicKey(pubkey);
  ${features.includes('failover') ? 
    'return await connectionManager.execute(conn => conn.getBalance(publicKey));' :
    features.includes('retry') ?
    'return await connection.safeRequest(() => connection.getBalance(publicKey));' :
    'return await connection.getBalance(publicKey);'}
}

export async function getLatestBlockhash() {
  ${features.includes('failover') ? 
    'return await connectionManager.execute(conn => conn.getLatestBlockhash());' :
    features.includes('retry') ?
    'return await connection.safeRequest(() => connection.getLatestBlockhash());' :
    'return await connection.getLatestBlockhash();'}
}

export { ${features.includes('failover') ? 'connectionManager' : 'connection'} };`;
    }
    
    const explanation = `Production-ready ${framework} setup for ${networkConfig.name} with ${features.length ? features.join(', ') : 'basic'} features.`;
    
    const nextSteps = [
      `Install: npm install ${dependencies.join(' ')}`,
      "Store RPC URLs in environment variables",
      "Add monitoring for RPC health metrics",
      "Implement request queuing for rate limits",
      "Set up performance tracking"
    ];
    
    return {
      code,
      explanation,
      dependencies,
      nextSteps
    };
  }
});

export const diagnoseRpcIssue = createTool({
  id: "diagnose-rpc-issue",
  description: "Diagnose RPC connectivity or performance issues",
  inputSchema: z.object({
    rpcUrl: z.string().describe("RPC URL experiencing issues"),
    network: z.enum(["ethereum", "polygon", "bsc", "base", "solana"]).describe("Network type"),
    symptoms: z.string().describe("Describe the issue (e.g., 'timeouts', 'slow responses', 'rate limiting')")
  }),
  outputSchema: z.object({
    diagnosis: z.string(),
    severity: z.enum(["low", "medium", "high", "critical"]),
    solutions: z.array(z.string()),
    alternatives: z.array(z.object({
      provider: z.string(),
      tier: z.string(),
      url: z.string(),
      responseTime: z.number()
    }))
  }),
  execute: async ({ context }) => {
    const { rpcUrl, network, symptoms } = context;
    const networkConfig = NETWORKS[network];
    
    const result = await testRpcEndpoint(rpcUrl, networkConfig);
    
    let diagnosis = "";
    let severity: "low" | "medium" | "high" | "critical" = "low";
    let solutions: string[] = [];
    
    if (result.status === 'offline') {
      diagnosis = `[CRITICAL] RPC endpoint is completely offline. Provider: ${result.provider}. Error: ${result.error}`;
      severity = "critical";
      solutions = [
        "Switch to backup RPC immediately",
        "Verify endpoint URL is correct and uses HTTPS",
        "Check your network connectivity",
        "Contact RPC provider support if issue persists"
      ];
    } else if (result.responseTime > 2000) {
      diagnosis = `[WARNING] RPC responding but very slowly (${result.responseTime}ms). Provider: ${result.provider} (${result.tier} tier).`;
      severity = "high";
      solutions = [
        "Implement request timeout (5-10 seconds)",
        "Switch to faster RPC provider",
        "Implement request batching to reduce calls",
        "Add connection pooling",
        result.tier === 'free' ? "Consider upgrading to premium RPC service" : "Contact provider about performance"
      ];
    } else if (symptoms.toLowerCase().includes('rate limit')) {
      diagnosis = `[RATE LIMIT] You're hitting the RPC's request limits. ${result.tier === 'free' ? 'Free tier typically allows 10-100 requests per 10 seconds.' : ''}`;
      severity = "medium";
      solutions = [
        "Implement request queuing with delays",
        result.tier === 'free' ? "Upgrade to paid tier for higher limits" : "Review and optimize usage patterns",
        "Use multiple RPC endpoints in rotation",
        "Add delays between requests (100-500ms)",
        "Implement caching for frequently accessed data"
      ];
    } else if (symptoms.toLowerCase().includes('timeout')) {
      diagnosis = `[TIMEOUT] RPC is reachable but requests are timing out.`;
      severity = "medium";
      solutions = [
        "Increase timeout to 30-60 seconds",
        "Implement retry logic with exponential backoff",
        "Try geographically closer RPC endpoints",
        "Check if specific methods are causing timeouts"
      ];
    } else {
      diagnosis = `[HEALTHY] RPC appears operational (${result.responseTime}ms response from ${result.provider}). Issue might be intermittent or client-side.`;
      severity = "low";
      solutions = [
        "Monitor for intermittent issues",
        "Implement health checks every 30s",
        "Set up alerting for issues",
        "Track performance metrics over time"
      ];
    }
    
    const allEndpoints = RPC_ENDPOINTS[network].filter(ep => ep.url !== rpcUrl);
    const alternativeTests = await Promise.all(
      allEndpoints.slice(0, 5).map(ep => testRpcEndpoint(ep.url, networkConfig))
    );
    
    const alternatives = alternativeTests
      .filter(r => r.status === 'online')
      .sort((a, b) => a.responseTime - b.responseTime)
      .slice(0, 3)
      .map(r => ({
        provider: r.provider,
        tier: r.tier,
        url: r.url,
        responseTime: r.responseTime
      }));
    
    return {
      diagnosis,
      severity,
      solutions,
      alternatives
    };
  }
});

export const getAllNetworkStatus = createTool({
  id: "get-all-network-status",
  description: "Get comprehensive status overview of all networks and RPCs",
  inputSchema: z.object({
    detailed: z.boolean().optional().describe("Include detailed performance metrics")
  }),
  outputSchema: z.object({
    summary: z.string(),
    networkStats: z.array(z.object({
      network: z.string(),
      totalRpcs: z.number(),
      onlineRpcs: z.number(),
      avgResponseTime: z.number(),
      fastestRpc: z.string(),
      fastestProvider: z.string(),
      freeRpcsOnline: z.number(),
      premiumRpcsOnline: z.number()
    })),
    globalRecommendations: z.array(z.string())
  }),
  execute: async ({ context }) => {
    const { detailed = false } = context;
    const networks = Object.keys(NETWORKS);
    const networkStats = [];
    
    for (const network of networks) {
      const networkConfig = NETWORKS[network];
      const endpoints = RPC_ENDPOINTS[network];
      
      const testEndpoints = endpoints.slice(0, 6);
      const results = await Promise.all(
        testEndpoints.map(ep => testRpcEndpoint(ep.url, networkConfig))
      );
      
      const onlineResults = results.filter(r => r.status === 'online');
      const avgResponseTime = onlineResults.length > 0 
        ? Math.round(onlineResults.reduce((sum, r) => sum + r.responseTime, 0) / onlineResults.length)
        : 0;
      
      const fastest = onlineResults.sort((a, b) => a.responseTime - b.responseTime)[0];
      
      const freeRpcsOnline = onlineResults.filter(r => r.tier === 'free').length;
      const premiumRpcsOnline = onlineResults.filter(r => r.tier === 'premium').length;
      
      networkStats.push({
        network: networkConfig.name,
        totalRpcs: endpoints.length,
        onlineRpcs: onlineResults.length,
        avgResponseTime,
        fastestRpc: fastest?.url || "None available",
        fastestProvider: fastest?.provider || "None",
        freeRpcsOnline,
        premiumRpcsOnline
      });
    }
    
    const totalRpcs = networkStats.reduce((sum, stat) => sum + stat.totalRpcs, 0);
    const totalOnline = networkStats.reduce((sum, stat) => sum + stat.onlineRpcs, 0);
    const summary = `Monitoring ${totalRpcs} RPCs across ${networks.length} networks. [ONLINE: ${totalOnline}] [${Math.round(totalOnline/totalRpcs*100)}% uptime from tested sample]`;
    
    const globalRecommendations = [
      "Always implement RPC failover in production",
      "Monitor RPC performance continuously",
      "Use multiple RPC providers for redundancy",
      "Set appropriate timeout values (5-10 seconds)",
      "Consider premium RPCs for production workloads",
      "Implement request rate limiting and queuing",
      "Test both free and premium tiers for your use case",
      "Choose geographically close endpoints for lower latency",
      "Cache frequently accessed data to reduce RPC calls",
      "Set up alerts for RPC failures and high latency"
    ];
    
    return {
      summary,
      networkStats,
      globalRecommendations
    };
  }
});
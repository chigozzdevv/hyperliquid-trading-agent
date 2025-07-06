import { createTool } from "@mastra/core/tools";
import { z } from "zod";

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

const NETWORKS: Record<string, NetworkConfig> = {
  ethereum: { name: "Ethereum", chainId: 1, testMethod: "eth_blockNumber", testParams: [], currency: "ETH" },
  polygon: { name: "Polygon", chainId: 137, testMethod: "eth_blockNumber", testParams: [], currency: "MATIC" },
  bsc: { name: "BSC", chainId: 56, testMethod: "eth_blockNumber", testParams: [], currency: "BNB" },
  base: { name: "Base", chainId: 8453, testMethod: "eth_blockNumber", testParams: [], currency: "ETH" },
  solana: { name: "Solana", testMethod: "getSlot", testParams: [], currency: "SOL" }
};

const RPC_ENDPOINTS: Record<string, string[]> = {
  ethereum: [
    "https://ethereum-rpc.publicnode.com",
    "https://rpc.ankr.com/eth",
    "https://cloudflare-eth.com",
    "https://rpc.flashbots.net",
    "https://ethereum.public-rpc.com"
  ],
  polygon: [
    "https://polygon-rpc.com",
    "https://polygon-rpc.publicnode.com",
    "https://rpc.ankr.com/polygon",
    "https://polygon.llamarpc.com",
    "https://polygon.drpc.org"
  ],
  bsc: [
    "https://bsc-dataseed.bnbchain.org",
    "https://bsc-rpc.publicnode.com",
    "https://rpc.ankr.com/bsc",
    "https://bsc.drpc.org",
    "https://bsc.public-rpc.com"
  ],
  base: [
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
    "https://rpc.ankr.com/base",
    "https://base.llamarpc.com",
    "https://base.drpc.org"
  ],
  solana: [
    "https://api.mainnet-beta.solana.com",
    "https://solana-rpc.publicnode.com",
    "https://rpc.ankr.com/solana",
    "https://solana.drpc.org",
    "https://solana.public-rpc.com"
  ]
};

const testRpcEndpoint = async (url: string, network: NetworkConfig): Promise<{
  url: string;
  status: 'online' | 'offline';
  responseTime: number;
  blockHeight?: number;
  error?: string;
}> => {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: network.testMethod,
        params: network.testParams,
        id: 1
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      return { url, status: 'offline', responseTime, error: `HTTP ${response.status}` };
    }
    
    const data: RPCResponse = await response.json();
    
    if (data.error) {
      return { url, status: 'offline', responseTime, error: data.error.message };
    }
    
    const blockHeight = network.testMethod === 'getSlot' 
      ? data.result 
      : data.result ? parseInt(data.result, 16) : undefined;
    
    return { url, status: 'online', responseTime, blockHeight };
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { url, status: 'offline', responseTime, error: errorMessage };
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
    analysis: z.string(),
    recommendation: z.string()
  }),
  execute: async ({ context }) => {
    const { rpcUrl, network } = context;
    const networkConfig = NETWORKS[network];
    const result = await testRpcEndpoint(rpcUrl, networkConfig);
    
    const analysis = result.status === 'online' 
      ? `${result.responseTime}ms response time. ${result.responseTime < 200 ? 'Excellent' : result.responseTime < 500 ? 'Good' : 'Slow'} performance.`
      : `RPC offline. Error: ${result.error}`;
    
    const recommendation = result.status === 'online' && result.responseTime < 300
      ? `Recommended for production use on ${networkConfig.name}`
      : `Consider alternative RPC for better reliability`;
    
    return {
      status: result.status,
      responseTime: result.responseTime,
      blockHeight: result.blockHeight,
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
    useCase: z.string().optional().describe("Specific use case (e.g., 'DeFi', 'NFT', 'trading')")
  }),
  outputSchema: z.object({
    summary: z.string(),
    fastest: z.object({
      url: z.string(),
      responseTime: z.number()
    }),
    rankings: z.array(z.string()),
    recommendation: z.string()
  }),
  execute: async ({ context }) => {
    const { network, useCase = "general" } = context;
    const networkConfig = NETWORKS[network];
    const endpoints = RPC_ENDPOINTS[network];
    
    const results = await Promise.all(
      endpoints.map(url => testRpcEndpoint(url, networkConfig))
    );
    
    const onlineResults = results.filter(r => r.status === 'online');
    const sortedResults = onlineResults.sort((a, b) => a.responseTime - b.responseTime);
    
    const fastest = sortedResults[0];
    const rankings = sortedResults.map((r, i) => 
      `${i + 1}. ${new URL(r.url).hostname}: ${r.responseTime}ms`
    );
    
    const useCaseAdvice = useCase.toLowerCase().includes('defi') 
      ? "For DeFi: prioritize low latency and reliable websocket support"
      : useCase.toLowerCase().includes('nft') 
      ? "For NFT: ensure good eth_getLogs performance and metadata support"
      : useCase.toLowerCase().includes('trading')
      ? "For trading: choose fastest RPC with consistent sub-200ms response times"
      : "General use: balance speed and reliability";
    
    return {
      summary: `Tested ${results.length} ${networkConfig.name} RPCs. ${onlineResults.length} online, ${results.length - onlineResults.length} offline.`,
      fastest: { url: fastest?.url || "none", responseTime: fastest?.responseTime || 0 },
      rankings,
      recommendation: `Best for ${useCase}: ${fastest?.url}. ${useCaseAdvice}`
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
    region: z.string().optional().describe("Geographic region")
  }),
  outputSchema: z.object({
    primaryRecommendation: z.string(),
    backupRecommendation: z.string(),
    reasoning: z.string(),
    implementationTips: z.array(z.string()),
    costEstimate: z.string()
  }),
  execute: async ({ context }) => {
    const { network, useCase, priority, region } = context;
    const networkConfig = NETWORKS[network];
    const endpoints = RPC_ENDPOINTS[network];
    
    const results = await Promise.all(
      endpoints.map(url => testRpcEndpoint(url, networkConfig))
    );
    
    const onlineResults = results.filter(r => r.status === 'online');
    
    let primary, backup;
    if (priority === 'speed') {
      const sorted = onlineResults.sort((a, b) => a.responseTime - b.responseTime);
      primary = sorted[0];
      backup = sorted[1];
    } else {
      const reliable = onlineResults.filter(r => r.responseTime < 500);
      primary = reliable[0] || onlineResults[0];
      backup = reliable[1] || onlineResults[1];
    }
    
    const tips = [
      "Implement connection pooling for better performance",
      "Set up retry logic with exponential backoff",
      "Monitor RPC response times and implement automatic failover",
      priority === 'speed' ? "Consider request batching to reduce latency" : "Use multiple RPCs for redundancy"
    ];
    
    const reasoning = `Selected ${primary?.url} for ${useCase} because: ${
      priority === 'speed' ? `Fastest response time (${primary?.responseTime}ms)` :
      priority === 'reliability' ? `Consistent performance and good uptime` :
      priority === 'cost' ? `Free tier with good performance` :
      `Best feature set for ${useCase}`
    }`;
    
    return {
      primaryRecommendation: primary?.url || "No suitable RPC found",
      backupRecommendation: backup?.url || "No backup available",
      reasoning,
      implementationTips: tips,
      costEstimate: priority === 'cost' ? "Free tier: $0/month" : "Premium tier: ~$50-200/month depending on usage"
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
      dependencies = ["ethers"];
      code = `import { ethers } from 'ethers';

// Production-ready ${networkConfig.name} RPC setup
const provider = new ethers.JsonRpcProvider({
  url: "${rpcUrl}",
  network: "${network}",
  pollingInterval: 4000,
  timeout: 30000
});

${features.includes('retry') ? `
// Retry wrapper with exponential backoff
export async function safeRpcCall(method: string, params: any[]) {
  const maxRetries = 3;
  const baseDelay = 1000;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await provider.send(method, params);
    } catch (error: any) {
      if (attempt === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
` : ''}

${features.includes('failover') ? `
// Failover configuration
const backupProviders = [
  new ethers.JsonRpcProvider("backup-rpc-url"),
  new ethers.JsonRpcProvider("another-backup-url")
];

export async function callWithFailover(method: string, params: any[]) {
  try {
    return await provider.send(method, params);
  } catch (error) {
    console.warn('Primary RPC failed, trying backup...', error);
    
    for (const backup of backupProviders) {
      try {
        return await backup.send(method, params);
      } catch (backupError) {
        console.warn('Backup RPC failed:', backupError);
      }
    }
    throw new Error('All RPCs failed');
  }
}
` : ''}

// Usage examples
export async function getBlockNumber() {
  return await provider.getBlockNumber();
}

export async function getBalance(address: string) {
  return await provider.getBalance(address);
}`;
    } else if (framework === "solana-web3") {
      dependencies = ["@solana/web3.js"];
      code = `import { Connection, clusterApiUrl } from '@solana/web3.js';

// Production-ready Solana RPC setup
const connection = new Connection(
  "${rpcUrl}",
  {
    commitment: 'confirmed',
    httpHeaders: {
      'Content-Type': 'application/json',
    },
    fetch: (url, options) => {
      return fetch(url, {
        ...options,
        timeout: 30000,
      });
    }
  }
);

${features.includes('retry') ? `
// Retry mechanism for Solana
export async function safeGetSlot(): Promise<number> {
  const maxRetries = 3;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await connection.getSlot();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}
` : ''}

// Usage examples
export async function getLatestSlot() {
  return await connection.getSlot();
}

export async function getAccountInfo(pubkey: string) {
  return await connection.getAccountInfo(new PublicKey(pubkey));
}`;
    }
    
    const explanation = `This code sets up a production-ready ${framework} connection to ${networkConfig.name} with ${features.length ? features.join(', ') : 'basic'} features.`;
    
    const nextSteps = [
      "Install dependencies with: npm install " + dependencies.join(' '),
      "Configure environment variables for RPC URLs",
      "Add monitoring and alerting for RPC health",
      "Implement rate limiting if needed",
      "Set up error logging and metrics"
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
    alternatives: z.array(z.string())
  }),
  execute: async ({ context }) => {
    const { rpcUrl, network, symptoms } = context;
    const networkConfig = NETWORKS[network];
    
    // Test the problematic RPC
    const result = await testRpcEndpoint(rpcUrl, networkConfig);
    
    let diagnosis = "";
    let severity: "low" | "medium" | "high" | "critical" = "low";
    let solutions: string[] = [];
    
    if (result.status === 'offline') {
      diagnosis = `RPC endpoint is completely offline. Error: ${result.error}`;
      severity = "critical";
      solutions = [
        "Switch to backup RPC immediately",
        "Check if endpoint URL is correct",
        "Verify network connectivity",
        "Contact RPC provider support"
      ];
    } else if (result.responseTime > 2000) {
      diagnosis = `RPC is responding but very slowly (${result.responseTime}ms). Performance is degraded.`;
      severity = "high";
      solutions = [
        "Implement request timeout (5-10 seconds)",
        "Switch to faster RPC provider",
        "Implement request batching",
        "Add connection pooling"
      ];
    } else if (symptoms.toLowerCase().includes('rate limit')) {
      diagnosis = "Rate limiting detected. You're hitting the RPC's request limits.";
      severity = "medium";
      solutions = [
        "Implement request queuing",
        "Upgrade to paid tier",
        "Use multiple RPC endpoints",
        "Add delays between requests"
      ];
    } else {
      diagnosis = `RPC appears healthy (${result.responseTime}ms response time)`;
      severity = "low";
      solutions = [
        "Monitor for intermittent issues",
        "Implement health checks",
        "Set up alerting"
      ];
    }
    
    // Get alternative RPCs
    const endpoints = RPC_ENDPOINTS[network];
    const alternatives = endpoints.filter(url => url !== rpcUrl).slice(0, 3);
    
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
      fastestRpc: z.string()
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
      
      const results = await Promise.all(
        endpoints.map(url => testRpcEndpoint(url, networkConfig))
      );
      
      const onlineResults = results.filter(r => r.status === 'online');
      const avgResponseTime = onlineResults.length > 0 
        ? onlineResults.reduce((sum, r) => sum + r.responseTime, 0) / onlineResults.length
        : 0;
      
      const fastest = onlineResults.sort((a, b) => a.responseTime - b.responseTime)[0];
      
      networkStats.push({
        network: networkConfig.name,
        totalRpcs: endpoints.length,
        onlineRpcs: onlineResults.length,
        avgResponseTime: Math.round(avgResponseTime),
        fastestRpc: fastest?.url || "None available"
      });
    }
    
    const totalRpcs = networkStats.reduce((sum, stat) => sum + stat.totalRpcs, 0);
    const totalOnline = networkStats.reduce((sum, stat) => sum + stat.onlineRpcs, 0);
    const summary = `Monitoring ${totalRpcs} RPCs across ${networks.length} networks. ${totalOnline} currently online (${Math.round(totalOnline/totalRpcs*100)}% uptime).`;
    
    const globalRecommendations = [
      "Always implement RPC failover in production",
      "Monitor RPC performance continuously",
      "Use multiple RPC providers for redundancy",
      "Set appropriate timeout values (5-10 seconds)",
      "Implement request rate limiting"
    ];
    
    return {
      summary,
      networkStats,
      globalRecommendations
    };
  }
});
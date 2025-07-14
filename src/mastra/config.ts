import dotenv from "dotenv";
import { createOllama } from "ollama-ai-provider";

dotenv.config();

export const modelName = process.env.MODEL_NAME_AT_ENDPOINT ?? "qwen2.5:32b";
export const baseURL = process.env.API_BASE_URL ?? "http://127.0.0.1:11434/api";

export const model = createOllama({ baseURL }).chat(modelName, {
  simulateStreaming: true,
});

export const hyperliquidConfig = {
  testnet: process.env.HYPERLIQUID_TESTNET === "true",
  enableWs: true,
};

console.log(`
╔════════════════════════════════════════════╗
║           TRADING AGENT INITIALIZED        ║
║                                            ║
║  Model: ${modelName.padEnd(32)}║
║  API: ${baseURL.padEnd(34)}║
║  Network: ${hyperliquidConfig.testnet ? "TESTNET".padEnd(30) : "MAINNET".padEnd(30)}║
╚════════════════════════════════════════════╝
`);
import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { tradingAgent } from "./agents/nosa-trading-agent/trading-agent";

export const mastra = new Mastra({
  agents: { 
    tradingAgent,
  },
  logger: new PinoLogger({
    name: "NOSA - Hyperliquid AI-Powered Trading Bot",
    level: "info",
  }),
  server: {
    port: 8080,
    timeout: 30000,
  },
});
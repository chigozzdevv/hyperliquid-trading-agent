import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { rpcAgent } from "./agents/rpc-intel/rpc-agent";

export const mastra = new Mastra({
  agents: { rpcAgent },
  logger: new PinoLogger({
    name: "RPC Monitor",
    level: "info",
  }),
  server: {
    port: 8080,
    timeout: 30000,
  },
});
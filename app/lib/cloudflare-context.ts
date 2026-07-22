import { createContext } from "react-router";

export interface AkariCloudflareContext {
  env: CloudflareEnvironment;
  ctx: ExecutionContext;
}

export const cloudflareContext = createContext<AkariCloudflareContext>();

import type { ImportConfig } from "./steam-import";
export function importConfig(): ImportConfig {
  return {
    enabled: process.env.STEAM_IMPORT_ENABLED === "true",
    apiKey: process.env.STEAM_API_KEY ?? "",
    signingSecret: process.env.STEAM_IMPORT_SIGNING_SECRET ?? "",
  };
}

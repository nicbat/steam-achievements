import { json } from "@sveltejs/kit";
import { capabilities, handleImport } from "#lib/server/steam-import.ts";
import { importConfig } from "#lib/server/import-config.ts";
export const config = { maxDuration: 30 };
export const GET = () =>
  json(capabilities(importConfig()), {
    headers: { "cache-control": "no-store" },
  });
export const POST = ({ request }: { request: Request }) =>
  handleImport(request, "start", importConfig());

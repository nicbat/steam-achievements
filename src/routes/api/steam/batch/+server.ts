import { handleImport } from "#lib/server/steam-import.ts";
import { importConfig } from "#lib/server/import-config.ts";
export const config = { maxDuration: 30 };
export const POST = ({ request }: { request: Request }) =>
  handleImport(request, "batch", importConfig());

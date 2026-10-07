import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import definitions from "./legacyGiftAssets.json";

let sources: Promise<Array<(typeof definitions)[number] & { bytes: Buffer; sha256: string }>> | undefined;
export function loadLegacyGiftAssets() {
  if (!sources) sources = Promise.all(definitions.map(async (definition) => {
    // The API build packages only these approved originals. Source paths support tests/dev.
    const roots = [join(process.cwd(), "dist/legacy-gifts"), join(process.cwd(), "artifacts/api-server/dist/legacy-gifts"), join(process.cwd(), "../mobile/assets"), join(process.cwd(), "artifacts/mobile/assets")];
    for (const root of roots) {
      try {
        const bytes = await readFile(join(root, definition.file));
        return { ...definition, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
      } catch (error: any) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    throw new Error(`Packaged gift asset missing: ${definition.file}`);
  })).catch(error => { sources = undefined; throw error; });
  return sources;
}

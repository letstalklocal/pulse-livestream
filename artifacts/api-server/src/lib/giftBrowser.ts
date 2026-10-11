import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

export async function giftBrowserExecutable() {
  if (process.env.PULSE_CHROMIUM_EXECUTABLE) {
    await access(process.env.PULSE_CHROMIUM_EXECUTABLE, constants.X_OK);
    return process.env.PULSE_CHROMIUM_EXECUTABLE;
  }
  for (const directory of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const name of ['chromium', 'chromium-browser']) {
      const executable = path.resolve(directory, name);
      try { await access(executable, constants.X_OK); return executable; } catch { /* Try next PATH entry. */ }
    }
  }
  if (process.env.NODE_ENV !== 'production') {
    try { await access('/repl/tools/bin/chromium', constants.X_OK); return '/repl/tools/bin/chromium'; } catch { /* Development fallback only. */ }
  }
  throw Error('Live gifts require Chromium. Redeploy with the declared chromium system package, or configure PULSE_CHROMIUM_EXECUTABLE to an installed browser.');
}

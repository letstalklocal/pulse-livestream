import { execFileSync } from 'node:child_process';

// Fail deployment builds early rather than discovering missing system tools on upload.
export function checkGiftMediaTools(run = execFileSync) {
  for (const tool of ['ffprobe', 'ffmpeg']) {
    try { run(tool, ['-version'], { timeout: 10_000, stdio: 'pipe' }); }
    catch { throw Error(`Gift uploads require ${tool}. Install the declared ffmpeg-full Nix dependency before building the API.`); }
  }
  const browsers = process.env.PULSE_CHROMIUM_EXECUTABLE
    ? [process.env.PULSE_CHROMIUM_EXECUTABLE]
    : ['chromium', 'chromium-browser', ...(process.env.NODE_ENV === 'production' ? [] : ['/repl/tools/bin/chromium'])];
  for (const browser of browsers) {
    try { run(browser, ['--version'], { timeout: 10_000, stdio: 'pipe' }); return; } catch { /* Try the next installed browser. */ }
  }
  throw Error('Live gifts require Chromium. Install the declared chromium Nix dependency or configure PULSE_CHROMIUM_EXECUTABLE before building the API.');
}

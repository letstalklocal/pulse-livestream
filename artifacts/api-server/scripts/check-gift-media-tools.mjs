import { execFileSync } from 'node:child_process';

// Fail deployment builds early rather than discovering missing system tools on upload.
export function checkGiftMediaTools(run = execFileSync) {
  for (const tool of ['ffprobe', 'ffmpeg']) {
    try { run(tool, ['-version'], { timeout: 10_000, stdio: 'pipe' }); }
    catch { throw Error(`Gift uploads require ${tool}. Install the declared ffmpeg-full Nix dependency before building the API.`); }
  }
}

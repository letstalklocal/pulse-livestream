import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { unlinkSync } from "node:fs";
const dir = fileURLToPath(new URL("..", import.meta.url)),
  out = dir + "/tests/.gift-presentation.cjs";
await build({
  entryPoints: [dir + "/../mobile/utils/giftPresentation.ts"],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "cjs",
  logLevel: "silent",
});
try {
  const { createGiftPresentation, expectsNativeCrown } = createRequire(
    import.meta.url,
  )(out);
  for (const order of [
    ["payment", "socket", "native"],
    ["socket", "payment", "native"],
    ["native", "socket", "payment"],
    ["socket", "native", "payment"],
  ]) {
    const display = createGiftPresentation();
    let notices = 0,
      uiCrowns = 0;
    for (const event of order) {
      if (event === "native") display.decide("gift", true);
      else if (display.claim("gift", true)) {
        notices++;
        if (!display.inVideo("gift")) uiCrowns++;
      }
    }
    assert.equal(notices, 1);
    assert.equal(
      uiCrowns,
      0,
      "native Crown must never begin a UI crown while awaiting its acknowledgement",
    );
    assert.equal(
      display.claim("gift", true),
      false,
      "a response arriving after animation completion must not replay it",
    );
    assert.equal(
      display.decide("gift", false),
      true,
      "late fallback cannot override a native frame",
    );
  }
  const failure = createGiftPresentation();
  failure.claim("failed", true);
  assert.equal(failure.decide("failed", false), false);
  assert.equal(failure.inVideo("failed"), false);
  const earlyFailure = createGiftPresentation();
  earlyFailure.decide("failed", false);
  assert.equal(earlyFailure.claim("failed", true), true);
  assert.equal(earlyFailure.inVideo("failed"), false);
  const normal = createGiftPresentation();
  normal.claim("rose", false);
  assert.equal(normal.inVideo("rose"), false);
  assert.equal(normal.claim("rose", false), false);
  assert.equal(expectsNativeCrown("Crown", 500), true);
  assert.equal(expectsNativeCrown("Crown", 499), false);
  assert.equal(expectsNativeCrown("Rose", 500), false);
  console.log(
    "PASS: reordered payment/socket/native events, no speculative UI Crown, no replay after completion, early failure fallback, late fallback protection and ordinary gifts.",
  );
} finally {
  unlinkSync(out);
}

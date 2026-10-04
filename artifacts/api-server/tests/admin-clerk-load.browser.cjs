// Real Clerk sign-in rendering only: never enters credentials or signs in.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PULSE_PLAYWRIGHT_MODULE || "playwright");

(async () => {
  const base = process.env.ADMIN_TEST_BASE || "http://localhost:8080";
  const prepared = process.env.ADMIN_TEST_PREPARED_PROXY === "1";
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({
      ignoreHTTPSErrors: process.env.ADMIN_TEST_IGNORE_HTTPS === "1",
    });
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requests.push(new URL(request.url())));
    if (prepared) {
      // Preview the local patch against the existing real production Clerk proxy.
      // This is not verification that production has deployed the patch.
      await page.route("**/api/admin/app.js", (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/javascript",
          body: fs.readFileSync(path.resolve(__dirname, "../../admin/public/app.js"), "utf8"),
        }),
      );
      await page.route("**/api/admin-data/config", async (route) => {
        const response = await route.fetch();
        const config = await response.json();
        await route.fulfill({ response, json: { ...config, proxyUrl: "/api/__clerk" } });
      });
    }
    await page.goto(base + "/api/admin/");
    await page.locator("#identifier-field").waitFor({ timeout: 25000 });
    assert.equal(await page.evaluate(() => window.Clerk.loaded), true);
    assert.equal(await page.locator("#sign-in form").count(), 1);
    assert.equal(await page.locator("#identifier-field").inputValue(), "");
    const scripts = await page.locator("script[data-clerk-publishable-key]").evaluateAll((elements) =>
      elements.map((el) => ({ src: el.src, proxyUrl: el.getAttribute("data-clerk-proxy-url") })),
    );
    assert.equal(scripts.length, 1);
    if (prepared || scripts[0].proxyUrl) {
      const proxy = new URL("/api/__clerk", base).href;
      assert.equal(scripts[0].proxyUrl, proxy);
      assert(scripts[0].src.startsWith(proxy + "/npm/"));
      assert(requests.some((url) => url.origin === new URL(base).origin && url.pathname === "/api/__clerk/v1/environment"));
      assert(!requests.some((url) => url.hostname === "clerk." + new URL(base).hostname));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator("#sign-in form").count(), 1);
    assert.equal(await page.locator("#identifier-field").isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log(`PASS real Clerk sign-in loads at desktop/390px with ${prepared ? "prepared production proxy patch" : "served configuration"}; no credentials submitted.`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

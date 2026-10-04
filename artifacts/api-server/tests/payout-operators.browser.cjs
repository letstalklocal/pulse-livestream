// Private fake credentials only; no real account/provider actions.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require(process.env.PULSE_PLAYWRIGHT_MODULE || "/tmp/pulse-catalog-playwright-wrapper.cjs");
(async () => {
  const root = path.resolve(__dirname, "../../admin/public");
  const server = http.createServer(async (req, res) => {
    const name = req.url.split("?")[0].split("/").pop() || "index.html";
    if (!["index.html", "app.js", "styles.css"].includes(name)) return res.writeHead(404).end();
    res.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "text/html");
    res.end(await fs.readFile(path.join(root, name)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    const errors = [], records = [], calls = [];
    let denied = false, holdIssue = false, started, continueIssue;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.route("https://clerk.fixture.test/npm/**", (route) => route.fulfill({ contentType: "text/javascript", body: "window.Clerk={loaded:true,session:{id:'owner-session',getToken:async()=>'owner-fixture'},load:async()=>{},addListener:()=>{}};" }));
    await page.route("**/api/admin-data/**", async (route) => {
      const request = route.request(), endpoint = new URL(request.url()).pathname.replace("/api/admin-data", "");
      if (endpoint === "/config") return route.fulfill({ json: { frontendApi: "https://clerk.fixture.test", publishableKey: "fixture" } });
      assert.equal(request.headers().authorization, "Bearer owner-fixture");
      if (denied) return route.fulfill({ status: 403, json: { error: "Access removed" } });
      if (endpoint === "/session") return route.fulfill({ json: { environment: "development", role: "owner" } });
      if (endpoint === "/payout-operators" && request.method() === "GET") return route.fulfill({ json: { credentials: records } });
      if (endpoint === "/payout-operators/issue") {
        const data = request.postDataJSON(); calls.push(data);
        assert.deepEqual(Object.keys(data).sort(), ["name", "role"]);
        const credential = { id: "op_" + records.length, name: data.name, role: data.role, environment: "development", accountKey: "business-fixture", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), revokedAt: null, lastUsedAt: null };
        records.push(credential);
        if (holdIssue) { holdIssue = false; started(); await new Promise((resolve) => { continueIssue = resolve; }); }
        return route.fulfill({ json: { credential, token: "pulse_op_" + "1".repeat(64) } });
      }
      if (endpoint.endsWith("/revoke")) {
        const id = endpoint.split("/")[2]; records.find((record) => record.id === id).revokedAt = new Date().toISOString();
        return route.fulfill({ json: { revoked: true, id } });
      }
      throw new Error("Unexpected fixture request " + endpoint);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base + "/#payout-operators");
    await page.getByText("No operator credentials issued.").waitFor();
    await page.locator('[name="name"]').fill('<img src=x onerror="alert(1)">');
    await page.locator('[name="role"]').selectOption("checker");
    await page.getByRole("button", { name: "Issue operator credential" }).click();
    await page.getByText("Credential shown once", { exact: true }).waitFor();
    assert.equal(await page.locator("#operator-token").inputValue(), "pulse_op_" + "1".repeat(64));
    assert.equal(await page.locator("#operator-token").getAttribute("type"), "password");
    assert.equal(await page.locator("#operator-records img").count(), 0);
    assert.equal(calls[0].role, "checker");
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    assert.equal(await page.locator("#operator-token").count(), 0);
    await page.getByRole("button", { name: "Revoke", exact: true }).click();
    await page.getByText("Revoked", { exact: true }).waitFor();
    assert.equal(records[0].revokedAt !== null, true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    holdIssue = true;
    const pending = new Promise((resolve) => { started = resolve; });
    await page.locator('[name="name"]').fill("Late maker");
    await page.getByRole("button", { name: "Issue operator credential" }).click();
    await pending;
    denied = true;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.getByText("Admin access required", { exact: true }).waitFor();
    continueIssue();
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#operator-token").count(), 0);
    assert.equal(await page.locator("#operator-records").count(), 0);
    assert.deepEqual(errors, []);
    console.log("PASS operator credential issue/revoke, scope selection, secret dismissal/access-loss race, escaping and 390px layout; fixture-only credentials.");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

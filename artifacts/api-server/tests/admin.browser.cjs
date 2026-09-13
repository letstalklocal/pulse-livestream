// Browser UI checks use network fixtures only. No test auth is added to production code.
const assert = require("node:assert/strict");
const { chromium } = require(
  process.env.PULSE_PLAYWRIGHT_MODULE || "playwright",
);
const base = process.env.ADMIN_TEST_BASE || "http://localhost:8080";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const config = await (await fetch(base + "/api/admin-data/config")).json();
    let denied = false,
      fail = false;
    let overviewFailure = false,
      overviewZero = false;
    const overviewFixture = {
      asOf: "2026-09-13T12:00:00Z",
      environment: "development",
      verificationEnvironment: "sandbox",
      range: {
        start: "2026-09-07T00:00:00Z",
        end: "2026-09-13T12:00:00Z",
        previousStart: "2026-08-31T12:00:00Z",
        previousEnd: "2026-09-07T00:00:00Z",
        timeZone: "UTC",
        todayPartial: true,
      },
      totalUsers: 22,
      verifiedAccounts: 11,
      verifiedPercent: 50,
      liveStreams: 2,
      newUsers: { current: 3, previous: 0, changePercent: null },
      coinsGifted: { current: 100, previous: 40, changePercent: 150 },
      growth: [1, 0, 0, 0, 0, 0, 2].map((count, i) => ({
        date: `2026-09-${String(7 + i).padStart(2, "0")}`,
        count,
      })),
    };
    const records = Array.from({ length: 22 }, (_, i) => ({
      uid: 100 + i,
      name: i === 0 ? "<img src=x onerror=alert(1)>" : "Test Account " + i,
      countryCode: i % 2 ? "ES" : null,
      createdAt: "2026-09-13T00:00:00.000Z",
      verification: {
        status: i % 2 ? "verified" : "not_started",
        isVerified: !!(i % 2),
        method: i % 2 ? "selfie" : null,
        upgradeStatus: i % 2 ? "pending" : "not_started",
        environment: "sandbox",
      },
    }));
    await page.route(config.frontendApi + "/npm/**", (r) =>
      r.fulfill({
        contentType: "application/javascript",
        body: `window.Clerk={loaded:true,session:{id:'browser-session-only',getToken:async()=>'ui-fixture'},load:async()=>{},addListener:fn=>{window.testListener=fn},mountSignIn:el=>{el.textContent='Sign-in fixture'},signOut:async options=>{window.testSignOut=options;window.Clerk.session=null}};`,
      }),
    );
    await page.route("**/api/admin-data/**", async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname.endsWith("/config")) return route.continue();
      if (denied)
        return route.fulfill({
          status: 403,
          json: { error: "This account does not have admin access." },
        });
      if (fail)
        return route.fulfill({
          status: 503,
          json: { error: "Temporarily unavailable." },
        });
      if (u.pathname.endsWith("/session"))
        return route.fulfill({
          json: { role: "owner", environment: "development" },
        });
      if (u.pathname.endsWith("/overview")) {
        if (overviewFailure)
          return route.fulfill({
            status: 503,
            json: { error: "Metrics temporarily unavailable." },
          });
        const data = structuredClone(overviewFixture);
        if (overviewZero) {
          data.totalUsers = 0;
          data.verifiedAccounts = 0;
          data.verifiedPercent = 0;
          data.liveStreams = 0;
          data.newUsers = { current: 0, previous: 0, changePercent: null };
          data.coinsGifted = { current: 0, previous: 0, changePercent: null };
          data.growth.forEach((day) => (day.count = 0));
        }
        return route.fulfill({ json: data });
      }
      const detail = u.pathname.match(/\/users\/(\d+)$/);
      if (detail)
        return route.fulfill({
          json: records.find((r) => r.uid === Number(detail[1])),
        });
      let data = records.filter((r) =>
        (r.name + " " + r.uid)
          .toLowerCase()
          .includes((u.searchParams.get("q") || "").toLowerCase()),
      );
      if (u.searchParams.get("status") === "verified")
        data = data.filter((r) => r.verification.isVerified);
      const offset = Number(u.searchParams.get("cursor") || 0);
      return route.fulfill({
        json: {
          users: data.slice(offset, offset + 20),
          nextCursor: data.length > offset + 20 ? String(offset + 20) : null,
          asOf: new Date().toISOString(),
          environment: "development",
        },
      });
    });
    await page.goto(base + "/api/admin/#users");
    await page.locator("tbody tr").first().getByText("UID 100").waitFor();
    assert.equal(await page.locator("tbody tr").count(), 20);
    assert.equal(
      await page.locator("tbody img").count(),
      0,
      "user names are escaped",
    );
    await page.locator("#next-page").click();
    await page.getByText("UID 120", { exact: true }).waitFor();
    assert.equal(await page.locator("tbody tr").count(), 2);
    await page.locator("#previous-page").click();
    await page.getByText("UID 100", { exact: true }).waitFor();
    await page.locator("#search").fill("Account 21");
    await page.getByText("UID 121", { exact: true }).waitFor();
    assert.equal(await page.locator("tbody tr").count(), 1);
    await page.locator('[data-user="121"]').first().click();
    await page
      .locator("dialog dd")
      .getByText("selfie", { exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("dialog").isVisible(), false);
    await page.locator("#search").fill("nothing-matches");
    await page.getByText("No accounts match your search.").waitFor();
    await page.locator("#search").fill("");
    await page.locator("#status-filter").selectOption("verified");
    await page.getByText("UID 101", { exact: true }).waitFor();
    assert.equal(await page.locator("tbody tr").count(), 11);
    await page.screenshot({
      path: "/home/runner/workspace/screenshots/admin-live-users-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "/home/runner/workspace/screenshots/admin-live-users-mobile.png",
      fullPage: true,
    });
    fail = true;
    await page.locator("#refresh-users").click();
    await page.getByText("Unable to load accounts", { exact: true }).waitFor();
    assert.equal(await page.locator("[data-user]").count(), 0);
    fail = false;
    await page.locator("#retry-users").click();
    await page.getByText("UID 101", { exact: true }).waitFor();
    denied = true;
    await page.locator("#refresh-users").click();
    await page
      .getByRole("heading", { name: "Admin access required" })
      .waitFor();
    assert.equal(await page.locator("[data-user]").count(), 0);
    assert.equal(await page.locator("#detail-content").innerText(), "");
    denied = false;
    await page.locator("#retry-access").click();
    await page.getByText("UID 101", { exact: true }).waitFor();
    await page.locator('[data-nav="Overview"]').click();
    await page
      .locator("#overview-metrics")
      .getByText("22", { exact: true })
      .waitFor();
    assert.equal(await page.locator("#growth-panel circle").count(), 7);
    await page.locator(".chart-data summary").click();
    assert.equal(await page.locator(".chart-data tbody tr").count(), 7);
    assert.equal(
      await page.locator(".users-panel tbody tr").count(),
      11,
      "chart table must not receive account rows",
    );
    assert.match(
      await page.locator("#overview-range").innerText(),
      /Today is partial/,
    );
    assert.match(await page.locator("#overview-metrics").innerText(), /150%/);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "/home/runner/workspace/screenshots/admin-overview-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.locator(".chart-data summary").click();
    await page.screenshot({
      path: "/home/runner/workspace/screenshots/admin-overview-desktop.png",
      fullPage: true,
    });
    overviewFailure = true;
    await page.locator("#refresh-overview").click();
    await page
      .getByText("Community growth is temporarily unavailable.")
      .waitFor();
    assert.equal(
      await page
        .locator("#overview-metrics .stat strong")
        .allTextContents()
        .then((xs) => xs.every((x) => x === "—")),
      true,
    );
    assert.equal(await page.locator(".users-panel tbody tr").count(), 11);
    overviewFailure = false;
    overviewZero = true;
    await page.locator("#refresh-overview").click();
    await page
      .getByText("No new accounts in this period.", { exact: true })
      .waitFor();
    assert.equal(
      await page
        .locator("#overview-metrics .stat strong")
        .allTextContents()
        .then((xs) => xs.every((x) => x === "0")),
      true,
    );
    assert.ok(
      !(await page.locator("#growth-panel").innerHTML()).includes("NaN"),
    );
    denied = true;
    await page.locator("#refresh-overview").click();
    await page
      .getByRole("heading", { name: "Admin access required" })
      .waitFor();
    assert.equal(
      await page.locator("#overview-metrics").count(),
      0,
      "lost access clears all metrics",
    );
    denied = false;
    await page.locator("#retry-access").click();
    await page
      .getByText("No new accounts in this period.", { exact: true })
      .waitFor();
    await page.locator("#sign-out").click();
    await page.getByText("Sign-in fixture", { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.testSignOut), {
      sessionId: "browser-session-only",
    });
    assert.equal(await page.locator("[data-user]").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: browser fixtures — search, filtering, pagination, details/Escape, XSS escaping, empty/error/retry, access loss, scoped logout, live overview/chart, overview error/zero states, desktop/mobile layout.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

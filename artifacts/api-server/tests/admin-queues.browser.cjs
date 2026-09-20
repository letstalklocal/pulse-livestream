// Network fixtures test UI only; real database/authorization are covered in admin.integration.mjs.
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
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const config = await (await fetch(base + "/api/admin-data/config")).json();
    let fail = false,
      denied = false,
      empty = false;
    await page.route(config.frontendApi + "/npm/**", (r) =>
      r.fulfill({
        contentType: "application/javascript",
        body: `window.Clerk={loaded:true,session:{id:'queue-test',getToken:async()=>'fixture'},load:async()=>{},addListener:()=>{},mountSignIn:()=>{},signOut:async()=>{window.Clerk.session=null}};`,
      }),
    );
    await page.route("**/api/admin-data/**", async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname.endsWith("/config")) return route.continue();
      if (denied)
        return route.fulfill({
          status: 403,
          json: { error: "Access removed" },
        });
      if (fail)
        return route.fulfill({
          status: 503,
          json: { error: "Temporary failure" },
        });
      if (u.pathname.endsWith("/session"))
        return route.fulfill({
          json: { role: "owner", environment: "development" },
        });
      const next = !!u.searchParams.get("cursor");
      if (
        u.pathname.endsWith("/live-streams") ||
        u.pathname.endsWith("/moderation")
      ) {
        const live = u.pathname.endsWith("/live-streams");
        return route.fulfill({
          json: {
            rows: empty
              ? []
              : [
                  live
                    ? {
                        id: next ? 1 : 2,
                        hostUid: 123,
                        hostName: "Host",
                        title: "<img src=x onerror=alert(1)>",
                        category: "General",
                        isPrivate: u.searchParams.get("filter") === "private",
                        startedAt: "2026-09-20T10:00:00Z",
                        lastHeartbeatAt: "2026-09-20T10:10:00Z",
                      }
                    : {
                        id: next ? 1 : 2,
                        targetId: 123,
                        ownerUid: null,
                        source: u.searchParams.get("filter"),
                        reason: "spam",
                        details: "<script>bad()</script>",
                        status: "pending",
                        createdAt: "2026-09-20T10:00:00Z",
                      },
                ],
            nextCursor: empty || next ? null : "2",
            asOf: new Date().toISOString(),
          },
        });
      }
      if (u.pathname.endsWith("/account-removals"))
        return route.fulfill({
          json: {
            requests: empty
              ? []
              : [
                  {
                    id: next ? 1 : 2,
                    uid: 123,
                    name: "<img src=x onerror=alert(1)>",
                    status:
                      u.searchParams.get("status") === "all"
                        ? "pending"
                        : u.searchParams.get("status"),
                    reason: "<script>bad()</script>",
                    reviewNotes: "Internal notes",
                    requestedAt: "2026-09-20T10:00:00Z",
                    reviewedAt: next ? "2026-09-20T11:00:00Z" : null,
                  },
                ],
            nextCursor: empty || next ? null : "2",
            asOf: new Date().toISOString(),
          },
        });
      if (u.pathname.endsWith("/verification-reviews"))
        return route.fulfill({
          json: {
            reviews: empty
              ? []
              : [
                  {
                    uid: next ? 122 : 123,
                    name: "Review account",
                    status:
                      u.searchParams.get("kind") === "initial"
                        ? "review_needed"
                        : "verified",
                    upgradeStatus:
                      u.searchParams.get("kind") === "initial"
                        ? "not_started"
                        : "review_needed",
                    isVerified: u.searchParams.get("kind") !== "initial",
                    method: "selfie",
                    updatedAt: "2026-09-20T10:00:00Z",
                  },
                ],
            nextCursor: empty || next ? null : "123",
            environment: "sandbox",
            asOf: new Date().toISOString(),
          },
        });
      return route.fulfill({
        status: 404,
        json: { error: "Unexpected endpoint" },
      });
    });
    for (const [section, slug, prefix, filter, value, heading, emptyText] of [
      [
        "Account removals",
        "account-removals",
        "removals",
        "removal-filter",
        "completed",
        "Account removal requests",
        "No removal requests match this status.",
      ],
      [
        "Verification",
        "verification",
        "reviews",
        "review-filter",
        "initial",
        "Verification manual review",
        "No verifications need manual review.",
      ],
    ]) {
      await page.goto(base + "/api/admin/#" + slug);
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      await page.locator("#next-" + prefix + ":enabled").waitFor();
      assert.equal(await page.locator("tbody img,tbody script").count(), 0);
      if (prefix === "reviews")
        assert.match(
          await page.locator("tbody").innerText(),
          /Verified · selfie/,
        );
      await page.locator("#next-" + prefix).click();
      await page.locator("#previous-" + prefix + ":enabled").waitFor();
      assert.equal(await page.locator("#next-" + prefix).isDisabled(), true);
      await page.locator("#previous-" + prefix).click();
      await page.locator("#next-" + prefix + ":enabled").waitFor();
      await page.locator("#" + filter).selectOption(value);
      await page
        .locator("tbody")
        .getByText(
          prefix === "reviews" ? "Initial verification" : "Completed",
          { exact: true },
        )
        .waitFor();
      assert.equal(
        await page.locator("#previous-" + prefix).isDisabled(),
        true,
      );
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        await page.screenshot({
          path: `/tmp/admin-${prefix}-${width}.png`,
          fullPage: true,
        });
      }
      empty = true;
      await page.locator("#refresh-" + prefix).click();
      await page.getByText(emptyText, { exact: true }).waitFor();
      empty = false;
      fail = true;
      await page.locator("#refresh-" + prefix).click();
      await page.locator("#retry-" + prefix).waitFor();
      fail = false;
      await page.locator("#retry-" + prefix).click();
      await page.locator("#next-" + prefix + ":enabled").waitFor();
      denied = true;
      await page.locator("#refresh-" + prefix).click();
      await page
        .getByRole("heading", { name: "Admin access required" })
        .waitFor();
      assert.equal(await page.locator("tbody").count(), 0);
      denied = false;
    }
    for (const [slug, heading, filter] of [
      ["live-streams", "Current live broadcasts", "private"],
      ["moderation", "Submitted reports", "post"],
    ]) {
      await page.goto(base + "/api/admin/#" + slug);
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      await page.locator("#next-operations:enabled").waitFor();
      assert.equal(await page.locator("tbody img,tbody script").count(), 0);
      await page.locator("#next-operations").click();
      await page.locator("#previous-operations:enabled").waitFor();
      assert.equal(await page.locator("#next-operations").isDisabled(), true);
      await page.locator("#previous-operations").click();
      await page.locator("#next-operations:enabled").waitFor();
      await page.locator("#operation-filter").selectOption(filter);
      await page
        .locator("tbody")
        .getByText(slug === "live-streams" ? "Private" : "post #123", {
          exact: true,
        })
        .waitFor();
      if (slug === "moderation") {
        await page.locator("#operation-status").selectOption("all");
        await page.locator("#next-operations:enabled").waitFor();
      }
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        await page.screenshot({
          path: `/tmp/admin-${slug}-${width}.png`,
          fullPage: true,
        });
      }
      empty = true;
      await page.locator("#refresh-operations").click();
      await page
        .getByText(
          slug === "live-streams"
            ? "No active broadcasts match this filter."
            : "No reports match these filters.",
          { exact: true },
        )
        .waitFor();
      empty = false;
      fail = true;
      await page.locator("#refresh-operations").click();
      await page.locator("#retry-operations").waitFor();
      fail = false;
      await page.locator("#retry-operations").click();
      await page.locator("#next-operations:enabled").waitFor();
      denied = true;
      await page.locator("#refresh-operations").click();
      await page
        .getByRole("heading", { name: "Admin access required" })
        .waitFor();
      assert.equal(await page.locator("tbody").count(), 0);
      denied = false;
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: removal/review/live/moderation filters, pagination, escaping, empty/error/retry, permission-loss clearing, desktop and phone-width layout.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

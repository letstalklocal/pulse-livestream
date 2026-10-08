// Browser fixtures verify staff UI behavior only; no real provider action or database writes.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require(
  process.env.PULSE_PLAYWRIGHT_MODULE ||
    "/tmp/pulse-catalog-browser-tools/node_modules/playwright",
);
const root = path.resolve(__dirname, "../../admin/public");
(async () => {
  const server = http.createServer(async (req, res) => {
    const name = req.url.split("?")[0].split("/").pop() || "index.html";
    if (!["index.html", "app.js", "styles.css"].includes(name))
      return res.writeHead(404).end();
    res.setHeader(
      "Content-Type",
      name.endsWith(".js")
        ? "application/javascript"
        : name.endsWith(".css")
          ? "text/css"
          : "text/html",
    );
    res.end(await fs.readFile(path.join(root, name)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.PULSE_CHROMIUM_EXECUTABLE || "/repl/tools/bin/chromium",
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const now = new Date().toISOString(),
      future = new Date(Date.now() + 3600000).toISOString();
    const w = {
      id: "wd_fixture",
      userId: 123,
      creatorName: "<img src=x onerror=alert(1)>",
      status: "awaiting_quote",
      grossCents: 1500,
      methodId: "co_mobile_wallet",
      recipient: {
        legalFirstName: "Colombia",
        legalLastName: "Tester",
        email: "private@example.test",
        phone: "+573001234567",
      },
      route: {
        provider: "Remitly",
        country: "Colombia",
        countryCode: "CO",
        method: "Mobile wallet",
        receiveCurrency: "COP",
        fundingMethod: "debit_card",
      },
      quote: null,
      approvedQuoteHash: null,
      checker: null,
      providerOnboardingStatus: "pending",
      providerLink: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      attempts: [],
      events: [
        {
          action: "awaiting_quote",
          actor: "creator:123",
          createdAt: now,
          evidence: { note: "<script>malicious</script>" },
        },
      ],
    };
    const unknown = {
      ...w,
      id: "wd_unknown",
      userId: 456,
      creatorName: "Second creator",
      status: "unknown",
      recipient: { legalFirstName: "Second", legalLastName: "Tester" },
      events: [],
    };
    let paused = false,
      denied = false,
      failing = false,
      conflict = false,
      holdDetails = false,
      heldDetails,
      detailStarted;
    const actions = [];
    const extraWithdrawals = [];
    let walletCoins = "6400",
      alreadyEnrolled = false;
    await page.route("https://clerk.fixture.test/npm/**", (r) =>
      r.fulfill({
        contentType: "application/javascript",
        body: `window.Clerk={loaded:true,user:{id:'operator_fixture'},session:{id:'withdrawal-ui-session',getToken:async()=>'fixture-token'},load:async()=>{},addListener:()=>{},signOut:async()=>{window.Clerk.session=null}};`,
      }),
    );
    await page.route("**/api/admin-data/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        endpoint = url.pathname.replace("/api/admin-data", "");
      if (endpoint === "/config")
        return route.fulfill({
          json: {
            frontendApi: "https://clerk.fixture.test",
            publishableKey: "fixture",
          },
        });
      assert.equal(req.headers().authorization, "Bearer fixture-token");
      if (denied)
        return route.fulfill({
          status: 403,
          json: { error: "Access removed" },
        });
      if (endpoint === "/session")
        return route.fulfill({
          json: { environment: "development", role: "owner" },
        });
      if (endpoint === "/withdrawals" && req.method() === "GET") {
        if (failing)
          return route.fulfill({
            status: 503,
            json: { error: "Queue temporarily unavailable" },
          });
        return route.fulfill({
          json: {
            withdrawals: [w, unknown, ...extraWithdrawals],
            preparationPaused: paused,
            policy: {
              repeatAllowed: false,
              fundingPolicyReady: true,
              allWalletCoinsRedeemable: true,
              coinsPerUsd: 400,
              holdDays: 0,
            },
            truncated: false,
          },
        });
      }
      if (endpoint === "/withdrawals/wd_fixture" && req.method() === "GET") {
        if (holdDetails) {
          holdDetails = false;
          await new Promise((resolve) => {
            heldDetails = resolve;
            detailStarted();
          });
        }
        return route.fulfill({ json: w });
      }
      if (endpoint === "/withdrawals/wd_unknown")
        return route.fulfill({ json: unknown });
      if (
        [
          "/withdrawals/wd_unknown/unknown",
          "/withdrawals/wd_unknown/recipient-error",
        ].includes(endpoint) &&
        req.method() === "POST"
      ) {
        const body = req.postDataJSON();
        actions.push({ action: "unknown", endpoint, body, id: unknown.id });
        unknown.recipientIssue = body.recipientIssue
          ? {
              ...body.recipientIssue,
              message: "<img src=x onerror=alert(1)> raw provider text",
            }
          : null;
        unknown.creatorStatus = unknown.recipientIssue
          ? "error"
          : unknown.status;
        unknown.errorMessage = "<script>untrusted</script> arbitrary raw error";
        return route.fulfill({ json: unknown });
      }
      if (
        endpoint === "/withdrawals/wd_unknown/recipient-correction" &&
        req.method() === "POST"
      ) {
        const body = req.postDataJSON();
        actions.push({ action: "recipient-correction", body, id: unknown.id });
        unknown.recipientCorrection = {
          ...body,
          hash: "pending-correction-hash",
          requestedAt: now,
        };
        return route.fulfill({ json: unknown });
      }
      if (
        endpoint === "/withdrawals/wd_unknown/resolve-recipient-error" &&
        req.method() === "POST"
      ) {
        const body = req.postDataJSON();
        actions.push({
          action: "resolve-recipient-error",
          body,
          id: unknown.id,
        });
        unknown.recipient = {
          ...unknown.recipient,
          phone: unknown.recipientCorrection.phone,
          email: unknown.recipientCorrection.email,
        };
        unknown.recipientCorrection = null;
        unknown.recipientIssue = null;
        unknown.creatorStatus = "awaiting_quote";
        unknown.errorMessage = null;
        unknown.status = "awaiting_quote";
        unknown.quote = null;
        unknown.checker = null;
        unknown.attempts[0].state = "canceled";
        unknown.version++;
        return route.fulfill({ json: unknown });
      }
      if (endpoint === "/withdrawals/enrollment-preview")
        return route.fulfill({
          json: {
            userId: Number(url.searchParams.get("userId")),
            name: "Existing wallet tester",
            walletCoins,
            availableUsd: "16.0000",
            alreadyEnrolled,
          },
        });
      if (endpoint === "/withdrawals/enroll") {
        const body = req.postDataJSON();
        actions.push({ action: "enroll", body });
        assert.deepEqual(Object.keys(body).sort(), [
          "expectedWalletCoins",
          "reason",
          "userId",
        ]);
        if (body.expectedWalletCoins !== walletCoins)
          return route.fulfill({
            status: 409,
            json: {
              error: "Wallet balance changed. Preview again before enabling.",
            },
          });
        alreadyEnrolled = true;
        return route.fulfill({ json: { enrolled: true, userId: body.userId } });
      }
      const extra = extraWithdrawals.find(
        (record) =>
          endpoint === `/withdrawals/${record.id}` ||
          endpoint === `/withdrawals/${record.id}/decline` ||
          endpoint === `/withdrawals/${record.id}/reconcile`,
      );
      if (extra) {
        if (req.method() === "POST" && endpoint.endsWith("/decline")) {
          const body = req.postDataJSON();
          assert.deepEqual(Object.keys(body), ["reason"]);
          extra.status = extra.attempts.length ? "unknown" : "canceled";
          extra.checker = null;
          if (!extra.attempts.length) {
            extra.balances.availableCoins = "6400";
            extra.balances.reservedCoins = "0";
          }
          extra.events.push({
            action: "human_declined",
            actor: "operator_fixture",
            createdAt: now,
            evidence: { reason: body.reason },
          });
          actions.push({ action: "decline", body, id: extra.id });
        }
        if (req.method() === "POST" && endpoint.endsWith("/reconcile")) {
          const body = req.postDataJSON();
          assert.equal(body.status, "failed");
          assert.equal(body.fundingReturned, true);
          assert.equal(body.recipientMatches, true);
          extra.status = body.status;
          extra.balances.reservedCoins = "0";
          extra.events.push({
            action: "reconciled",
            actor: "operator_fixture",
            createdAt: now,
            evidence: body,
          });
          actions.push({ action: "reconcile", body, id: extra.id });
        }
        return route.fulfill({ json: extra });
      }
      if (endpoint === "/withdrawals/pause") {
        const body = req.postDataJSON();
        paused = body.paused;
        actions.push({ action: "pause", body });
        return route.fulfill({ json: { preparationPaused: paused } });
      }
      if (endpoint.startsWith("/withdrawals/wd_fixture/")) {
        const action = endpoint.split("/").pop(),
          body = req.postDataJSON();
        actions.push({ action, body });
        if (conflict)
          return route.fulfill({
            status: 409,
            json: { error: "Quote changed" },
          });
        if (action === "quote") {
          w.quote = {
            ...body,
            hash: "current-quote-hash",
            totalEarningsDeductedCents:
              body.sendAmountCents + body.feeCents + body.taxCents,
          };
          w.status = "requested";
          w.approvedQuoteHash = null;
          w.version++;
        }
        if (action === "prepare") {
          assert.equal(body.quoteHash, w.quote.hash);
          w.status = "preparing";
          w.attempts = [
            {
              id: "attempt_fixture",
              maker: "maker_fixture",
              state: "preparing",
              leaseUntil: future,
              evidence: { evidence: body.evidence },
            },
          ];
        }
        if (action === "preparation") {
          assert.equal(body.attemptId, "attempt_fixture");
          w.status = "awaiting_human_review";
          w.attempts[0].state = w.status;
          w.attempts[0].evidence = body;
        }
        if (action === "check") {
          w.checker = {
            status:
              [
                "recipientMatches",
                "amountsMatch",
                "reservationMatches",
                "historyInspected",
                "oneTime",
              ].every((k) => body[k]) && body.autoSend === false
                ? "passed"
                : "needs_attention",
            actor: "operator_fixture",
          };
        }
        if (action === "release") {
          assert.equal(
            Object.hasOwn(body, "providerLink"),
            false,
            "email-delivered first-time payout needs no copied link",
          );
          assert.equal(Object.hasOwn(body, "providerReference"), false);
          w.providerLink = null;
          w.providerOnboardingStatus = "pending";
          w.status = "awaiting_recipient";
        }
        if (action === "reconcile") {
          assert.equal(body.recipientMatches, true);
          w.status = body.status;
          w.events.push({
            action: "reconciled",
            actor: "operator_fixture",
            createdAt: now,
            evidence: body,
          });
        }
        return route.fulfill({ json: w });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto(base + "/index.html#payout-desk");
    await page
      .getByRole("heading", { name: "Creator withdrawal queue" })
      .waitFor();
    await page.waitForFunction(() =>
      document
        .querySelector("#payout-result-count")
        ?.textContent.includes("2 loaded"),
    );
    assert.equal(await page.locator("#payout-rows img").count(), 0);
    assert.equal(
      await page.locator("#payout-enrollment-preview button").isDisabled(),
      false,
    );
    await page.locator(".payout-enrollment > summary").click();
    const preview = page.locator("#payout-enrollment-preview");
    await preview.locator("[name=userId]").fill("123");
    await preview.locator("button").click();
    await page.locator("#payout-enrollment-confirm").waitFor();
    assert.match(
      await page.locator("#payout-enrollment-result").textContent(),
      /Current wallet balance: 6400 coins/,
    );
    assert.equal(await page.locator("[name=holdDays]").count(), 0);
    await preview.locator("[name=userId]").fill("456");
    assert.equal(await page.locator("#payout-enrollment-confirm").count(), 0);
    await preview.locator("[name=userId]").fill("123");
    await preview.locator("button").click();
    const enrollment = page.locator("#payout-enrollment-confirm");
    await enrollment
      .locator("[name=reason]")
      .fill("Enable this actual account for the Colombia pilot");
    await enrollment.locator("[name=enrollmentConfirmed]").check();
    walletCoins = "6300";
    await enrollment.locator("button").click();
    await enrollment
      .locator(".payout-feedback")
      .getByText(/Wallet balance changed/)
      .waitFor();
    assert.equal(
      await enrollment.locator("[name=reason]").inputValue(),
      "Enable this actual account for the Colombia pilot",
    );
    await preview.locator("button").click();
    await enrollment
      .locator("[name=reason]")
      .fill("Enable this actual account after refreshed wallet preview");
    await enrollment.locator("[name=enrollmentConfirmed]").check();
    await enrollment.locator("button").click();
    await page
      .getByText(
        "Withdrawal access enabled for this account. Its wallet balance is unchanged.",
        { exact: false },
      )
      .waitFor();
    assert.equal(walletCoins, "6300");
    assert.deepEqual(
      actions.findLast((action) => action.action === "enroll").body,
      {
        userId: 123,
        expectedWalletCoins: "6300",
        reason: "Enable this actual account after refreshed wallet preview",
      },
    );
    assert.match(
      await page.locator("#payout-summary").textContent(),
      /\$30\.00/,
    );
    await page.locator("#payout-filter").selectOption("exceptions");
    assert.equal(await page.locator("#payout-rows tr").count(), 1);
    assert.match(
      await page.locator("#payout-rows").textContent(),
      /Error — awaiting identification/,
    );
    await page.locator("#payout-filter").selectOption("all");
    await page.locator('[data-withdrawal="wd_unknown"]').first().click();
    assert.equal(
      await page.locator('[data-payout-action="recipient-correction"]').count(),
      0,
      "generic unknown cannot invent a phone rejection",
    );
    assert.equal(
      await page
        .locator("#payout-detail .payout-action summary")
        .first()
        .textContent(),
      "Identify the rejected recipient details",
    );
    const issueForm = page.locator('[data-payout-action="unknown"]');
    await issueForm.locator("..").locator("summary").click();
    await issueForm
      .locator("[name=reason]")
      .fill(
        "Observed recipient phone and email rejected; inspect persisted contacts before resuming",
      );
    await issueForm.locator("[name=recipientIssue_phone]").check();
    await issueForm.locator("[name=recipientIssue_email]").check();
    await issueForm.locator("button").click();
    await page.locator("#payout-detail [role=alert]").waitFor();
    assert.deepEqual(
      actions.findLast((a) => a.action === "unknown").body.recipientIssue,
      {
        code: "recipient_validation_failed",
        fields: ["phone", "email"],
      },
    );
    assert.equal(
      actions.findLast((a) => a.action === "unknown").endpoint,
      "/withdrawals/wd_unknown/recipient-error",
    );
    assert.equal(
      Object.hasOwn(
        actions.findLast((a) => a.action === "unknown").body,
        "status",
      ),
      false,
      "owner error classification cannot request a payout status change",
    );
    assert.match(
      await page.locator("#payout-detail [role=alert]").textContent(),
      /Error — identified[\s\S]*phone number, email address[\s\S]*Coins remain reserved/,
    );
    assert.doesNotMatch(
      await page.locator("#payout-detail [role=alert]").textContent(),
      /raw provider text/,
    );
    assert.equal(await page.locator("#payout-detail img").count(), 0);
    assert.equal(
      await page.locator('[data-payout-action="prepare"]').count(),
      0,
    );
    assert.match(
      await page.locator("#payout-rows").textContent(),
      /Error Message:/,
    );
    await page.locator("#payout-filter").selectOption("error");
    assert.equal(
      await page.locator('#payout-rows [data-withdrawal="wd_unknown"]').count(),
      2,
    );
    assert.match(
      await page.locator("#payout-detail .payout-facts").textContent(),
      /Transfer statusError — identified[\s\S]*Error Message[\s\S]*Operational statusError — awaiting identification/,
    );
    assert.doesNotMatch(
      await page.locator("#payout-detail [role=alert]").textContent(),
      /arbitrary raw error/,
    );
    const contactForm = page.locator(
      '[data-payout-action="recipient-correction"]',
    );
    assert.equal(
      await contactForm.isVisible(),
      true,
      "identified contact issue has one immediately usable editor",
    );
    assert.equal(
      await page.locator("#payout-detail .payout-action-form:visible").count(),
      1,
    );
    assert.equal(
      await page.locator("#payout-detail .payout-quote").isVisible(),
      false,
    );
    assert.equal(
      await issueForm.locator("..").locator("summary").isVisible(),
      false,
    );
    assert.equal(
      await page.locator('[data-payout-action="reconcile"]').isVisible(),
      false,
    );
    assert.equal(
      await page.locator('[data-payout-action="decline"]').isVisible(),
      false,
    );
    assert.equal(
      await page.locator("#payout-detail .payout-progress li").count(),
      6,
    );
    assert.equal(
      await page
        .locator('#payout-detail .payout-progress [aria-current="step"]')
        .textContent(),
      "Preparation",
    );
    await page.locator("#payout-detail .payout-advanced > summary").click();
    await issueForm.locator("..").locator("summary").click();
    assert.equal(
      await issueForm.locator("[name=recipientIssue_phone]").isChecked(),
      true,
      "saved rejected fields persist after rerender",
    );
    assert.equal(
      await issueForm.locator("[name=recipientIssue_email]").isChecked(),
      true,
    );
    await page.locator("#payout-detail .payout-advanced > summary").click();
    await contactForm.locator("[name=phone]").fill("+57 (300) 111-2233");
    await contactForm.locator("[name=email]").fill("corrected@example.test");
    const beforeContact = JSON.stringify({
      recipient: unknown.recipient,
      version: unknown.version,
      quote: unknown.quote,
      status: unknown.status,
    });
    await contactForm.locator("button").click();
    await page.getByText("Saved contact correction", { exact: true }).waitFor();
    assert.deepEqual(
      actions.findLast((a) => a.action === "recipient-correction").body,
      { phone: "+573001112233", email: "corrected@example.test" },
    );
    assert.equal(
      JSON.stringify({
        recipient: unknown.recipient,
        version: unknown.version,
        quote: unknown.quote,
        status: unknown.status,
      }),
      beforeContact,
    );
    assert.match(
      await page.locator("#payout-detail .payout-facts").textContent(),
      /Transfer statusCorrection saved/,
    );
    assert.match(
      await page
        .locator("#payout-detail .payout-progress-status")
        .textContent(),
      /Correction saved — awaiting processing/,
    );
    assert.equal(
      await page.locator("#payout-detail .payout-action-form:visible").count(),
      0,
      "saved correction needs no further normal form",
    );
    assert.match(
      await page.locator("#payout-detail-feedback").textContent(),
      /Contact correction saved/,
    );
    assert.match(
      await page.locator("#payout-detail [role=alert]").textContent(),
      /Your edit is complete/,
    );
    assert.doesNotMatch(
      await page.locator("#payout-detail [role=alert]").textContent(),
      /Error Message:/,
    );
    assert.equal(
      await page
        .locator('[data-payout-action="resolve-recipient-error"]')
        .count(),
      0,
    );
    unknown.recipientIssue.fields = ["name", "other"];
    await page.locator("#refresh-payout-detail").click();
    await page
      .getByText(
        "Remitly could not accept the recipient legal name, other recipient details. Coins remain reserved.",
        { exact: true },
      )
      .first()
      .waitFor();
    assert.equal(
      await page.locator('[data-payout-action="prepare"]').count(),
      0,
    );
    assert.equal(
      await page.locator('[data-payout-action="recipient-correction"]').count(),
      0,
      "legal-name/other errors cannot edit phone/email",
    );
    await page.locator("#payout-filter").selectOption("all");
    // Re-recording a generic unknown must not carry an old recipient warning.
    await page.locator("#payout-detail .payout-advanced > summary").click();
    await issueForm.locator("..").locator("summary").click();
    await issueForm.locator("[name=recipientIssue_name]").uncheck();
    await issueForm.locator("[name=recipientIssue_other]").uncheck();
    await issueForm
      .locator("[name=reason]")
      .fill("Current investigation reports generic uncertainty only");
    await issueForm.locator("button").click();
    await page
      .locator("#payout-detail [role=alert]")
      .waitFor({ state: "detached" });
    assert.equal(
      Object.hasOwn(
        actions.findLast((a) => a.action === "unknown").body,
        "recipientIssue",
      ),
      false,
    );
    // Raw public error strings without a valid active structured issue cannot create an Error warning.
    unknown.creatorStatus = "error";
    unknown.errorMessage = "<img src=x onerror=alert(1)> untrusted";
    unknown.recipientIssue = {
      code: "recipient_validation_failed",
      fields: ["phone", "bogus"],
    };
    await page.locator("#refresh-payout-detail").click();
    await page
      .getByRole("heading", { name: "Withdrawal wd_unknown" })
      .waitFor();
    assert.equal(await page.locator("#payout-detail [role=alert]").count(), 0);
    // A pending contact correction stays blocked unless the server exposes authenticated owner recovery capability.
    unknown.recipientIssue = {
      code: "recipient_validation_failed",
      fields: ["phone", "email"],
    };
    unknown.recipientCorrection = {
      hash: "pending-correction-hash",
      phone: "+573001112233",
      email: "corrected@example.test",
      requestedAt: now,
    };
    unknown.attempts = [
      {
        id: "attempt_unknown",
        state: "unknown",
        maker: "prior_maker",
        evidence: { kind: "scheduled" },
      },
    ];
    unknown.balances = {
      availableCoins: "400",
      availableUsd: "1.00",
      reservedCoins: "6000",
      reservedUsd: "15.00",
    };
    unknown.canResolveRecipientError = false;
    await page.locator("#refresh-payout-detail").click();
    await page.getByText("Saved contact correction", { exact: true }).waitFor();
    assert.match(
      await page.locator("#payout-detail [role=alert]").textContent(),
      /corrected@example.test/,
    );
    assert.equal(
      await page
        .locator('[data-payout-action="resolve-recipient-error"]')
        .count(),
      0,
    );
    assert.equal(
      await page
        .locator(
          '[data-payout-action="prepare"], [data-payout-action="quote"], [data-payout-action="check"], [data-payout-action="release"]',
        )
        .count(),
      0,
    );
    unknown.canResolveRecipientError = true;
    unknown.recipientIssue.fields = ["phone", "name"];
    await page.locator("#refresh-payout-detail").click();
    await page
      .getByRole("heading", { name: "Withdrawal wd_unknown" })
      .waitFor();
    assert.equal(
      await page.locator('[data-payout-action="recipient-correction"]').count(),
      1,
    );
    assert.equal(
      await page
        .locator('[data-payout-action="resolve-recipient-error"]')
        .count(),
      0,
      "contact correction cannot clear an unresolved legal-name rejection",
    );
    unknown.recipientIssue.fields = ["phone", "email"];
    await page.locator("#refresh-payout-detail").click();
    const recovery = page.locator(
      '[data-payout-action="resolve-recipient-error"]',
    );
    await recovery.waitFor({ state: "attached" });
    assert.equal(
      await recovery.isVisible(),
      false,
      "manual recovery is advanced-only",
    );
    await page.locator("#payout-detail .payout-advanced > summary").click();
    await recovery.locator("..").locator("summary").click();
    for (const [key, value] of Object.entries({
      observationId: "safe-recovery-1",
      sourceUrl: "https://www.remitly.com/us/en/homepage",
      observedAt: now,
      historyCoverage:
        "All drafts, recipient links and transfer history for the prior attempt",
      evidence:
        "Saved recipient inspected and changed; prior draft canceled; no transfer or debit exists",
    }))
      await recovery.locator(`[name="${key}"]`).fill(value);
    // Missing checks cannot submit recovery.
    await recovery.locator("button").click();
    assert.equal(
      actions.filter((a) => a.action === "resolve-recipient-error").length,
      0,
    );
    const checks = [
      "historyInspected",
      "recipientRecordInspected",
      "recipientCorrectionApplied",
      "noRecipientLinkIssued",
      "noFundsSent",
      "noFundingDebit",
      "noPendingTransfers",
      "noUnknownTransfers",
      "previousDraftClosed",
    ];
    for (const name of checks)
      await recovery.locator(`[name="${name}"]`).check();
    await recovery.locator("button").click();
    await page
      .locator('[data-payout-action="quote"]')
      .waitFor({ state: "attached" });
    const recovered = actions.findLast(
      (a) => a.action === "resolve-recipient-error",
    );
    assert.equal(recovered.body.attemptId, "attempt_unknown");
    assert.equal(recovered.body.correctionHash, "pending-correction-hash");
    checks.forEach((name) => assert.equal(recovered.body[name], true));
    assert.equal(unknown.balances.reservedCoins, "6000");
    assert.equal(unknown.attempts[0].state, "canceled");
    assert.equal(unknown.recipient.phone, "+573001112233");
    assert.equal(await page.locator("#payout-detail [role=alert]").count(), 0);
    assert.equal(
      await page.locator('[data-payout-action="prepare"]').count(),
      0,
    );
    await page.locator("#payout-search").fill("123");
    assert.equal(await page.locator("#payout-rows tr").count(), 1);
    await page.locator('[data-withdrawal="wd_fixture"]').first().click();
    await page
      .getByRole("heading", { name: "Withdrawal wd_fixture" })
      .waitFor();
    assert.equal(
      await page.locator('[data-payout-action="prepare"]').count(),
      0,
    );
    assert.equal(await page.locator("#payout-detail script").count(), 0);
    const form = page.locator('[data-payout-action="quote"]');
    await form.locator("..").locator("summary").click();
    const fill = async (form, values) => {
      for (const [key, value] of Object.entries(values))
        await form.locator(`[name="${key}"]`).fill(value);
    };
    await fill(form, {
      sendAmountCents: "14.01",
      feeCents: "0.99",
      taxCents: "0.00",
      promotionalDiscountCents: "0.00",
      receiveAmount: "58000",
      providerMinimumSendCents: "10.00",
      sourceUrl: "https://www.remitly.com/us/en/transfer/send",
      observedAt: now,
      expiresAt: future,
      evidence: "Verified exact signed-in Business quote",
    });
    await form.locator('[name="actualQuoteConfirmed"]').check();
    await form
      .getByRole("button", { name: "Save quote and continue preparation" })
      .click();
    await page
      .locator('[data-payout-action="prepare"]')
      .waitFor({ state: "attached" });
    const quoteRecord = actions.find((action) => action.action === "quote");
    assert.equal(quoteRecord.body.sendAmountCents, 1401);
    assert.equal(quoteRecord.body.feeCents, 99);
    assert.equal(quoteRecord.body.providerMinimumSendCents, 1000);
    assert.equal(
      w.approvedQuoteHash,
      null,
      "initial request needs no extra exact quote approval",
    );
    assert.doesNotMatch(
      await page.locator("#payout-detail").textContent(),
      /Waiting for the creator|confirmation required|approved this exact quote/,
    );
    // Old confirmation-state rows remain preparable without a creator action.
    w.status = "awaiting_confirmation";
    await page.locator("#refresh-payout-detail").click();
    await page
      .locator('[data-payout-action="prepare"]')
      .waitFor({ state: "attached" });
    assert.doesNotMatch(
      await page.locator("#payout-detail").textContent(),
      /Waiting for the creator|confirmation required/,
    );
    // Pause preparation without blocking reconciliation or discarding unsaved evidence.
    const prepare = page.locator('[data-payout-action="prepare"]');
    await prepare.locator("..").locator("summary").click();
    await prepare
      .locator("[name=evidence]")
      .fill("Durable claim before provider action");
    const pauseReason = page.locator("#payout-pause-form [name=reason]");
    assert.equal(
      await pauseReason.isVisible(),
      false,
      "reason stays off screen until the header toggle is clicked",
    );
    const beforeCancel = actions.filter((a) => a.action === "pause").length;
    await page.locator("#payout-pause-toggle").click();
    await page.locator("#payout-pause-cancel").click();
    assert.equal(await pauseReason.isVisible(), false);
    assert.equal(
      actions.filter((a) => a.action === "pause").length,
      beforeCancel,
      "cancel never changes preparation",
    );
    await page.locator("#payout-pause-toggle").click();
    await page.keyboard.press("Escape");
    assert.equal(await pauseReason.isVisible(), false);
    assert.equal(
      actions.filter((a) => a.action === "pause").length,
      beforeCancel,
    );
    await page.locator("#payout-pause-toggle").click();
    assert.equal(await pauseReason.evaluate((el) => el.required), true);
    const pausesBeforeEmpty = actions.filter(
      (a) => a.action === "pause",
    ).length;
    await pauseReason.fill("");
    await page.locator("#payout-pause-button").click();
    assert.equal(
      await pauseReason.evaluate((el) => el.validity.valueMissing),
      true,
    );
    assert.equal(
      actions.filter((a) => a.action === "pause").length,
      pausesBeforeEmpty,
      "empty reason blocks submission before any API request",
    );
    await page
      .locator("#payout-pause-form [name=reason]")
      .fill("Review emergency");
    await page.locator("#payout-pause-button").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#payout-pause-state")?.textContent ===
        "Preparation paused",
    );
    assert.match(
      await page.locator("#payout-pause-state").textContent(),
      /preparation (is )?paused/i,
    );
    assert.equal(await prepare.locator("button").isDisabled(), true);
    assert.equal(
      await prepare.locator("[name=evidence]").inputValue(),
      "Durable claim before provider action",
    );
    assert.equal(
      await pauseReason.isVisible(),
      false,
      "successful pause closes the reason dialog",
    );
    await page.locator("#payout-pause-toggle").click();
    await pauseReason.fill("");
    const pausesBeforeEmptyResume = actions.filter(
      (a) => a.action === "pause",
    ).length;
    await page.locator("#payout-pause-button").click();
    assert.equal(
      await pauseReason.evaluate((el) => el.validity.valueMissing),
      true,
    );
    assert.equal(
      actions.filter((a) => a.action === "pause").length,
      pausesBeforeEmptyResume,
    );
    assert.equal(
      await page.locator("#payout-pause-state").textContent(),
      "Preparation paused",
    );
    await pauseReason.fill("Resume after completed review");
    await page.locator("#payout-pause-button").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#payout-pause-state")?.textContent ===
        "Preparation active",
    );
    assert.match(
      await page.locator("#payout-pause-state").textContent(),
      /preparation (is )?active/i,
    );
    assert.doesNotMatch(
      await page.locator("#payout-queue-status").textContent(),
      /while preparation is paused/i,
    );
    await prepare.locator("button").click();
    await page
      .locator('[data-payout-action="preparation"]')
      .waitFor({ state: "attached" });
    const preparation = page.locator('[data-payout-action="preparation"]');
    await preparation.locator("..").locator("summary").click();
    await fill(preparation, {
      deadline: future,
      historyCoverage:
        "All pending and sent transfers for this recipient reviewed",
      evidence: "First-time link plan only; no provider link issued",
    });
    for (const key of [
      "recipientMatches",
      "amountsMatch",
      "historyInspected",
      "oneTime",
      "autoSendOff",
    ])
      await preparation.locator(`[name=${key}]`).check();
    await preparation.locator("button").click();
    await page
      .locator('[data-payout-action="check"]')
      .waitFor({ state: "attached" });
    assert.equal(
      actions.find((a) => a.action === "preparation").body.kind,
      "first_time_link",
    );
    assert.equal(
      actions.find((a) => a.action === "preparation").body.providerLink,
      undefined,
    );
    await page.evaluate(() => (window.Clerk.user.id = "maker_fixture"));
    await page.locator("#refresh-payout-detail").click();
    await page
      .getByText(
        "You prepared this attempt. A different authorized operator must check it.",
      )
      .waitFor({ state: "attached" });
    assert.equal(
      await page.locator('[data-payout-action="check"] button').isDisabled(),
      true,
    );
    await page.evaluate(() => (window.Clerk.user.id = "checker_fixture"));
    await page.locator("#refresh-payout-detail").click();
    const check = page.locator('[data-payout-action="check"]');
    await check.locator("..").locator("summary").click();
    await fill(check, {
      historyCoverage: "Independently inspected all relevant transfers",
      evidence: "Missing amount verification; requires attention",
    });
    await check.locator("button").click();
    await page.waitForFunction(() =>
      document
        .querySelector(".payout-facts")
        ?.textContent.includes("needs attention"),
    );
    assert.equal(
      await page.locator('[data-payout-action="release"]').count(),
      0,
    );
    await check.locator("..").locator("summary").click();
    for (const key of [
      "recipientMatches",
      "amountsMatch",
      "reservationMatches",
      "historyInspected",
      "oneTime",
      "autoSendOff",
    ])
      await check.locator(`[name=${key}]`).check();
    await fill(check, {
      historyCoverage:
        "All relevant pending/sent history independently checked",
      evidence: "All exact-quote bound checks verified",
    });
    await check.locator("button").click();
    await page
      .locator('[data-payout-action="release"]')
      .waitFor({ state: "attached" });
    const release = page.locator('[data-payout-action="release"]');
    await release.locator("..").locator("summary").click();
    assert.match(
      await release.textContent(),
      /Saving this record does not send a payment/,
    );
    assert.equal(
      await release
        .locator("[name=providerLink]")
        .evaluate((el) => el.required),
      false,
    );
    assert.equal(
      await release
        .locator("[name=providerReference]")
        .evaluate((el) => el.required),
      false,
    );
    await fill(release, {
      releasedAt: now,
      evidence: "Human manually issued payout; provider emails recipient link",
    });
    await release.locator("[name=humanActionConfirmed]").check();
    await release.locator("button").click();
    await page.waitForFunction(() =>
      document
        .querySelector(".payout-facts")
        ?.textContent.includes("Awaiting recipient"),
    );
    assert.equal(
      await page
        .locator(".payout-facts")
        .textContent()
        .then((t) => t.includes("Delivery verified")),
      false,
    );
    const reconcile = page.locator('[data-payout-action="reconcile"]');
    await reconcile.locator("..").locator("summary").click();
    await reconcile.locator("[name=status]").selectOption("delivered");
    await fill(reconcile, {
      providerStatus: "Delivered",
      observationId: "provider-fixture-observation",
      providerReference: "provider-fixture-reference",
      sourceUrl: "https://www.remitly.com/us/en/homepage",
      observedAt: now,
      sendAmountCents: "14.01",
      feeCents: "0.99",
      taxCents: "0.00",
      receiveAmount: "58000",
      evidence: "Provider recipient and delivery evidence matched",
    });
    await reconcile.locator("[name=recipientMatches]").check();
    conflict = true;
    await reconcile.locator("button").click();
    await reconcile
      .locator(".payout-feedback")
      .getByText("Quote changed Refresh details before proceeding.")
      .waitFor();
    assert.equal(
      await reconcile.locator("[name=observationId]").inputValue(),
      "provider-fixture-observation",
    );
    conflict = false;
    await reconcile.locator("button").click();
    await page.waitForFunction(() =>
      document
        .querySelector(".payout-facts")
        ?.textContent.includes("Delivery verified"),
    );
    assert.equal(actions.filter((a) => a.action === "release").length, 1);
    const declinePre = {
      ...w,
      id: "wd_decline_before_attempt",
      creatorName: "Before preparation",
      status: "awaiting_quote",
      quote: null,
      checker: null,
      attempts: [],
      events: [],
      balances: {
        availableCoins: "400",
        availableUsd: "1.0000",
        reservedCoins: "6000",
        reservedUsd: "15.0000",
      },
    };
    const declinePost = {
      ...w,
      id: "wd_decline_after_attempt",
      creatorName: "After preparation",
      status: "awaiting_human_review",
      attempts: [
        {
          id: "attempt_decline",
          maker: "maker_fixture",
          state: "awaiting_human_review",
          evidence: { kind: "first_time_link", deadline: future },
        },
      ],
      checker: { status: "passed", actor: "checker_fixture" },
      events: [],
      balances: {
        availableCoins: "400",
        availableUsd: "1.0000",
        reservedCoins: "6000",
        reservedUsd: "15.0000",
      },
    };
    extraWithdrawals.push(declinePre, declinePost);
    await page.locator("#payout-search").fill("");
    await page.locator("#refresh-withdrawals").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#payout-result-count")
        ?.textContent.includes("4 loaded"),
    );
    await page
      .locator('[data-withdrawal="wd_decline_before_attempt"]')
      .first()
      .click();
    let decline = page.locator('[data-payout-action="decline"]');
    await decline.locator("..").locator("summary").click();
    assert.match(
      await decline.textContent(),
      /returns its reserved wallet coins once/,
    );
    await decline
      .locator("[name=reason]")
      .fill("Human declined before any provider attempt");
    await decline.locator("[name=declineConfirmed]").check();
    await decline.locator("button").click();
    await page.waitForFunction(() =>
      document.querySelector(".payout-facts")?.textContent.includes("Canceled"),
    );
    assert.equal(declinePre.balances.reservedCoins, "0");
    assert.equal(
      await page.locator('[data-payout-action="decline"]').count(),
      0,
    );
    await page
      .locator('[data-withdrawal="wd_decline_after_attempt"]')
      .first()
      .click();
    decline = page.locator('[data-payout-action="decline"]');
    await decline.locator("..").locator("summary").click();
    assert.match(await decline.textContent(), /wallet coins remain reserved/);
    await decline
      .locator("[name=reason]")
      .fill("Human declined after possible provider draft creation");
    await decline.locator("[name=declineConfirmed]").check();
    await decline.locator("button").click();
    await page.waitForFunction(() =>
      document
        .querySelector(".payout-facts")
        ?.textContent.includes("Error — awaiting identification"),
    );
    assert.equal(declinePost.balances.reservedCoins, "6000");
    assert.equal(
      await page.locator('[data-payout-action="release"]').count(),
      0,
    );
    assert.equal(
      await page.locator('[data-payout-action="prepare"]').count(),
      0,
    );
    assert.equal(
      await page.locator('[data-payout-action="decline"]').count(),
      0,
    );
    const expired = {
      ...declinePost,
      id: "wd_expired_recovery",
      creatorName: "Expired recovery",
      status: "expired",
      events: [],
      attempts: [{ ...declinePost.attempts[0], state: "expired" }],
      balances: { ...declinePost.balances },
    };
    extraWithdrawals.push(expired);
    await page.locator("#refresh-withdrawals").click();
    await page
      .locator('[data-withdrawal="wd_expired_recovery"]')
      .first()
      .click();
    await page
      .getByText("Reservation retained. Replacement preparation is blocked", { exact: false })
      .waitFor();
    assert.equal(expired.balances.reservedCoins, "6000");
    assert.equal(
      await page.locator('[data-payout-action="prepare"]').count(),
      0,
    );
    assert.equal(
      await page.locator('[data-payout-action="release"]').count(),
      0,
    );
    const expiredReconcile = page.locator('[data-payout-action="reconcile"]');
    await expiredReconcile.locator("..").locator("summary").click();
    await expiredReconcile.locator("[name=status]").selectOption("failed");
    await fill(expiredReconcile, {
      providerStatus: "Failed and funding returned",
      observationId: "expired-recovery-observation",
      providerReference: "expired-provider-reference",
      sourceUrl: "https://www.remitly.com/us/en/homepage",
      observedAt: now,
      sendAmountCents: "14.01",
      feeCents: "0.99",
      taxCents: "0.00",
      receiveAmount: "58000",
      evidence: "Provider history confirms failure and funding return",
    });
    await expiredReconcile.locator("[name=recipientMatches]").check();
    await expiredReconcile.locator("[name=fundingReturned]").check();
    await expiredReconcile.locator("button").click();
    await page.waitForFunction(() =>
      document.querySelector(".payout-facts")?.textContent.includes("Failed"),
    );
    assert.equal(expired.balances.reservedCoins, "0");
    assert.equal(
      actions.findLast((action) => action.id === expired.id)?.action,
      "reconcile",
    );
    extraWithdrawals.splice(0);
    await page.locator("#refresh-withdrawals").click();
    await page.locator("#payout-search").fill("123");
    await page.locator('[data-withdrawal="wd_fixture"]').first().click();
    await page
      .getByRole("heading", { name: "Withdrawal wd_fixture" })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    failing = true;
    await page.locator("#refresh-withdrawals").click();
    await page
      .getByText("Queue temporarily unavailable", { exact: true })
      .waitFor();
    assert.equal(await page.locator("[data-withdrawal]").count(), 0);
    failing = false;
    await page.locator("#refresh-withdrawals").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#payout-result-count")
        ?.textContent.includes("2 loaded"),
    );
    // Permission loss clears recipient/evidence and an old detail response cannot restore it.
    const started = new Promise((resolve) => (detailStarted = resolve));
    holdDetails = true;
    await page.locator("#refresh-payout-detail").click();
    await started;
    denied = true;
    await page.locator("#refresh-withdrawals").click();
    await page
      .getByRole("heading", { name: "Admin access required" })
      .waitFor();
    heldDetails();
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#payout-detail").count(), 0);
    assert.equal(
      await page.getByText("private@example.test", { exact: false }).count(),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Payout desk browser fixtures passed: all-wallet enrollment, queue/search/exceptions, safe recipient Error/messages, pending correction/owner recovery checks with retained reserve and fresh quote, maker/checker/human release, evidence-only delivery, conflicts, responsive layout and access-loss races.",
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

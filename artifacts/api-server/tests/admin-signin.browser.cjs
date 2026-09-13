// Actual Clerk component test: submits only an identifier, never a password.
const assert = require("node:assert/strict");
const { chromium } = require(
  process.env.PULSE_PLAYWRIGHT_MODULE || "playwright",
);
(async () => {
  const base = process.env.ADMIN_TEST_BASE || "http://localhost:8080";
  const email = process.env.ADMIN_TEST_EMAIL;
  if (!email)
    throw Error("Set ADMIN_TEST_EMAIL to the authorized test identifier.");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      ignoreHTTPSErrors: process.env.ADMIN_TEST_IGNORE_HTTPS === "1",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/api/admin/");
    await page.locator("#identifier-field").waitFor();
    assert.equal(await page.locator("#sign-in form").count(), 1);
    const firstPassword = page.locator(
      ".cl-signIn-start .cl-formFieldRow__password",
    );
    assert.equal(
      await firstPassword.evaluate((e) => getComputedStyle(e).display),
      "none",
    );
    // Even if Clerk/browser autofill reveals this row, the first step must not prompt for a password.
    await firstPassword.evaluate((e) => {
      e.removeAttribute("aria-hidden");
      e.style.opacity = "1";
      e.style.height = "auto";
      e.style.overflow = "visible";
    });
    assert.equal(await firstPassword.isVisible(), false);
    await page.locator("#identifier-field").fill(email);
    async function switchTabs() {
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: false,
        });
        document.dispatchEvent(new Event("visibilitychange"));
        delete document.hidden;
      });
    }
    await switchTabs();
    assert.equal(await page.locator("#identifier-field").inputValue(), email);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByRole("heading", { name: "Enter your password", exact: true })
      .waitFor();
    assert.equal(
      await page.locator("#sign-in input[type=password]:visible").count(),
      1,
    );
    assert.equal(await page.locator("#sign-in form").count(), 1);
    await page.locator("#password-field").fill("unsubmitted-regression-value");
    await switchTabs();
    assert.equal(
      await page.locator("#password-field").inputValue(),
      "unsubmitted-regression-value",
    );
    await page.locator("#password-field").fill("");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.locator("#sign-in input[type=password]:visible").count(),
      1,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: actual Clerk email-only first step, one password prompt, single mount, input retained across tab switches, phone layout. No password submitted.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

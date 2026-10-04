// Frontend fixtures only. Backend authorization/import tests verify real persistence separately.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PULSE_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../../admin/public');
(async () => {
  const server = http.createServer(async (req, res) => {
    try {
      const file = req.url.split('?')[0];
      const name = file === '/admin' || file === '/admin/' ? 'index.html' : file.split('/').pop();
      if (!['index.html', 'app.js', 'styles.css'].includes(name)) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
      res.end(await fs.readFile(path.join(root, name)));
    } catch { res.writeHead(500).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PULSE_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PULSE_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let denied = false, failing = false, conflict = false, dryRun = 0, imports = 0, patch;
    let holdImport = false, releaseImport, signalImport;
    const provider = { id: '1', name: 'Remitly', enabled: true, revision: 1, countries: [
      { id: '2', name: 'Colombia', countryCode: 'CO', availability: 'link_options', enabled: true, revision: 1, lastVerifiedAt: '2026-10-04', observations: [{ observedAt: '2026-10-04', inspectionStatus: 'link_options', notes: '<img src=x onerror=alert(1)>', discountNote: 'Separate USD 50 discount, not a fee', sourceUrls: ['https://www.remitly.com/us/en/transfer/send'] }], methods: [
        { id: '3', name: 'Mobile wallet', code: 'mobile_wallet', enabled: true, revision: 1, receiveCurrency: 'COP', availability: 'available', lastVerifiedAt: '2026-10-04', observations: [
          { sendAmountCents: 1500, feeCents: 99, feeCurrency: 'USD', fundingMethod: 'debit_card', observedAt: '2026-10-04', deliveryEstimate: '5 minutes', taxStatus: 'not_resolved' },
          { sendAmountCents: 50000, feeCents: 0, feeCurrency: 'USD', fundingMethod: 'debit_card', observedAt: '2026-10-04', deliveryEstimate: '5 minutes', taxStatus: 'not_resolved' }
        ] }
      ] },
      { id: '4', name: 'Russia', countryCode: 'RU', enabled: true, revision: 1, availability: 'quote_error', lastVerifiedAt: '2026-10-04', observations: [{ observedAt: '2026-10-04', inspectionStatus: 'quote_error', notes: 'Something went wrong; cause not established.' }], methods: [] }
    ] };
    await page.route('https://clerk.fixture.test/npm/**', route => route.fulfill({ contentType: 'application/javascript', body: `window.Clerk={loaded:true,session:{id:'catalog-test',getToken:async()=>'fixture'},load:async()=>{},addListener:()=>{},signOut:async()=>{window.Clerk.session=null}};` }));
    await page.route('**/api/admin-data/**', async route => {
      const req = route.request(), pathname = new URL(req.url()).pathname;
      if (pathname.endsWith('/config')) return route.fulfill({ json: { frontendApi: 'https://clerk.fixture.test', publishableKey: 'fixture' } });
      if (denied) return route.fulfill({ status: 403, json: { error: 'Access removed' } });
      if (pathname.endsWith('/session')) return route.fulfill({ json: { role: 'owner', environment: 'development' } });
      if (pathname.endsWith('/payout-catalog/import')) {
        const body = req.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['dryRun', 'research']);
        if (body.dryRun) dryRun++; else imports++;
        if (holdImport) {
          holdImport = false;
          await new Promise(resolve => { releaseImport = resolve; signalImport(); });
        }
        return route.fulfill({ json: { dryRun: body.dryRun, countries: 2, methods: 1, observations: 4 } });
      }
      if (req.method() === 'PATCH') {
        patch = req.postDataJSON();
        if (conflict) return route.fulfill({ status: 409, json: { error: 'Revision conflict' } });
        provider.enabled = patch.enabled; provider.name = patch.name; provider.revision++;
        return route.fulfill({ json: provider });
      }
      if (failing) return route.fulfill({ status: 503, json: { error: 'Temporary failure' } });
      if (pathname.endsWith('/payout-catalog')) return route.fulfill({ json: { providers: [provider], asOf: '2026-10-04' } });
      return route.fulfill({ json: {} });
    });
    await page.goto(base + '/admin/#payout-methods');
    await page.locator('#catalog-provider').waitFor();
    assert.equal(await page.locator('h1').textContent(), 'Payout methods');
    await page.getByText('Colombia · CO', { exact: false }).click();
    assert.equal(await page.locator('.catalog-method tbody tr').count(), 2);
    assert.match(await page.locator('.catalog-method table').textContent(), /\$15\.00.*debit_card.*\$0\.99/);
    assert.match(await page.locator('.catalog-method table').textContent(), /\$500\.00.*debit_card.*\$0\.00/);
    await page.locator('.catalog-country').first().locator('.catalog-evidence summary').click();
    assert.equal(await page.locator('#catalog-records img').count(), 0);
    assert.match(await page.locator('#catalog-records').textContent(), /Separate USD 50 discount/);
    assert.match(await page.locator('#catalog-records').textContent(), /quote_error/);
    const form = page.locator('#catalog-records > .catalog-editor');
    await form.locator('input[name=enabled]').uncheck(); await form.getByRole('button', { name: 'Save' }).click();
    await page.waitForFunction(() => document.querySelector('#catalog-records > .catalog-editor input[name=enabled]')?.checked === false);
    assert.deepEqual(patch, { name: 'Remitly', enabled: false, revision: 1 });
    await page.getByText('Colombia · CO', { exact: false }).click();
    assert.match(await page.locator('.catalog-method').textContent(), /parent is disabled/);
    conflict = true;
    await page.locator('#catalog-records > .catalog-editor').getByRole('button', { name: 'Save' }).click();
    await page.getByText('This record changed. Refresh the catalog before saving again.').waitFor();
    const research = { source: 'Signed-in Remitly Business website UI', countries: [] };
    await page.locator('#catalog-file').setInputFiles({ name: 'research.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(research)) });
    assert.equal(await page.locator('#commit-catalog-import').isDisabled(), true);
    await page.locator('#preview-catalog-import').click();
    await page.waitForFunction(() => !document.querySelector('#commit-catalog-import').disabled);
    assert.equal(imports, 0); assert.equal(dryRun, 1);
    await page.locator('#commit-catalog-import').click();
    await page.getByText(/^Imported: 2 countries/).waitFor(); assert.equal(imports, 1);
    // An older preview must never approve a subsequently selected file.
    const importStarted = new Promise(resolve => { signalImport = resolve; });
    holdImport = true;
    await page.locator('#preview-catalog-import').click();
    await importStarted;
    await page.locator('#catalog-file').setInputFiles({ name: 'changed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...research, observed_date: '2026-10-05' })) });
    await page.getByText('File loaded. Preview to validate signed-in research before importing.').waitFor();
    releaseImport();
    await page.waitForResponse(r => r.url().endsWith('/payout-catalog/import'));
    assert.equal(await page.locator('#commit-catalog-import').isDisabled(), true);
    assert.equal(imports, 1);
    failing = true; await page.locator('#refresh-catalog').click();
    await page.getByText('Temporary failure', { exact: true }).waitFor();
    assert.equal(await page.locator('.catalog-country').count(), 0);
    failing = false; await page.locator('#refresh-catalog').click(); await page.locator('#catalog-provider').waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByText('Colombia · CO', { exact: false }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    denied = true; await page.locator('#refresh-catalog').click();
    await page.getByRole('heading', { name: 'Admin access required' }).waitFor();
    assert.equal(await page.locator('#catalog-records').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Payout catalog UI: observations, escaping, revisions, parent disable, preview/import, error clearing, phone layout and access loss passed.');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

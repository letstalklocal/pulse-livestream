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
    const providers = []; let created = false, feeSaved = false, defaultSaved = false;
    let holdImport = false, releaseImport, signalImport;
    const provider = { id: 'remitly_000000000000000000000000', name: 'Remitly', enabled: true, revision: 1, countries: [
      { id: '2', name: 'Colombia', countryCode: 'CO', availability: 'link_options', enabled: true, revision: 1, lastVerifiedAt: '2026-10-04', observations: [{ observedAt: '2026-10-04', inspectionStatus: 'link_options', notes: '<img src=x onerror=alert(1)>', discountNote: 'Separate USD 50 discount, not a fee', sourceUrls: ['https://www.remitly.com/us/en/transfer/send'] }], methods: [
        { id: '3', name: 'Mobile wallet', code: 'mobile_wallet', enabled: true, revision: 1, receiveCurrency: 'COP', availability: 'available', lastVerifiedAt: '2026-10-04', observations: [
          { sendAmountCents: 1500, feeCents: 99, feeCurrency: 'USD', fundingMethod: 'debit_card', observedAt: '2026-10-04', deliveryEstimate: '5 minutes', taxStatus: 'not_resolved' },
          { sendAmountCents: 1500, feeCents: 99, feeCurrency: 'USD', fundingMethod: 'debit_card', observedAt: '2026-10-04', deliveryEstimate: '5 minutes', taxStatus: 'not_resolved' }
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
        const body = req.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['dryRun', 'providerId', 'research']);
        if (body.dryRun) dryRun++; else imports++;
        if (holdImport) {
          holdImport = false;
          await new Promise(resolve => { releaseImport = resolve; signalImport(); });
        }
        return route.fulfill({ json: { dryRun: body.dryRun, countries: 2, methods: 1, observations: 4 } });
      }
      if (pathname.endsWith('/payout-catalog/providers') && req.method() === 'POST') {
        const body = req.postDataJSON(); assert.equal(body.name, 'Payoneer'); created = true;
        const added = {id:'payoneer_fixture', name:body.name, enabled:true, revision:1, countries:[]}; providers.push(added);
        return route.fulfill({status:201, json:added});
      }
      if (pathname.endsWith('/methods/3/fees')) {
        const body = req.postDataJSON(); assert.equal(body.sendAmountCents,1401); assert.equal(body.feeCents,99); feeSaved = true;
        return route.fulfill({json:{id:'new-fee',inserted:true}});
      }
      if (req.method() === 'PATCH') {
        patch = req.postDataJSON();
        if (conflict) return route.fulfill({ status: 409, json: { error: 'Revision conflict' } });
        const id = pathname.split('/').pop();
        const record = [provider, ...provider.countries, ...provider.countries.flatMap(c => c.methods)].find(r => r.id === id);
        assert.ok(record); if (patch.enabled !== undefined) record.enabled = patch.enabled;
        if (patch.name !== undefined) record.name = patch.name;
        if (patch.defaultFeeCents !== undefined) {record.defaultFeeCents=patch.defaultFeeCents;record.defaultFundingMethod=patch.defaultFundingMethod;defaultSaved=true;}
        record.revision++;
        return route.fulfill({ json: record });
      }
      if (failing) return route.fulfill({ status: 503, json: { error: 'Temporary failure' } });
      if (pathname.endsWith('/payout-catalog')) return route.fulfill({ json: { providers: [provider, ...providers], asOf: '2026-10-04' } });
      return route.fulfill({ json: {} });
    });
    await page.goto(base + '/admin/#payout-methods');
    await page.locator('#catalog-provider').waitFor();
    assert.equal(await page.locator('h1').textContent(), 'Payout methods');
    assert.equal(await page.locator('#catalog-file').isVisible(), true, 'import stays visible');
    assert.equal(await page.evaluate(() => document.querySelector('.catalog-import').getBoundingClientRect().top < document.querySelector('.catalog-panel').getBoundingClientRect().top), true, 'import remains at the top');
    assert.equal(await page.locator('.catalog-name-field:visible').count(), 0, 'names are not repeated in open forms');
    assert.equal(await page.locator('#catalog-provider').evaluate(el => el.getBoundingClientRect().height >= 48 && parseFloat(getComputedStyle(el).fontSize) >= 16), true, 'provider selection is readable');
    await page.getByText('Colombia · CO', { exact: false }).click();
    assert.equal(await page.locator('.catalog-method-row').count(), 1, 'one primary row per payout type');
    await page.getByRole('button', {name:'Quote history',exact:true}).click();
    assert.equal(await page.locator('.catalog-quote-table tbody tr').count(),1,'identical quotes share one row');
    assert.match(await page.locator('.catalog-quote-table').textContent(), /\$15\.00.*Debit card.*\$0\.99/);
    assert.equal((await page.locator('#catalog-records').textContent()).includes('$500.00'),false);
    await page.getByRole('button', {name:'Add default fee',exact:true}).click();
    const defaultForm=page.locator('.catalog-default-fee-editor');
    await defaultForm.locator('[name=fee]').fill('1.25');
    await defaultForm.getByRole('button',{name:'Save default fee'}).click();
    await page.getByRole('button',{name:'Edit fee',exact:true}).waitFor();
    assert.equal(defaultSaved,true);
    assert.match(await page.locator('.catalog-method-row').textContent(),/\$1\.25.*Debit card/);
    assert.equal(await page.locator('#catalog-records img').count(), 0);
    assert.equal((await page.locator('#catalog-records').textContent()).includes('Separate USD 50 discount'), false);
    assert.equal((await page.locator('#catalog-records').textContent()).includes('Route research and quote errors'), false);
    assert.match(await page.locator('#catalog-records').textContent(), /quote_error/);
    const form = page.locator('#catalog-records > .catalog-editor');
    await form.locator('input[name=enabled]').uncheck(); await form.getByRole('button', { name: 'Save' }).click();
    await page.waitForFunction(() => document.querySelector('#catalog-records > .catalog-editor input[name=enabled]')?.checked === false);
    assert.deepEqual(patch, { name: 'Remitly', enabled: false, revision: 1 });
    await page.getByText('Parent disabled', {exact:true}).waitFor();
    assert.match(await page.locator('.catalog-method-row').textContent(), /Parent disabled/);
    await page.getByRole('button', {name:'Quote history',exact:true}).click();
    const feeForm = page.locator('.catalog-fee-editor').first();
    await page.locator('.catalog-method .catalog-evidence summary').first().click();
    await feeForm.locator('[name=sendAmount]').fill('14.01'); await feeForm.locator('[name=fee]').fill('0.99');
    await feeForm.locator('[name=observedAt]').fill('2026-10-04T12:00');
    await feeForm.locator('[name=sourceUrl]').fill('https://www.remitly.com/us/en/transfer/send');
    await Promise.all([page.waitForResponse(r => r.url().endsWith('/methods/3/fees')), feeForm.getByRole('button', {name:'Save quote'}).click()]); assert.equal(feeSaved,true);
    await page.locator('#catalog-provider').waitFor();
    const countryForm = page.locator('.catalog-inline-editor[data-catalog-id="2"]');
    await page.getByRole('button', {name:'Edit country name'}).first().click();
    await countryForm.locator('input[name=name]').fill('Colombia draft');
    await countryForm.getByRole('button', {name:'Cancel'}).click();
    assert.equal(await countryForm.locator('input[name=name]').isVisible(),false);
    assert.equal(await countryForm.locator('input[name=name]').inputValue(),'Colombia');
    const methodForm = page.locator('.catalog-inline-editor[data-catalog-id="3"]');
    await page.getByRole('button', {name:'Edit payout type name'}).click();
    await methodForm.locator('input[name=name]').fill('Bank Deposit');
    await methodForm.getByRole('button', {name:'Save',exact:true}).click();
    await page.getByRole('heading', {name:'Bank Deposit',exact:true}).waitFor();
    assert.equal(await page.locator('.catalog-name-field:visible').count(),0);
    assert.equal(await page.locator('.catalog-country').first().evaluate(el=>el.open),true, 'saving preserves the expanded country');
    await page.getByRole('button', {name:'Edit provider name'}).click();
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
    await page.locator('#catalog-add-provider input').fill('Payoneer');
    await page.locator('#catalog-add-provider button').click();
    await page.waitForFunction(() => document.querySelector('#catalog-provider')?.value === 'payoneer_fixture');
    assert.equal(created,true); assert.match(await page.locator('#catalog-import-provider').textContent(), /Payoneer/);
    assert.equal(await page.locator('#commit-catalog-import').isDisabled(),true);
    await page.locator('#catalog-provider').selectOption(provider.id);
    assert.equal(await page.locator('#commit-catalog-import').isDisabled(),true);
    // A provider change also invalidates an in-flight preview for the old provider.
    const providerPreviewStarted = new Promise(resolve => {signalImport=resolve;}); holdImport=true;
    await page.locator('#preview-catalog-import').click(); await providerPreviewStarted;
    await page.locator('#catalog-provider').selectOption('payoneer_fixture'); releaseImport();
    await page.waitForResponse(r => r.url().endsWith('/payout-catalog/import'));
    assert.equal(await page.locator('#commit-catalog-import').isDisabled(),true);
    await page.screenshot({path:'/tmp/payout-catalog-desktop.png',fullPage:true});
    await page.locator('#catalog-provider').selectOption(provider.id);
    failing = true; await page.locator('#refresh-catalog').click();
    await page.getByText('Temporary failure', { exact: true }).waitFor();
    assert.equal(await page.locator('.catalog-country').count(), 0);
    failing = false; await page.locator('#refresh-catalog').click(); await page.locator('#catalog-provider').waitFor();
    await page.getByText('Colombia · CO', { exact: false }).click();
    await page.screenshot({path:'/tmp/payout-catalog-desktop.png',fullPage:true});
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', {name:'Quote history',exact:true}).click();
    await page.locator('.catalog-method .catalog-evidence summary').first().click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('#catalog-add-provider .catalog-feedback').textContent(), 'Provider added.');
    await page.screenshot({path:'/tmp/payout-catalog-mobile-width.png',fullPage:true});
    denied = true; await page.locator('#refresh-catalog').click();
    await page.getByRole('heading', { name: 'Admin access required' }).waitFor();
    assert.equal(await page.locator('#catalog-records').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Payout catalog UI: observations, escaping, revisions, parent disable, preview/import, error clearing, phone layout and access loss passed.');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

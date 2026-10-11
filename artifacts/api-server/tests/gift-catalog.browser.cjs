// Frontend fixtures; these do not establish native playback or server persistence.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const adminRequire = require("node:module").createRequire(path.resolve(__dirname, "../../admin/package.json"));
const { chromium } = require(
  process.env.PULSE_PLAYWRIGHT_MODULE || "playwright",
);
const root = path.resolve(__dirname, "../../admin/public");
(async () => {
  const server = http.createServer(async (req, res) => {
    try {
      const name = req.url.split("?")[0].split("/").pop() || "index.html";
      if (name === "gift-svga.js") {
        res.setHeader("Content-Type", "application/javascript");
        return res.end(await fs.readFile(path.join(path.dirname(adminRequire.resolve("svgaplayerweb/package.json")), "build/svga.min.js")));
      }
      if (!["app.js", "styles.css", "index.html", "gift-svga-preview.html", "gift-svga-preview.js"].includes(name))
        return res.writeHead(404).end();
      if (name === 'index.html') res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://clerk.fixture.test https://challenges.cloudflare.com; connect-src 'self' https://clerk.fixture.test; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; frame-src 'self'; worker-src 'self' blob:");
      if (name === 'gift-svga-preview.html') res.setHeader('Content-Security-Policy', "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src blob:; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
      res.setHeader(
        "Content-Type",
        name.endsWith(".js")
          ? "application/javascript"
          : name.endsWith(".css")
            ? "text/css"
            : "text/html",
      );
      res.end(await fs.readFile(path.join(root, name)));
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PULSE_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PULSE_CHROMIUM_EXECUTABLE }
        : {}),
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [];
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error("Browser error:", e.message);
    });
    const data = {
      collections: [
        {
          id: "popular",
          name: "Popular",
          sortOrder: 0,
          locked: true,
          status: "published",
        },
        {
          id: "luxury",
          name: "Luxury",
          sortOrder: 1,
          locked: false,
          status: "published",
        },
      ],
      gifts: [
        {
          id: "rose",
          collectionId: "popular",
          sortOrder: 0,
          status: "published",
          currentRevisionId: "r1",
          draftRevisionId: null,
        },
      ],
      revisions: [
        {
          id: "r1",
          giftId: "rose",
          name: "Rose",
          emoji: "🌹",
          coinCost: 1,
          framing: { preset: "contained", scale: 1, x: 0, y: 0 },
          thumbnailAssetId: "original_rose",
        },
      ],
      assets: [{ id: "original_rose", kind: "thumbnail", format: "png", label: "Rose artwork", fileName: "rose.png", byteSize: 1024, url: "/api/gift-catalog/assets/original_rose" }, {id:"default_sound",kind:"sound",format:"mp3",fileName:"default-gift.mp3",byteSize:2048,isDefaultSound:true,url:"/api/gift-catalog/assets/default_sound"}],
      limits: { maxAssetBytes: 31457280 },
    };
    data.gifts.push(
      { id: "expensive", collectionId: "popular", sortOrder: 1, status: "published", currentRevisionId: "expensive-r1", draftRevisionId: null },
      { id: "cheap", collectionId: "popular", sortOrder: 2, status: "published", currentRevisionId: "cheap-r1", draftRevisionId: null },
    );
    data.revisions.push(
      { id: "expensive-r1", giftId: "expensive", name: "Expensive", emoji: "✧", coinCost: 99, type: "image" },
      { id: "cheap-r1", giftId: "cheap", name: "Cheap", emoji: "✧", coinCost: 2, type: "image" },
    );
    data.gifts.push({id:"animated",collectionId:"luxury",status:"published",currentRevisionId:"animated-r1"});
    data.revisions.push({id:"animated-r1",giftId:"animated",name:"Animated gift",coinCost:1999,type:"animation",thumbnailAssetId:"original_rose",androidAssetId:"fixture_svga",iosAssetId:"fixture_svga",framing:{preset:"contained",scale:1,x:0,y:0}});
    data.assets.push({id:"fixture_svga",kind:"animation",format:"svga",width:720,height:1280,url:"/api/gift-catalog/assets/fixture_svga"});
    let catalogReads = 0, imports = 0;
    let serverDelivery = false, deliveryWrites = 0;
    let denied = false,
      uploadReject = false,
      mutations = [],
      draftSequence = 1;
    let soundPreviewGate;
    await page.route("**/api/gift-catalog/assets/**", async route => {
      assert.equal(route.request().headers().authorization, "Bearer fixture");
      if (route.request().url().endsWith('/fixture_svga')) return route.fulfill({contentType:"application/octet-stream",body:await fs.readFile(path.resolve(__dirname,"../../mobile/assets/gifts/luxury/Virtual-Kiss-Gift.svga"))});
      const sound = /\/(default_sound|asset_sound_fixture)$/.test(route.request().url());
      if (sound && soundPreviewGate) await soundPreviewGate;
      return route.fulfill({contentType:sound ? "audio/mpeg" : "image/png",body:await fs.readFile(path.resolve(__dirname,sound ? "../../mobile/assets/moments/default-gift.mp3" : "../../mobile/assets/gifts/rose.png"))});
    });
    await page.route("https://clerk.fixture.test/npm/**", (r) =>
      r.fulfill({
        contentType: "application/javascript",
        body: "window.Clerk={loaded:true,session:{id:'gift-fixture',getToken:async()=>'fixture'},load:async()=>{},addListener:()=>{},signOut:async()=>{window.Clerk.session=null}};",
      }),
    );
    await page.route("**/api/admin-data/**", async (route) => {
      const req = route.request(),
        p = new URL(req.url()).pathname;
      if (p.endsWith("/config"))
        return route.fulfill({
          json: {
            frontendApi: "https://clerk.fixture.test",
            publishableKey: "fixture",
          },
        });
      assert.equal(req.headers()["authorization"], "Bearer fixture");
      if (denied)
        return route.fulfill({
          status: 403,
          json: { error: "Access removed" },
        });
      if (p.endsWith("/session"))
        return route.fulfill({
          json: { role: "owner", environment: "development" },
        });
      if (p.endsWith("/live-gift-delivery")) {
        if (req.method() === "PUT") { serverDelivery = req.postDataJSON().enabled; deliveryWrites++; }
        return route.fulfill({ json: { enabled: serverDelivery, effective: serverDelivery, activeWorkers: 0, configured: true, fault: null } });
      }
      if (p === "/api/admin-data/gifts" && req.method() === "GET") {
        catalogReads++; return route.fulfill({ json: data });
      }
      if (p.endsWith("/assets/import-existing")) { imports++; return route.fulfill({json:{imported:12}}); }
      if (p.endsWith("/assets")) {
        assert.equal(req.headers()["content-type"], "application/octet-stream");
        const params = new URL(req.url()).searchParams;
        const sound = params.get("kind") === "sound";
        assert.ok(sound ? params.get("format") === "mp3" : ["png", "webp"].includes(params.get("format")));
        assert.ok(params.get("filename"));
        if (uploadReject)
          return route.fulfill({
            status: 400,
            json: { error: "Invalid PNG content" },
          });
        const asset = {
          id: sound ? "asset_sound_fixture" : "asset_fixture",
          kind: sound ? "sound" : "thumbnail",
          format: params.get("format"),
          fileName: params.get("filename"),
          byteSize: 8,
          width: 1,
          height: 1,
          url: "/api/gift-catalog/assets/" + (sound ? "asset_sound_fixture" : "asset_fixture"),
        };
        data.assets.push(asset);
        return route.fulfill({ json: asset });
      }
      const body = req.postData() ? req.postDataJSON() : null;
      mutations.push({ p, body, method: req.method() });
      if (p.endsWith("/collections"))
        data.collections.push({
          id: body.id,
          name: body.name,
          sortOrder: data.collections.length,
          status: "draft",
          locked: false,
        });
      if (p.includes("/collections/") && req.method() === "PATCH") {
        const c = data.collections.find((c) => c.id === p.split("/").pop());
        Object.assign(c, body);
      }
      if (p.endsWith("/collections/reorder"))
        body.ids.forEach((id, i) => {
          data.collections.find((c) => c.id === id).sortOrder = i;
        });
      if (p.endsWith("/gifts/rose") && req.method() === "PATCH") {
        const id = `r${++draftSequence}`;
        data.revisions.push({ ...data.revisions[0], ...body, id });
        data.gifts[0].draftRevisionId = id;
        if(body.status === 'published') {
          data.gifts[0].currentRevisionId=id;
          data.gifts[0].draftRevisionId=null;
          data.gifts[0].status='published';
        } else if(body.status === 'draft') data.gifts[0].status='draft';
      }
      if (p.endsWith("/publish")) {
        data.gifts[0].currentRevisionId = data.gifts[0].draftRevisionId;
        data.gifts[0].draftRevisionId = null;
      }
      if (p.endsWith("/revisions"))
        return route.fulfill({ json: { revisions: data.revisions } });
      return route.fulfill({ json: { id: body?.id || "rose" } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/admin/#gifts`);
    await page.getByRole("button", { name: "Popular · Default" }).waitFor();
    await page.getByRole("switch", { name: "Turn on live gifts", checked: false }).waitFor();
    const headerLayout = await page.locator('#gift-refresh').evaluate(refresh => {
      const a = refresh.getBoundingClientRect(), b = document.getElementById('live-gift-delivery-toggle').getBoundingClientRect();
      return { right: b.left > a.right, aligned: Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)) < 2,
        inHeader: !!document.getElementById('live-gift-delivery-control').closest('.panel-heading') };
    });
    assert.deepEqual(headerLayout, { right: true, aligned: true, inHeader: true });
    assert.equal(await page.locator('#gift-workspace #live-gift-delivery-control').count(), 0);
    const readsBeforeSwitch = catalogReads;
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('switch').click();
    await page.getByRole('switch', { name: 'Turn on live gifts', checked: true }).waitFor();
    await page.getByRole('switch').click();
    await page.getByRole('switch', { name: 'Turn on live gifts', checked: false }).waitFor();
    assert.equal(deliveryWrites, 2); assert.equal(catalogReads, readsBeforeSwitch, 'Global switch does not reload gifts or reopen an editor');
    await page.screenshot({ path: '/tmp/pulse-global-gift-delivery-admin.png', fullPage: true });
    assert.equal(await page.locator('.gift-list-heading #gift-collection-summary').textContent(),'Gifts: 3 · Status: Published');
    assert.equal(await page.locator('.gift-collections').getByText(/Gifts:|Status:/).count(),0);
    assert.deepEqual(await page.locator("[data-gift-open]").evaluateAll(nodes => nodes.map(n => n.dataset.giftOpen)), ["rose", "cheap", "expensive"]);
    assert.equal(await page.locator("[data-gift-move]").count(), 0);
    assert.equal(await page.locator("#gift-add-collection, #gift-collection-editor").count(), 0);
    assert.equal(await page.locator("#gift-manage-collection").count(), 0);
    assert.equal(await page.locator('[data-gift-collection="popular"]').getAttribute("draggable"), "false");
    assert.equal(await page.locator("#gift-archive-collection").count(), 0);
    assert.doesNotMatch(await page.locator('[data-gift-open="rose"]').textContent(), /coins/);
    assert.equal(await page.locator('[data-gift-open="rose"] .gift-coin').count(), 1);
    await page.locator('[data-gift-collection="luxury"]').click();
    assert.equal(await page.locator('#gift-collection-summary').textContent(),'Gifts: 1 · Status: Published');
    await page.locator('[data-gift-open="animated"]').click();
    for (const field of ['androidAssetId','iosAssetId']) {
      await page.locator(`button[data-preview-platform="${field}"]`).click();
      const previewCanvas = page.frameLocator(`#gift-${field}-preview iframe`).locator('canvas');
      await previewCanvas.waitFor();
      assert.equal(await previewCanvas.evaluate(canvas => Math.abs(canvas.width - canvas.clientWidth) <= 1 && Math.abs(canvas.height - canvas.clientHeight) <= 1), true, 'SVGA backing dimensions match the preview, avoiding double scaling');
      assert.equal(await previewCanvas.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark', 'Sandbox matches the parent color scheme to preserve iframe transparency');
      await page.waitForFunction(field => document.getElementById(`gift-${field}-feedback`)?.textContent.includes('SVGA animation preview'),field);
      const previewFrame = await (await page.locator(`#gift-${field}-preview iframe`).elementHandle()).contentFrame();
      await previewFrame.waitForFunction(() => {
        const canvas=document.querySelector('canvas');
        const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        for(let i=3;i<pixels.length;i+=4) if(pixels[i]>0) return true;
        return false;
      });
      assert.equal(await page.locator(`#gift-${field}-preview`).evaluate(screen => !!screen.closest('.gift-preview-column')), true);
      assert.equal(await page.locator(`[data-platform-controls="${field}"]`).isVisible(), true);
    }
    await page.locator('#gift-preview-screen img').waitFor({ state: 'attached' });
    const animatedArtwork = await page.locator('#gift-preview-screen img').getAttribute('src');
    const iphoneCanvas = await page.locator('#gift-iosAssetId-preview iframe').evaluate(c=>{c.dataset.original='true';return c.dataset.original;});
    await page.locator('button[data-preview-platform="androidAssetId"]').click();
    await page.locator('[data-gift-preview="androidAssetId"]').click();
    await page.waitForFunction(()=>document.getElementById('gift-androidAssetId-feedback')?.textContent.includes('SVGA animation preview'));
    assert.equal(await page.locator('#gift-iosAssetId-preview iframe').getAttribute('data-original'),iphoneCanvas);
    assert.equal(await page.locator('#gift-preview-screen img').getAttribute('src'),animatedArtwork);
    await page.locator('button[data-preview-platform="iosAssetId"]').click();
    await page.waitForFunction(()=>document.getElementById('gift-iosAssetId-feedback')?.textContent.includes('SVGA animation preview'));
    await page.locator('#gift-iosAssetId-preview button').click();
    assert.equal(await page.locator('#gift-iosAssetId-preview button').textContent(),'Play preview');
    await page.screenshot({ path: '/tmp/pulse-gift-animation-reference-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#gift-editor-modal').evaluate(modal => { modal.scrollTop = 0; });
    assert.equal(await page.locator('#gift-editor-modal').evaluate(modal => modal.scrollWidth > modal.clientWidth), false, 'Platform animation editor fits a narrow screen');
    await page.screenshot({ path: '/tmp/pulse-gift-animation-reference-phone.png' });
    await page.locator('#gift-animation-controls').scrollIntoViewIfNeeded();
    await page.screenshot({ path: '/tmp/pulse-gift-animation-controls-phone.png' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.keyboard.press('Escape');
    await page.locator('[data-gift-collection="popular"]').click();
    await page.locator('[data-gift-open="rose"]').click();
    assert.equal(await page.locator('#gift-editor-modal').evaluate(d => d.open), true);
    async function assertHeaderSave() {
      assert.equal(await page.locator('#gift-editor-modal footer').count(), 0);
      assert.equal(await page.locator('#gift-editor-modal').getByRole('button', { name: 'Cancel', exact: true }).count(), 0);
      const actions = await page.locator('.gift-editor-header-actions').evaluate(header => {
        const save = header.querySelector('#gift-editor-save'), close = header.querySelector('#gift-editor-close');
        const a = save.getBoundingClientRect(), b = close.getBoundingClientRect();
        return { leftOfClose: a.right <= b.left, sameHeight: a.height === b.height, sameRow: Math.abs(a.top - b.top) < 1, height: a.height,
          form: save.form?.getAttribute('id') };
      });
      assert.deepEqual(actions, { leftOfClose: true, sameHeight: true, sameRow: true, height: 44, form: 'gift-draft-form' });
      const statusAlignment = await page.locator('.gift-modal-header').evaluate(header => {
        const rects = Array.from(header.querySelectorAll('.gift-status-label, .gift-publication-status label, #gift-editor-save, #gift-editor-close'), node => node.getBoundingClientRect());
        const status = rects.slice(0, 3), buttons = rects.slice(3);
        return { heights: rects.map(rect => rect.height), statusCenters: status.map(rect => rect.top + rect.height / 2), buttonCenters: buttons.map(rect => rect.top + rect.height / 2), desktop: innerWidth > 760 };
      });
      assert.ok(statusAlignment.heights.every(height => height === 44), 'Status label, publication choices, Save and X use identical heights');
      assert.ok(Math.max(...statusAlignment.statusCenters) - Math.min(...statusAlignment.statusCenters) < 1, 'Status label and choices are vertically centered together');
      if (statusAlignment.desktop) assert.ok(Math.abs(statusAlignment.statusCenters[0] - statusAlignment.buttonCenters[0]) < 1, 'Status and Save/X align on the same desktop header baseline');
      assert.equal(await page.locator('.gift-modal-header [name="status"]').evaluateAll(inputs => inputs.length === 2 && inputs.every(input => input.form?.getAttribute('id') === 'gift-draft-form')), true);
    }
    await assertHeaderSave();
    assert.equal(await page.locator('.gift-header-type input:checked').count(), 1, 'Only one gift type is selected');
    assert.equal(await page.locator('.gift-header-type .gift-type-choice:has(input:checked)').evaluate(label => ({ shadow: getComputedStyle(label).boxShadow, outline: getComputedStyle(label).outlineStyle } )).then(style => style.shadow === 'none' && style.outline === 'none'), true, 'Initial selected type has one border, not inset and autofocus outlines');
    assert.equal(await page.locator('.gift-artwork-settings .gift-header-type legend').textContent(), "Gift type");
    assert.equal(await page.locator('.gift-artwork-settings [name="type"]').count(), 2);
    assert.equal(await page.locator('#gift-draft-form [name="collectionId"]').count(), 0);
    assert.equal(await page.locator('#gift-draft-form select[name$="AssetId"]').count(), 0);
    assert.equal(await page.locator('#gift-draft-form select[name="type"]').count(),0);
    assert.equal(await page.locator('#gift-original-sound-choice').isVisible(),false);
    assert.equal(await page.locator('[name="soundChoice"]:checked').inputValue(),"default");
    assert.equal(await page.locator('[name="soundAssetId"]').inputValue(),"default_sound");
    await page.locator('[name="soundChoice"][value="custom"]').check();
    assert.equal(await page.locator('#gift-custom-sound').isVisible(),true);
    await page.locator('[name="soundChoice"][value="default"]').check();
    assert.equal(await page.locator('#gift-custom-sound').isVisible(),false);
    assert.equal(await page.locator('[name="thumbnailAssetId"]').inputValue(), "original_rose");
    assert.match(await page.locator('[data-current-file="thumbnailAssetId"]').textContent(), /rose.png/);
    await page.locator('#gift-preview-screen img').waitFor();
    assert.equal(await page.locator('[name="emoji"]').count(),0);
    const artworkSrc = await page.locator('#gift-preview-screen img').getAttribute('src');
    assert.equal(await page.locator('.gift-identity-row input').first().getAttribute('name'), 'name', 'Name leads gift details');
    const identityRow = await page.locator('.gift-identity-row').evaluate(row => {
      const name = row.querySelector('[name="name"]').getBoundingClientRect(), price = row.querySelector('[name="coinCost"]').getBoundingClientRect();
      return { sameRow: Math.abs((name.top + name.height / 2) - (price.top + price.height / 2)) < 2, priceRight: price.left > name.right };
    });
    assert.deepEqual(identityRow, { sameRow: true, priceRight: true });
    assert.equal(await page.locator('.gift-details-fields').count(), 0);
    const previewLayout = await page.locator('#gift-preview-screen').evaluate(preview => {
      const p = preview.getBoundingClientRect(), slider = document.querySelector('#gift-artwork-size'),
        s = slider.getBoundingClientRect(), m = document.getElementById('gift-image-motion-controls').getBoundingClientRect(),
        replace = document.querySelector('[data-gift-replace="thumbnailAssetId"]').getBoundingClientRect();
      return { slider: slider.type, sizeRight: s.left >= p.right, motionRight: m.left >= p.right, replaceBelow: replace.top >= p.bottom };
    });
    assert.deepEqual(previewLayout, { slider: 'range', sizeRight: true, motionRight: true, replaceBelow: true });
    const frameRatio = await page.locator('#gift-preview-screen').evaluate(preview => preview.clientWidth / preview.clientHeight);
    assert.ok(Math.abs(frameRatio - 9 / 16) < .005, 'Artwork is shown in a 9:16 phone frame');
    await page.locator('#gift-editor-modal').evaluate(modal => { modal.scrollTop = 0; });
    async function assertMotionRowAlignment() {
      const aligned = await page.locator('.gift-motion-phases').evaluate(phases => {
        const cards = Array.from(phases.children);
        const headings = cards.map(card => card.firstElementChild.getBoundingClientRect().top);
        const controls = cards.map(card => card.querySelector('select').getBoundingClientRect().top);
        const seconds = cards.map(card => card.querySelector('.gift-motion-duration').getBoundingClientRect());
        const gaps = cards.map(card => card.querySelector('select').getBoundingClientRect().top - card.firstElementChild.getBoundingClientRect().bottom);
        return { headings, controls, gaps, durationTops: seconds.map(rect => rect.top), durationWidths: seconds.map(rect => rect.width) };
      });
      assert.ok(Math.max(...aligned.headings) - Math.min(...aligned.headings) < 1 && Math.max(...aligned.controls) - Math.min(...aligned.controls) < 1, 'Peer animation headings and dropdowns align exactly: ' + JSON.stringify(aligned));
      assert.ok(aligned.durationWidths.every(width => width <= 128) && Math.max(...aligned.durationTops) - Math.min(...aligned.durationTops) < 1, 'Duration sliders share one aligned row');
      assert.ok(aligned.gaps.every(gap => gap <= 8), 'Removing the label also collapses its reserved gap');
      assert.ok(await page.locator('.gift-motion-phases select').evaluateAll(fields => fields.every(field => field.getBoundingClientRect().width <= 128)), 'Short effect selections use compact dropdowns');
      assert.ok(await page.locator('.gift-motion-phases select').evaluateAll(fields => {
        const widths = fields.map(field => field.getBoundingClientRect().width);
        return Math.max(...widths) - Math.min(...widths) < 1;
      }), 'Equivalent dropdowns have matching widths');
      assert.equal(await page.locator('.gift-feel-select').evaluate(label => Array.from(label.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())), false, 'Motion Feel has no extra visible label row');
    }
    await assertMotionRowAlignment();
    assert.ok(await page.locator('.gift-price-input').evaluate(field => field.getBoundingClientRect().width <= 190), 'Coin price retains room for the coin and amount without stretching across the panel');
    assert.ok(await page.locator('#gift-editor-modal').evaluate(modal => modal.getBoundingClientRect().width <= 1242), 'Desktop gift modal has a compact maximum width');
    await page.screenshot({ path: '/tmp/pulse-edit-gift-layout-desktop.png', animations: 'disabled' });
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.locator('#gift-editor-modal').evaluate(modal => { modal.scrollTop = 0; });
    await page.screenshot({ path: '/tmp/pulse-gift-reference-comparison.png', animations: 'disabled' });
    await page.setViewportSize({ width: 1000, height: 1000 });
    await assertHeaderSave();
    await assertMotionRowAlignment();
    await page.screenshot({ path: '/tmp/pulse-gift-editor-tablet.png', animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#gift-editor-modal').evaluate(modal => { modal.scrollTop = 0; });
    await assertMotionRowAlignment();
    assert.equal(await page.locator('.gift-modal-header').evaluate(header => header.getBoundingClientRect().bottom <= document.querySelector('.gift-identity-row').getBoundingClientRect().top), true, 'Wrapped header must not overlap gift fields');
    assert.equal(await page.locator('#gift-editor-modal').evaluate(modal => modal.scrollWidth > modal.clientWidth), false);
    await page.screenshot({ path: '/tmp/pulse-edit-gift-layout-phone.png', animations: 'disabled' });
    await page.locator('.gift-identity-row').scrollIntoViewIfNeeded();
    await assertHeaderSave();
    await page.screenshot({ path: '/tmp/pulse-gift-editor-fields-phone.png', animations: 'disabled' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Returning from another browser tab must retain the actual editor DOM,
    // unsaved values and loaded preview rather than re-fetching the catalog.
    const readsBeforeTabSwitch = catalogReads;
    await page.locator('#gift-draft-form [name="name"]').fill('Unsaved tab-switch draft');
    await page.evaluate(() => { window.retainedGiftEditor = document.getElementById('gift-editor-modal'); });
    async function switchBrowserTabs() {
      const checked = page.waitForResponse(r => r.url().endsWith('/api/admin-data/session'));
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));
        delete document.hidden;
      });
      await checked;
    }
    await switchBrowserTabs();
    assert.equal(await page.evaluate(() => window.retainedGiftEditor === document.getElementById('gift-editor-modal')), true);
    assert.equal(await page.locator('#gift-editor-modal').evaluate(d => d.open), true);
    assert.equal(await page.locator('#gift-draft-form [name="name"]').inputValue(), 'Unsaved tab-switch draft');
    assert.equal(await page.locator('#gift-preview-screen img').getAttribute('src'), artworkSrc);
    assert.equal(catalogReads, readsBeforeTabSwitch);
    await page.locator('#gift-draft-form [name="name"]').fill('Rose');
    assert.equal(await page.locator('#gift-default-sound-preview, [data-gift-preview="soundAssetId"]').count(), 0);
    const soundGeometry = () => page.locator('.gift-sound-controls').evaluate(panel => {
      const rect = panel.getBoundingClientRect(), button = panel.querySelector('[data-gift-sound-play="default"]').getBoundingClientRect();
      return { top: rect.top, height: rect.height, width: button.width, buttonHeight: button.height, statusTop: document.querySelector('.gift-publication-status').getBoundingClientRect().top };
    });
    const beforeSound = await soundGeometry();
    let releaseSound;
    soundPreviewGate = new Promise(resolve => { releaseSound = resolve; });
    await page.getByRole('button', { name: 'Play default sound', exact: true }).click();
    await page.locator('[data-gift-sound-play="default"][aria-busy="true"]').waitFor();
    assert.deepEqual(await soundGeometry(), beforeSound, 'Loading sound must not move the editor');
    releaseSound(); soundPreviewGate = null;
    await page.locator('#gift-sound-preview audio').waitFor({ state: 'attached' });
    assert.deepEqual(await soundGeometry(), beforeSound, 'Playing sound must not move the editor');
    await page.getByRole('button', { name: 'Stop default sound', exact: true }).click();
    assert.deepEqual(await soundGeometry(), beforeSound, 'Stopping sound must not move the editor');
    await page.getByRole('button', { name: 'Play default sound', exact: true }).click();
    await page.locator('#gift-sound-preview audio').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#gift-sound-preview audio').getAttribute('controls'), null);
    assert.equal(await page.locator('#gift-preview-screen img').getAttribute('src'),artworkSrc);
    await page.locator('[name="soundChoice"][value="custom"]').check();
    await page.locator('[data-gift-upload="soundAssetId"]').setInputFiles({name:"custom-bell.mp3",mimeType:"audio/mpeg",buffer:await fs.readFile(path.resolve(__dirname,"../../mobile/assets/moments/default-gift.mp3"))});
    await page.getByText("Validated upload ready. Save the draft to attach it.",{exact:true}).waitFor();
    assert.equal(await page.locator('[name="soundAssetId"]').inputValue(),"asset_sound_fixture");
    assert.equal(await page.locator('[data-current-file="soundAssetId"]').textContent(),"custom-bell.mp3");
    await page.getByRole('button',{name:'Play custom sound',exact:true}).click();
    await page.locator('#gift-sound-preview audio').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#gift-preview-screen img').getAttribute('src'),artworkSrc);
    await page.locator('[name="soundChoice"][value="default"]').check();
    await page.screenshot({path:"/tmp/pulse-gift-editor-clean-desktop.png"});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:"/tmp/pulse-gift-editor-clean-phone.png"});
    await page.setViewportSize({width:1440,height:1000});
    assert.equal(await page.locator('[name="type"]:checked').inputValue(), "image");
    assert.equal(await page.locator("#gift-animation-controls").isVisible(), false);
    assert.equal(await page.locator('#gift-image-motion-controls').isVisible(), true);
    assert.equal(await page.locator('#gift-image-motion-controls [name="imageHoldSeconds"]').count(), 1, 'Hold time belongs inside the animation panel');
    assert.equal(await page.locator('.gift-hold-card [name="imageFeel"]').count(), 1, 'Motion Feel is above the Hold duration');
    assert.equal(await page.getByLabel('Entrance', { exact: true }).inputValue(), 'pop');
    assert.equal(await page.getByLabel('Exit', { exact: true }).inputValue(), 'float-up');
    assert.equal(await page.locator('[name="imageEntrance"] option').count(), 5);
    assert.equal(await page.locator('[name="imageExit"] option').count(), 5);
    await page.getByLabel('Entrance', { exact: true }).selectOption('none');
    assert.equal(await page.getByLabel('Entrance duration', { exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Play entrance', exact: true }).isDisabled(), true);
    await page.getByLabel('Entrance', { exact: true }).selectOption('slide-down');
    assert.equal(await page.getByLabel('Exit', { exact: true }).inputValue(), 'float-up', 'Entrance does not change exit');
    await page.getByLabel('Exit', { exact: true }).selectOption('shrink');
    assert.equal(await page.getByLabel('Entrance', { exact: true }).inputValue(), 'slide-down', 'Exit does not change entrance');
    await page.getByRole('slider', {name: 'Entrance duration slider'}).fill('0.5');
    await page.getByRole('slider', {name: 'Entrance duration slider'}).dispatchEvent('change');
    await page.getByRole('slider', {name: 'Exit duration slider'}).fill('0.7');
    await page.getByRole('button', {name: 'Increase exit duration by 0.1 seconds'}).click();
    await page.getByRole('slider', {name: 'Hold duration slider'}).fill('2');
    await page.getByRole('slider', {name: 'Hold duration slider'}).dispatchEvent('change');
    await page.getByLabel('Motion Feel', { exact: true }).selectOption('bouncy');
    await page.getByRole('button', { name: 'Play entrance', exact: true }).click();
    assert.equal(await page.locator('#gift-preview-screen img').evaluate(img => img.getAnimations().at(-1).effect.getTiming().duration), 500);
    await page.getByRole('button', { name: 'Play exit', exact: true }).click();
    assert.equal(await page.locator('#gift-preview-screen img').evaluate(img => img.getAnimations().at(-1).effect.getTiming().duration), 800);
    await page.getByRole('button', { name: 'Play full animation', exact: true }).click();
    assert.equal(await page.locator('#gift-preview-screen img').evaluate(img => img.getAnimations().at(-1).effect.getTiming().duration), 3300);
    assert.equal(await page.locator('#gift-motion-total').textContent(), '3.3s');
    await page.locator('#gift-preview-timeline').fill('500');
    assert.equal(await page.locator('#gift-preview-screen img').evaluate(img => img.getAnimations().at(-1).playState), 'paused');
    assert.equal(await page.locator('#gift-preview-screen img').evaluate(img => img.getAnimations().at(-1).currentTime), 1650);
    assert.equal(await page.locator('#gift-image-motion-preview, [data-gift-preview="thumbnailAssetId"]').count(), 0, 'No redundant image preview buttons');
    assert.equal(await page.locator('#gift-preview-screen img').evaluate(img => img.getAnimations().length), 1);
    await page.locator('[name="type"][value="animation"]').check();
    assert.equal(await page.locator('[name="preset"]').isVisible(), true);
    assert.equal(await page.locator('[name="scale"]').isVisible(), true);
    await page.locator('[name="preset"]').selectOption('fullscreen');
    await page.locator('[name="scale"]').fill('1.12');
    assert.equal(await page.locator('#gift-image-motion-controls').isVisible(), false);
    assert.equal(await page.locator('#gift-original-sound-choice').isVisible(),true);
    await page.locator('[name="soundChoice"][value="original"]').check();
    assert.equal(await page.locator('[name="soundAssetId"]').inputValue(),"");
    assert.equal(await page.locator('[data-gift-drop="androidAssetId"] .gift-upload-zone').isVisible(), true);
    assert.equal(await page.locator('[data-gift-drop="iosAssetId"] .gift-upload-zone').isVisible(), false);
    await page.getByRole('button', { name: 'iOS', exact: true }).click();
    assert.equal(await page.locator('[data-gift-drop="iosAssetId"] .gift-upload-zone').isVisible(), true);
    assert.equal(await page.locator('[data-gift-drop="androidAssetId"] .gift-upload-zone').isVisible(), false);
    assert.equal(await page.locator('#gift-iosAssetId-preview').isVisible(), true);
    assert.equal(await page.locator('#gift-androidAssetId-preview').isVisible(), false);
    assert.equal(await page.locator('[name="preset"]').inputValue(), 'fullscreen', 'Platform switching preserves shared framing');
    await page.locator('[name="type"][value="image"]').check();
    assert.equal(await page.locator('[name="androidAssetId"]').isDisabled(), true);
    assert.equal(await page.locator("#gift-publish").count(), 0);
    assert.equal(await page.locator('#gift-editor-modal button[type="submit"]').count(),1);
    assert.equal(await page.locator('#gift-editor-modal [name="status"]:checked').inputValue(),'published');
    assert.equal(await page.locator('#gift-draft-form select[name="status"]').count(),0);
    await page.locator('#gift-editor-modal [name="status"][value="draft"]').check();
    await page
      .locator('[name="name"]')
      .last()
      .fill("<img src=x onerror=alert(1)>");
    await page.locator('[name="coinCost"]').fill("7");
    await page.locator('#gift-artwork-size').press('End');
    assert.equal(await page.locator('#gift-artwork-size-value').textContent(), '200%');
    await page.locator('#gift-artwork-size').press('Home');
    assert.equal(await page.locator('#gift-artwork-size-value').textContent(), '25%');
    for (let n = 0; n < 15; n++) await page.locator('#gift-artwork-size').press('ArrowRight');
    assert.equal(await page.locator('#gift-artwork-size-value').textContent(), '100%');
    assert.equal(await page.locator('#gift-artwork-size').inputValue(), '300', '100% is the midpoint');
    for (let n = 0; n < 5; n++) await page.locator('#gift-artwork-size').press('ArrowLeft');
    assert.equal(await page.locator('#gift-artwork-size-value').textContent(), '75%');
    await page.locator('#gift-advanced-options summary').click();
    assert.equal(await page.locator('[name="preset"]').isVisible(), false);
    assert.equal(await page.locator('[name="scale"]').isVisible(), false);
    const positionRow = await page.locator('.gift-position-row input:visible, .gift-position-row select:visible').evaluateAll(inputs => inputs.map(input => {
      const rect = input.getBoundingClientRect(); return { top: rect.top, height: rect.height };
    }));
    assert.equal(positionRow.length, 3);
    assert.equal(await page.locator('.gift-offset-group input:visible').count(), 2);
    assert.ok(await page.locator('.gift-offset-group .gift-offset-value').evaluateAll(fields => fields.every(field => field.getBoundingClientRect().width <= 80)), 'Position inputs are compact rather than stretched');
    assert.equal(await page.locator('#gift-offset-title').textContent(), 'Position');
    assert.equal(await page.locator('.gift-size-marks #gift-artwork-size-value').isVisible(), true, 'Current percentage is centered above the slider, not in the corner');
    assert.equal(await page.locator('.gift-position-row').evaluate(row => {
      const marks = row.querySelector('.gift-size-marks').getBoundingClientRect();
      const label = row.querySelector('.gift-offset-inputs label').getBoundingClientRect();
      const slider = row.querySelector('#gift-artwork-size').getBoundingClientRect();
      return Math.abs(marks.top - label.top) < 3 && marks.bottom <= slider.top;
    }), true, 'Size percentages sit above the slider and align with Position labels');
    assert.equal(await page.getByRole('spinbutton', { name: 'Horizontal offset', exact: true }).count(), 1);
    assert.equal(await page.locator('.gift-position-row').evaluate(row => {
      const size = row.querySelector('#gift-size-title').getBoundingClientRect();
      const position = row.querySelector('#gift-offset-title').getBoundingClientRect();
      return Math.abs(size.top - position.top) < 2;
    }), true, 'Size and Position headings align');
    assert.ok(positionRow.every(input => Math.abs(input.top - positionRow[0].top) < 3), 'Position inputs share one aligned desktop row');
    await page.getByRole('button', { name: 'Top right', exact: true }).click();
    assert.equal(await page.locator('[name="offsetX"]').inputValue(), '25');
    assert.equal(await page.locator('[name="offsetY"]').inputValue(), '-25');
    assert.equal(await page.locator('[name="x"]').inputValue(), '0.25');
    await page.locator('.gift-anchor-reset').click();
    assert.equal(await page.locator('[name="offsetX"]').inputValue(), '0');
    assert.equal(await page.locator('[name="offsetY"]').inputValue(), '0');
    await page.locator('[name="offsetY"]').fill('-10');
    await page.locator('[name="offsetY"]').press('Enter');
    assert.equal(await page.locator('#gift-editor-modal').evaluate(modal => modal.open), true, 'Enter in position must not submit');
    assert.equal(await page.locator('[name="y"]').inputValue(), '-0.1');
    assert.equal(await page.locator('#gift-preview-screen img').evaluate(img => img.style.top), '22.8125%');
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .waitForFunction(
        () =>
          !document.querySelector('#gift-editor-modal') &&
          document.querySelector('[data-gift-open="rose"] strong')?.textContent === '<img src=x onerror=alert(1)>',
      )
      .catch(async (e) => {
        console.error(
          "Gift save diagnostic:",
          mutations,
          await page.locator("#gift-status").textContent(),
          await page.locator("#gift-draft-form").evaluate((f) =>
            Array.from(f.elements)
              .filter((e) => e.validity && !e.validity.valid)
              .map((e) => ({ name: e.name, message: e.validationMessage })),
          ),
        );
        throw e;
      });
    const saved = mutations.find((m) => m.method === "PATCH");
    assert.equal(saved.body.coinCost, 7);
    assert.equal(saved.body.status,'draft');
    assert.equal(saved.body.thumbnailAssetId, "original_rose");
    assert.equal(saved.body.soundAssetId,"default_sound");
    assert.deepEqual(await page.locator("[data-gift-open]").evaluateAll(nodes => nodes.map(n => n.dataset.giftOpen)), ["cheap", "rose", "expensive"]);
    assert.equal(saved.body.type, "image");
    assert.equal(saved.body.androidAssetId, null);
    assert.equal(saved.body.iosAssetId, null);
    assert.equal(imports, 1, 'saving never reruns bundled asset import');
    await page.locator('[data-gift-open="rose"]').click();
    assert.equal(await page.locator('[name="artworkScale"]').inputValue(), '75');
    assert.equal(await page.getByLabel('Entrance', { exact: true }).inputValue(), 'slide-down');
    assert.equal(await page.getByLabel('Exit', { exact: true }).inputValue(), 'shrink', 'Independent choices survive reopening');
    assert.equal(await page.locator('[name="type"]:checked').inputValue(), "image");
    assert.equal(await page.locator("#gift-animation-controls").isVisible(), false);
    assert.deepEqual(saved.body.framing, {
      imageMotion: 'pop-float',
      imageEntrance: 'slide-down',
      imageExit: 'shrink',
      imageEnterMs: 500,
      imageHoldMs: 2000,
      imageExitMs: 800,
      imageFeel: 'bouncy',
      artworkScale: .75,
      preset: "fullscreen",
      scale: 1.12,
      x: 0,
      y: -0.1,
    });
    await page.locator('[data-gift-open="rose"] img').waitFor();
    assert.equal(await page.locator(".gift-card img[onerror]").count(), 0);
    assert.equal(saved.body.collectionId, "popular");
    await page.locator('#gift-editor-modal [name="status"][value="published"]').check();
    await page.getByRole("button", { name: "Save", exact:true }).click();
    await page.waitForFunction(
      () => document.querySelector('[data-gift-open="rose"] small:last-child')?.textContent === 'published',
    );
    assert.equal(mutations.at(-1).body.status, "published");
    assert.equal(mutations.some(m=>m.p.endsWith('/publish')),false,'One status save, not a separate publication request');
    assert.equal(await page.locator('#gift-editor-modal').count(), 0);
    await page.locator('[data-gift-open="rose"]').click();
    if (!await page.locator('#gift-advanced-options').evaluate(section => section.open)) {
      await page.locator('#gift-advanced-options > summary').click();
    }
    await page.locator("#gift-history").click();
    await page.locator(".gift-history").first().waitFor();
    assert.equal(await page.locator("#gift-history-records img").count(), 0);
    uploadReject = true;
    await page.locator('[data-gift-upload="thumbnailAssetId"]').setInputFiles({
      name: "bad.png",
      mimeType: "image/png",
      buffer: Buffer.from("bad"),
    });
    await page.getByText("Invalid PNG content", { exact: true }).waitFor();
    uploadReject = false;
    await page.locator('[data-gift-upload="thumbnailAssetId"]').setInputFiles({name:"replacement.PNG",mimeType:"image/png",buffer:await fs.readFile(path.resolve(__dirname,"../../mobile/assets/gifts/rose.png"))});
    await page.getByText("Validated upload ready. Save the draft to attach it.",{exact:true}).waitFor();
    assert.equal(await page.locator('[name="thumbnailAssetId"]').inputValue(),"asset_fixture");
    assert.equal(await page.locator('[data-current-file="thumbnailAssetId"]').textContent(),"replacement.PNG");
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#gift-editor-modal') && document.querySelector('[data-gift-open="rose"] small:last-child')?.textContent==='published');
    assert.equal(mutations.filter(m=>m.method==='PATCH').at(-1).body.thumbnailAssetId,'asset_fixture');
    await page.locator('[data-gift-open="rose"]').click();
    assert.equal(await page.locator('[name="thumbnailAssetId"]').inputValue(), 'asset_fixture');
    assert.match(await page.locator('[data-gift-upload="thumbnailAssetId"]').getAttribute('accept'), /image\/webp/);
    assert.equal(await page.locator('[data-gift-replace="thumbnailAssetId"]').isVisible(), true);
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-gift-replace="thumbnailAssetId"]').click();
    await (await chooser).setFiles({ name: 'artwork.webp', mimeType: 'image/webp', buffer: Buffer.from('fixture') });
    await page.waitForFunction(()=>document.querySelector('[data-current-file="thumbnailAssetId"]')?.textContent === 'artwork.webp');
    await page.locator('[data-gift-drop="thumbnailAssetId"]').evaluate(zone => {
      const transfer = new DataTransfer(); transfer.items.add(new File(['fixture'], 'dropped.WEBP', { type: 'image/webp' }));
      zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    });
    await page.waitForFunction(()=>document.querySelector('[data-current-file="thumbnailAssetId"]')?.textContent === 'dropped.WEBP');
    await page.locator('[name="type"][value="animation"]').check();
    const formats = await page.locator('[data-gift-upload="iosAssetId"]').getAttribute("data-formats");
    assert.equal(formats, "svga,packed-alpha-mp4");
    assert.equal(await page.locator('[data-gift-upload="iosAssetId"]').getAttribute("accept"), ".svga,.mp4");
    await page.screenshot({
      path: "/tmp/pulse-admin-gifts-desktop.png",
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    assert.equal(await page.locator('#gift-editor-modal').count(), 0);
    assert.equal(await page.locator('[data-gift-open="rose"]').evaluate(b => document.activeElement === b), true);
    await page.locator('#gift-new').click();
    assert.equal(await page.locator('#gift-editor-modal [name="status"]:checked').inputValue(),'draft');
    await page.locator('#gift-draft-form [name="name"]').fill("New Image Test");
    assert.equal(await page.locator('#gift-draft-form [name="id"]').inputValue(), "new_image_test");
    await page.locator('#gift-editor-close').click();
    assert.equal(await page.locator('#gift-editor-modal').count(), 0);
    await page.screenshot({path:"/tmp/pulse-gift-collections-clean.png"});
    await page.locator('#gift-new-collection').click();
    assert.equal(await page.locator('#gift-collection-modal').evaluate(d=>d.open), true);
    await page.locator('#gift-add-collection [name="name"]').fill("Seasonal");
    assert.equal(await page.locator('#gift-add-collection [name="id"]').inputValue(), "seasonal");
    await page
      .getByRole("button", { name: "Add collection", exact: true })
      .click();
    await page.getByRole("button", { name: "Seasonal", exact: true }).waitFor();
    assert.equal(await page.locator('#gift-collection-modal').count(), 0);
    assert.equal(await page.getByRole("button", {name:"Seasonal",exact:true}).getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator('#gift-collection-summary').textContent(),'Gifts: 0 · Status: Draft');
    await page.getByRole("button", { name: "Seasonal", exact: true }).click();
    const beforeReturn = catalogReads;
    await page.evaluate(() => { location.hash = '#users'; });
    await page.waitForFunction(()=>document.querySelector('#breadcrumb')?.textContent === 'Users');
    await page.evaluate(() => { location.hash = '#gifts'; });
    await page.getByRole('button', { name: 'Seasonal', exact: true }).waitFor();
    assert.equal(catalogReads, beforeReturn, 'returning to Gifts keeps the loaded catalog');
    assert.equal(await page.locator('[data-gift-collection="seasonal"]').getAttribute('aria-pressed'), 'true');
    await page.locator('#gift-manage-collection').click();
    await page
      .locator('#gift-collection-editor [name="status"]')
      .selectOption("published");
    await page
      .getByRole("button", { name: "Save collection", exact: true })
      .click();
    await page.waitForFunction(() => !document.querySelector('#gift-collection-modal'));
    assert.equal(mutations.at(-1).body.status, "published");
    await page.locator('[data-gift-collection="seasonal"]').dragTo(page.locator('[data-gift-collection="luxury"]'));
    await page.waitForFunction(
      () =>
        document.querySelectorAll("[data-gift-collection]")[1]?.dataset
          .giftCollection === "seasonal",
    );
    assert.deepEqual(mutations.at(-1).body.ids, [
      "popular",
      "seasonal",
      "luxury",
    ]);
    assert.equal(await page.locator('[data-collection-move]').count(), 0);
    await page.locator('[data-gift-collection="luxury"]').focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await page.waitForFunction(() => document.querySelectorAll('[data-gift-collection]')[1]?.dataset.giftCollection === "luxury");
    await page.locator('[data-gift-collection="luxury"]').focus();
    await page.keyboard.press('Alt+ArrowRight');
    await page.waitForFunction(() => document.querySelectorAll('[data-gift-collection]')[1]?.dataset.giftCollection === "seasonal");
    assert.equal(await page.locator('[data-gift-collection="popular"]').evaluate(button => {
      const event = new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()});
      button.dispatchEvent(event);return event.defaultPrevented;
    }), true);
    await page.locator('#gift-manage-collection').click();
    await page.getByText("Archive", {exact:true}).click();
    await page.locator("#gift-archive-collection").click();
    await page.waitForFunction(() => !document.querySelector('#gift-collection-modal'));
    assert.equal(data.collections.find(c=>c.id==="seasonal").status,"archived");
    await page.locator('#gift-new-collection').click();
    await page.locator('#gift-add-collection [name="name"]').fill("Discarded collection");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator('#gift-collection-modal').count(), 0);
    assert.equal(await page.getByRole('button',{name:'Discarded collection',exact:true}).count(),0);
    await page.setViewportSize({width:390,height:844});
    const client=await page.context().newCDPSession(page);
    await client.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    await page.locator('[data-gift-collection="luxury"]').scrollIntoViewIfNeeded();
    const grip=await page.locator('[data-gift-collection="luxury"] .gift-collection-drag-handle').boundingBox();
    const target=await page.locator('[data-gift-collection="seasonal"]').boundingBox();
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:grip.x+grip.width/2,y:grip.y+grip.height/2,id:1}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:target.x+target.width/4,y:target.y+target.height/2,id:1}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>document.querySelectorAll('[data-gift-collection]')[1]?.dataset.giftCollection==='luxury');
    await client.send('Emulation.setTouchEmulationEnabled',{enabled:false});
    await client.detach();
    await page.getByRole("button", { name: "Popular · Default" }).click();
    await page.locator('[data-gift-open="rose"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    const row = await page.locator('.gift-price-field').evaluate(label => {
      const text=label.querySelector('span').getBoundingClientRect(), coin=label.querySelector('svg').getBoundingClientRect(), input=label.querySelector('input').getBoundingClientRect();
      return {textY:text.y+text.height/2,coinY:coin.y+coin.height/2,inputY:input.y+input.height/2};
    });
    assert.ok(row.textY < row.inputY && Math.abs(row.coinY-row.inputY)<2, "Price label is above; gold coin stays beside the amount");
    const matchingFields = await page.locator('.gift-identity-row').evaluate(row => {
      const name = row.querySelector('[name="name"]').getBoundingClientRect(),
        price = row.querySelector('.gift-price-input').getBoundingClientRect(),
        nameLabel = row.querySelector('.gift-name-field').getBoundingClientRect(),
        priceLabel = row.querySelector('.gift-price-field').getBoundingClientRect();
      return { tops: Math.abs(name.top-price.top), heights: Math.abs(name.height-price.height), labels: Math.abs(nameLabel.top-priceLabel.top) };
    });
    assert.ok(matchingFields.tops < 2 && matchingFields.heights < 2 && matchingFields.labels < 2, 'Name and price use matching labels and input boxes');
    assert.equal(await page.locator('#gift-editor-modal').evaluate(d => d.scrollWidth>d.clientWidth), false);
    await page.locator('.gift-publication-status').scrollIntoViewIfNeeded();
    const statusLayout=await page.locator('.gift-publication-status').evaluate(field=>({
      heights:Array.from(field.querySelectorAll('label')).map(label=>label.getBoundingClientRect().height),
      insideFooter:!!field.closest('footer'),
      rightPanel:!!field.closest('.gift-artwork-settings'),
      insideHeader:!!field.closest('.gift-modal-header'),
    }));
    assert.ok(statusLayout.heights.every(height=>height>=44),'Status choices retain accessible touch targets');
    assert.equal(statusLayout.insideFooter,false);
    assert.equal(statusLayout.rightPanel,false);
    assert.equal(statusLayout.insideHeader,true);
    assert.equal(await page.locator('.gift-artwork-settings > .gift-position-row').count(), 1, 'Position stays in the right panel');
    await assertHeaderSave();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "/tmp/pulse-admin-gifts-phone.png",
      fullPage: true,
    });
    denied = true;
    await switchBrowserTabs();
    await page
      .getByRole("heading", { name: "Admin access required" })
      .waitFor();
    assert.equal(await page.locator("#gift-workspace").count(), 0);
    assert.equal(await page.locator("input[type=file]").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "Gift catalog browser fixtures passed: gift/collection modals, selected image cards, replacement uploads, desktop/touch/keyboard collection ordering, locked Popular, one-row coin controls, draft/publish, framing, escaping, phone layout and access-loss clearing.",
    );
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

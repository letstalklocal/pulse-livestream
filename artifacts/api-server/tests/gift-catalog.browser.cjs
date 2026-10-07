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
      if (!["app.js", "styles.css", "index.html"].includes(name))
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
    let denied = false,
      uploadReject = false,
      mutations = [],
      draftSequence = 1;
    await page.route("**/api/gift-catalog/assets/**", async route => {
      assert.equal(route.request().headers().authorization, "Bearer fixture");
      if (route.request().url().endsWith('/fixture_svga')) return route.fulfill({contentType:"application/octet-stream",body:await fs.readFile(path.resolve(__dirname,"../../mobile/assets/gifts/luxury/Virtual-Kiss-Gift.svga"))});
      const sound = /\/(default_sound|asset_sound_fixture)$/.test(route.request().url());
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
      if (p === "/api/admin-data/gifts" && req.method() === "GET")
        return route.fulfill({ json: data });
      if (p.endsWith("/assets/import-existing")) return route.fulfill({json:{imported:12}});
      if (p.endsWith("/assets")) {
        assert.equal(req.headers()["content-type"], "application/octet-stream");
        const params = new URL(req.url()).searchParams;
        const sound = params.get("kind") === "sound";
        assert.equal(params.get("format"),sound ? "mp3" : "png");
        assert.ok(params.get("filename"));
        if (uploadReject)
          return route.fulfill({
            status: 400,
            json: { error: "Invalid PNG content" },
          });
        const asset = {
          id: sound ? "asset_sound_fixture" : "asset_fixture",
          kind: sound ? "sound" : "thumbnail",
          format: sound ? "mp3" : "png",
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
      await page.locator(`#gift-${field}-preview canvas`).waitFor();
      await page.waitForFunction(field => document.getElementById(`gift-${field}-feedback`)?.textContent.includes('SVGA animation preview'),field);
      await page.waitForFunction(field => {
        const canvas=document.querySelector(`#gift-${field}-preview canvas`);
        const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        for(let i=3;i<pixels.length;i+=4) if(pixels[i]>0) return true;
        return false;
      },field);
      assert.equal(await page.locator(`[data-gift-upload="${field}"]`).evaluate(input=>input.closest('.gift-platform-preview').querySelector('.gift-preview-screen').id),`gift-${field}-preview`);
    }
    await page.locator('#gift-preview-screen img').waitFor();
    const animatedArtwork = await page.locator('#gift-preview-screen img').getAttribute('src');
    const iphoneCanvas = await page.locator('#gift-iosAssetId-preview canvas').evaluate(c=>{c.dataset.original='true';return c.dataset.original;});
    await page.locator('[data-gift-preview="androidAssetId"]').click();
    await page.waitForFunction(()=>document.getElementById('gift-androidAssetId-feedback')?.textContent.includes('SVGA animation preview'));
    assert.equal(await page.locator('#gift-iosAssetId-preview canvas').getAttribute('data-original'),iphoneCanvas);
    assert.equal(await page.locator('#gift-preview-screen img').getAttribute('src'),animatedArtwork);
    await page.locator('#gift-iosAssetId-preview button').click();
    assert.equal(await page.locator('#gift-iosAssetId-preview button').textContent(),'Play preview');
    await page.keyboard.press('Escape');
    await page.locator('[data-gift-collection="popular"]').click();
    await page.locator('[data-gift-open="rose"]').click();
    assert.equal(await page.locator('#gift-editor-modal').evaluate(d => d.open), true);
    const actionSizes = await page.locator('#gift-draft-form .gift-modal-actions > button').evaluateAll(buttons => buttons.map(button => {const r=button.getBoundingClientRect();return {width:r.width,height:r.height};}));
    assert.deepEqual(actionSizes[0],actionSizes[1],'Cancel and Save match on desktop');
    assert.ok(actionSizes[0].height>=44);
    assert.equal(await page.locator('#gift-draft-form > fieldset legend').first().textContent(), "Gift type");
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
    await page.locator('#gift-default-sound-preview').click();
    await page.locator('#gift-sound-preview audio').waitFor();
    assert.equal(await page.locator('#gift-preview-screen img').getAttribute('src'),artworkSrc);
    await page.locator('[name="soundChoice"][value="custom"]').check();
    await page.locator('[data-gift-upload="soundAssetId"]').setInputFiles({name:"custom-bell.mp3",mimeType:"audio/mpeg",buffer:await fs.readFile(path.resolve(__dirname,"../../mobile/assets/moments/default-gift.mp3"))});
    await page.getByText("Validated upload ready. Save the draft to attach it.",{exact:true}).waitFor();
    assert.equal(await page.locator('[name="soundAssetId"]').inputValue(),"asset_sound_fixture");
    assert.equal(await page.locator('[data-current-file="soundAssetId"]').textContent(),"custom-bell.mp3");
    await page.getByRole('button',{name:'Preview custom sound file',exact:true}).click();
    await page.locator('#gift-sound-preview audio').waitFor();
    assert.equal(await page.locator('#gift-preview-screen img').getAttribute('src'),artworkSrc);
    await page.locator('[name="soundChoice"][value="default"]').check();
    await page.screenshot({path:"/tmp/pulse-gift-editor-clean-desktop.png"});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:"/tmp/pulse-gift-editor-clean-phone.png"});
    await page.setViewportSize({width:1440,height:1000});
    assert.equal(await page.locator('[name="type"]:checked').inputValue(), "image");
    assert.equal(await page.locator("#gift-animation-controls").isVisible(), false);
    await page.locator('[name="type"][value="animation"]').check();
    assert.equal(await page.locator('#gift-original-sound-choice').isVisible(),true);
    await page.locator('[name="soundChoice"][value="original"]').check();
    assert.equal(await page.locator('[name="soundAssetId"]').inputValue(),"");
    assert.equal(await page.locator('[data-gift-upload="androidAssetId"]').isVisible(), true);
    assert.equal(await page.locator('[data-gift-upload="iosAssetId"]').isVisible(), true);
    await page.locator('[name="type"][value="image"]').check();
    assert.equal(await page.locator('[name="androidAssetId"]').isDisabled(), true);
    assert.equal(await page.locator("#gift-publish").count(), 0);
    assert.equal(await page.locator('#gift-draft-form button[type="submit"]').count(),1);
    assert.equal(await page.locator('#gift-draft-form [name="status"]:checked').inputValue(),'published');
    assert.equal(await page.locator('#gift-draft-form select[name="status"]').count(),0);
    await page.locator('#gift-draft-form [name="status"][value="draft"]').check();
    await page
      .locator('[name="name"]')
      .last()
      .fill("<img src=x onerror=alert(1)>");
    await page.locator('[name="coinCost"]').fill("7");
    await page.locator('#gift-advanced-options summary').click();
    await page.locator('[name="preset"]').selectOption("fullscreen");
    await page.locator('[name="scale"]').fill("1.12");
    await page.locator('[name="y"]').fill("-0.1");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .waitForFunction(
        () =>
          document.querySelector('#gift-draft-form [name="status"]:checked')?.value === 'draft' &&
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
    assert.equal(await page.locator('[name="type"]:checked').inputValue(), "image");
    assert.equal(await page.locator("#gift-animation-controls").isVisible(), false);
    assert.deepEqual(saved.body.framing, {
      preset: "fullscreen",
      scale: 1.12,
      x: 0,
      y: -0.1,
    });
    await page.locator('[data-gift-open="rose"] img').waitFor();
    assert.equal(await page.locator(".gift-card img[onerror]").count(), 0);
    assert.equal(saved.body.collectionId, "popular");
    await page.locator('#gift-draft-form [name="status"][value="published"]').check();
    await page.getByRole("button", { name: "Save", exact:true }).click();
    await page.waitForFunction(
      () => document.querySelector('[data-gift-open="rose"] small:last-child')?.textContent === 'published',
    );
    assert.equal(mutations.at(-1).body.status, "published");
    assert.equal(mutations.some(m=>m.p.endsWith('/publish')),false,'One status save, not a separate publication request');
    await page.getByText("Manage gift", {exact:true}).click();
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
    await page.waitForFunction(()=>document.querySelector('[name="thumbnailAssetId"]')?.value==='asset_fixture' && document.querySelector('[data-gift-open="rose"] small:last-child')?.textContent==='published');
    assert.equal(mutations.filter(m=>m.method==='PATCH').at(-1).body.thumbnailAssetId,'asset_fixture');
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
    assert.equal(await page.locator('#gift-draft-form [name="status"]:checked').inputValue(),'draft');
    await page.locator('#gift-draft-form [name="name"]').fill("New Image Test");
    assert.equal(await page.locator('#gift-draft-form [name="id"]').inputValue(), "new_image_test");
    await page.locator('#gift-editor-cancel').click();
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
    assert.ok(Math.abs(row.textY-row.coinY)<2 && Math.abs(row.coinY-row.inputY)<2, "price label, gold artwork and amount share one row");
    assert.equal(await page.locator('#gift-editor-modal').evaluate(d => d.scrollWidth>d.clientWidth), false);
    await page.locator('.gift-publication-status').scrollIntoViewIfNeeded();
    const statusLayout=await page.locator('.gift-publication-status').evaluate(field=>({
      heights:Array.from(field.querySelectorAll('label')).map(label=>label.getBoundingClientRect().height),
      aboveActions:!!(field.compareDocumentPosition(document.querySelector('#gift-editor-cancel'))&Node.DOCUMENT_POSITION_FOLLOWING),
      insideFooter:!!field.closest('footer'),
    }));
    assert.ok(statusLayout.heights.every(height=>height>=56),'Status choices match the full-size Type controls');
    assert.equal(statusLayout.aboveActions,true);
    assert.equal(statusLayout.insideFooter,false);
    const phoneActionSizes = await page.locator('#gift-draft-form .gift-modal-actions > button').evaluateAll(buttons => buttons.map(button => {const r=button.getBoundingClientRect();return {width:r.width,height:r.height};}));
    assert.deepEqual(phoneActionSizes[0],phoneActionSizes[1],'Cancel and Save match at phone width');
    assert.ok(phoneActionSizes[0].height>=44);
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
    await page.locator('#gift-editor-close').click();
    await page.locator("#gift-refresh").click();
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

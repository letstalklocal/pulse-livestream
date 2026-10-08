const icons = {
  Overview:
    '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  Users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
  "Account removals":
    '<path d="M5 7h14M9 7V4h6v3M7 7l1 14h8l1-14M10 10v7m4-7v7"/>',
  "Live streams":
    '<rect x="3" y="5" width="12" height="14" rx="3"/><path d="m15 10 6-4v12l-6-4"/>',
  Verification:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  "Wallet & earnings":
    '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 8V5l14-3v3M16 12h5v5h-5z"/>',
  Gifts:
    '<path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8H8a3 3 0 1 1 3-3zm0 0h4a3 3 0 1 0-3-3z"/>',
  "Payout methods": '<path d="M3 12h18M12 3v18M5 5h14v14H5z"/>',
  "Payout desk": '<path d="M4 5h16v15H4zM8 9h8m-8 4h5m-5 4h3M15 16l2 2 4-5"/>',
  "Payout operators":
    '<circle cx="8" cy="9" r="4"/><path d="m11 12 9 9m-3-3 3-3m-6 0 3-3"/>',
  Moderation: '<path d="M5 21V3m0 1h14l-3 5 3 5H5"/>',
  "Audit log":
    '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h4"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.Overview}</svg>`;
const giftState = {
  version: 0,
  previewVersion: 0,
  data: null,
  collection: "popular",
  selected: null,
  busy: false,
  urls: [],
  previewFrame: null,
  previewMedia: null,
  previewAudio: null,
  cardUrls: [],
  artworkUrl: null,
  animationPreviews: {},
};
let giftSvgaPromise;
function loadGiftSvga() {
  if (window.SVGA) return Promise.resolve(window.SVGA);
  if (!giftSvgaPromise) giftSvgaPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "./gift-svga.js";
    script.onload = () => window.SVGA ? resolve(window.SVGA) : reject(new Error("SVGA preview player unavailable."));
    script.onerror = () => { giftSvgaPromise = null; script.remove(); reject(new Error("Unable to load SVGA preview player.")); };
    document.head.append(script);
  });
  return giftSvgaPromise;
}
function stopGiftAnimation(field) {
  const state = giftState.animationPreviews[field];
  if (!state) return;
  state.previewVersion++;
  if (state.previewFrame) cancelAnimationFrame(state.previewFrame);
  state.svga?.stopAnimation(true);
  for (const media of [state.previewMedia, state.previewAudio]) {
    if (media) { media.pause(); media.removeAttribute("src"); media.load(); }
  }
  state.previewMedia = null;
  state.previewAudio = null;
  state.previewFrame = null;
  state.urls.forEach(url => URL.revokeObjectURL(url));
  delete giftState.animationPreviews[field];
}
const giftCoin =
  '<svg class="gift-coin" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#E5A400" stroke="#A96B00" stroke-width="1"/><circle cx="12" cy="12" r="8.5" fill="#FFD54A" stroke="#FFF0A3" stroke-width="1.5"/><path d="M15 8.5a4.5 4.5 0 1 0 0 7" fill="none" stroke="#B87900" stroke-width="2" stroke-linecap="round"/></svg>';
function stopGiftPreview(preserveArtwork = false) {
  if (!preserveArtwork) Object.keys(giftState.animationPreviews).forEach(stopGiftAnimation);
  giftState.previewVersion++;
  if (giftState.previewFrame) cancelAnimationFrame(giftState.previewFrame);
  giftState.previewFrame = null;
  if (giftState.previewMedia) {
    giftState.previewMedia.pause();
    giftState.previewMedia.removeAttribute("src");
    giftState.previewMedia.load();
  }
  giftState.previewMedia = null;
  if (giftState.previewAudio) {
    giftState.previewAudio.pause();
    giftState.previewAudio.removeAttribute("src");
    giftState.previewAudio.load();
  }
  giftState.previewAudio = null;
  giftState.urls.forEach((url) => URL.revokeObjectURL(url));
  giftState.urls = [];
  if (!preserveArtwork && giftState.artworkUrl) {
    URL.revokeObjectURL(giftState.artworkUrl);
    giftState.artworkUrl = null;
  }
  document.getElementById("gift-sound-preview")?.replaceChildren();
}
function resetGifts() {
  stopGiftPreview();
  closeGiftEditor();
  closeGiftCollectionEditor();
  clearGiftCardArtwork();
  giftState.version++;
  giftState.data = null;
  giftState.collection = "popular";
  giftState.selected = null;
  giftState.busy = false;
}
function giftsPage() {
  return `<section class="panel gift-panel"><div class="panel-heading"><div><h2>Gift collections</h2><p>Popular opens first. Publish complete revisions; previous receipts keep their original artwork and price.</p></div><button class="page-button" id="gift-refresh">Refresh gifts</button></div><div class="gift-content"><p id="gift-status" role="status">Loading gifts…</p><div id="gift-workspace"></div></div></section>`;
}
function bindGiftEvents() {
  bindCollectionDragEvents();
  main.addEventListener("click", async (event) => {
    if (section !== "Gifts" || !authorized) return;
    const b = event.target.closest("button");
    if (!b || giftState.busy) return;
    if (b.id === "gift-new-collection") return renderGiftCollectionEditor(true);
    if (b.id === "gift-manage-collection") return renderGiftCollectionEditor(false);
    if (b.id === "gift-collection-close" || b.id === "gift-collection-cancel") return closeGiftCollectionEditor();
    if (b.id === "gift-editor-close" || b.id === "gift-editor-cancel") return closeGiftEditor();
    if (b.id === "gift-refresh") return loadGifts();
    if (b.dataset.giftCollection) {
      giftState.version++;
      stopGiftPreview();
      giftState.collection = b.dataset.giftCollection;
      giftState.selected = null;
      return renderGifts();
    }
    if (b.id === "gift-new" || b.dataset.giftOpen) {
      giftState.version++;
      giftState.selected = b.dataset.giftOpen || "__new__";
      return renderGiftEditor();
    }
    if (b.dataset.collectionMove) {
      const list = [...giftState.data.collections].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        ),
        i = list.findIndex((c) => c.id === giftState.collection),
        next = i + Number(b.dataset.collectionMove);
      if (next < 1 || next >= list.length) return;
      [list[i], list[next]] = [list[next], list[i]];
      return giftMutation("/collections/reorder", {
        ids: list.map((c) => c.id),
      });
    }
    if (b.dataset.giftMove) {
      const list = giftState.data.gifts
          .filter((g) => g.collectionId === giftState.collection)
          .sort((a, b) => a.sortOrder - b.sortOrder),
        i = list.findIndex((g) => g.id === b.dataset.giftMove),
        next = i + Number(b.dataset.direction);
      if (next < 0 || next >= list.length) return;
      [list[i], list[next]] = [list[next], list[i]];
      return giftMutation("/gifts/reorder", {
        collectionId: giftState.collection,
        ids: list.map((g) => g.id),
      });
    }
    if (b.id === "gift-archive-collection")
      return giftMutation(
        "/collections/" + encodeURIComponent(giftState.collection),
        { status: "archived" },
        "PATCH",
      );
    const g = giftState.data.gifts.find((g) => g.id === giftState.selected);
    if (b.id === "gift-archive" && g)
      return giftMutation("/gifts/" + encodeURIComponent(g.id) + "/archive");
    if (b.id === "gift-history" && g) {
      const version = giftState.version;
      try {
        const result = await api(
          "/gifts/gifts/" + encodeURIComponent(g.id) + "/revisions",
        );
        if (version !== giftState.version || !authorized) return;
        document.getElementById("gift-history-records").innerHTML =
          `<h3>Revision history</h3>${(result.revisions || result).map((r) => `<article class="gift-history"><strong>${esc(r.name)}</strong> · ${giftCoin} ${esc(r.coinCost)} coins<small>${esc(r.id)} · ${esc(r.createdAt)}</small></article>`).join("")}`;
      } catch (error) {
        if (version === giftState.version && !accessError(error))
          document.getElementById("gift-editor-feedback").textContent =
            error.message;
      }
    }
    if (b.dataset.giftPreview) return previewGiftAsset(b.dataset.giftPreview);
  });
  main.addEventListener("change", async (event) => {
    const input = event.target;
    if (input.name === "soundChoice" && input.form?.getAttribute("id") === "gift-draft-form") {
      stopGiftPreview(true);
      updateGiftSound(input.form);
      return;
    }
    if (input.name === "type" && input.form?.getAttribute("id") === "gift-draft-form") {
      stopGiftPreview();
      updateGiftType(input.form);
      previewGiftSelections(input.form);
      return;
    }
    if (input.name === "thumbnailAssetId" && input.form?.getAttribute("id") === "gift-draft-form") {
      previewGiftAsset("thumbnailAssetId");
      return;
    }
    if (!input.dataset.giftUpload || section !== "Gifts" || !authorized) return;
    const file = input.files?.[0];
    if (!file) return;
    const field = input.dataset.giftUpload,
      extension = file.name.split(".").pop().toLowerCase(),
      format = ({png:"png",jpg:"jpeg",jpeg:"jpeg",webp:"webp",svga:"svga",webm:"webm-alpha",mp4:"packed-alpha-mp4",mp3:"mp3",aac:"aac"})[extension],
      feedback = main.querySelector(`[data-upload-feedback="${field}"]`),
      version = giftState.version;
    const allowed = input.dataset.formats.split(",");
    if (!allowed.includes(format)) {
      feedback.textContent = "Choose a supported file: " + input.accept;
      input.value = "";
      return;
    }
    const max = giftState.data.limits?.[input.dataset.kind] || 30 * 1024 * 1024;
    if (file.size > max) {
      feedback.textContent = `File exceeds ${Math.round(max / 1024 / 1024)} MB upload limit.`;
      input.value = "";
      return;
    }
    if (!file.size) {
      feedback.textContent = "Select a nonempty file.";
      return;
    }
    if (giftState.busy) {
      feedback.textContent = "Wait for the current save or upload to finish.";
      return;
    }
    giftState.busy = true;
    const uploadButtons = Array.from(
      main.querySelectorAll(".gift-panel button"),
    ).map((b) => [b, b.disabled]);
    uploadButtons.forEach(([b]) => (b.disabled = true));
    input.disabled = true;
    feedback.textContent = "Uploading and validating file content…";
    try {
      const session = window.Clerk.session?.id,
        token = await window.Clerk.session?.getToken();
      if (
        version !== giftState.version ||
        !authorized ||
        session !== window.Clerk.session?.id
      )
        return;
      if (!token)
        throw Object.assign(new Error("Please sign in again."), {
          status: 401,
        });
      const response = await fetch(
        `/api/admin-data/gifts/assets?kind=${encodeURIComponent(input.dataset.kind)}&format=${encodeURIComponent(format)}&filename=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          body: file,
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/octet-stream",
          },
          credentials: "omit",
          cache: "no-store",
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw Object.assign(
          new Error(result.error || "Upload validation failed."),
          { status: response.status },
        );
      if (version !== giftState.version || !authorized || section !== "Gifts")
        return;
      result.label = file.name;
      result.fileName = file.name;
      giftState.data.assets.push(result);
      main.querySelector(`[name="${field}"]`).value = result.id;
      main.querySelector(`[data-current-file="${field}"]`).textContent = file.name;
      if (field === "soundAssetId") main.querySelector('[name="soundAssetId"]').dataset.customSoundId = result.id;
      if (field !== "soundAssetId") previewGiftAsset(field);
      feedback.textContent =
        "Validated upload ready. Save the draft to attach it.";
    } catch (error) {
      if (version === giftState.version && !accessError(error))
        feedback.textContent = error.message;
    } finally {
      if (version === giftState.version) giftState.busy = false;
      uploadButtons.forEach(([b, disabled]) => {
        if (b.isConnected) b.disabled = disabled;
      });
      input.disabled = false;
      input.value = "";
    }
  });
}
async function previewGiftAsset(field) {
  const select = main.querySelector(`[name="${field}"]`),
    asset = giftAsset(select.value);
  const soundPreview = field === "soundAssetId";
  const animationPreview = field === "androidAssetId" || field === "iosAssetId";
  if (animationPreview) stopGiftAnimation(field);
  else stopGiftPreview(true);
  if (!animationPreview && !soundPreview && giftState.artworkUrl) {
    URL.revokeObjectURL(giftState.artworkUrl);
    giftState.artworkUrl = null;
  }
  const state = animationPreview ? (giftState.animationPreviews[field] = {previewVersion: 0, urls: [], previewMedia: null, previewAudio: null, previewFrame: null}) : giftState;
  const screen = document.getElementById(soundPreview ? "gift-sound-preview" : animationPreview ? `gift-${field}-preview` : "gift-preview-screen"),
    feedback = document.getElementById(soundPreview ? "gift-sound-preview-feedback" : animationPreview ? `gift-${field}-feedback` : "gift-preview-feedback"),
    version = giftState.version,
    previewVersion = state.previewVersion;
  screen.replaceChildren();
  if (!asset) {
    feedback.textContent = "Select or upload an asset first.";
    return;
  }
  if (!/^\/api\/gift-catalog\/assets\/[a-zA-Z0-9_-]+$/.test(asset.url)) {
    feedback.textContent = "Invalid catalog asset URL.";
    return;
  }
  feedback.textContent = "Loading preview…";
  try {
    const token = await window.Clerk.session?.getToken();
    if (version !== giftState.version || previewVersion !== state.previewVersion || !authorized) return;
    const response = await fetch(asset.url, {
      headers: { Authorization: "Bearer " + token },
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok)
      throw Object.assign(new Error("Unable to load preview asset."), {
        status: response.status,
      });
    const blob = await response.blob();
    if (
      version !== giftState.version ||
      previewVersion !== state.previewVersion ||
      !authorized
    )
      return;
    const url = URL.createObjectURL(blob);
    if (asset.kind === "thumbnail") giftState.artworkUrl = url;
    else state.urls.push(url);
    if (asset.kind === "sound") {
      const audio = new Audio(url);
      state.previewMedia = audio;
      audio.controls = true;
      screen.append(audio);
      feedback.textContent = "Sound preview.";
      audio.play().catch(() => { if (version === giftState.version) feedback.textContent = "Press Play to preview sound."; });
      return;
    }
    const form = document.getElementById("gift-draft-form"),
      data = new FormData(form),
      preset = data.get("preset"),
      scale = Number(data.get("scale")),
      x = Number(data.get("x")),
      y = Number(data.get("y"));
    const position = (node) => {
      node.className =
        "gift-preview-art " +
        (preset === "fullscreen" ? "fullscreen" : "contained");
      node.style.transform = `translate(${x * screen.clientWidth}px,${y * screen.clientHeight}px) scale(${scale})`;
    };
    if (asset.kind === "thumbnail") {
      const img = new Image();
      img.src = url;
      img.alt = "Gift artwork preview";
      position(img);
      screen.append(img);
      feedback.textContent = "Artwork preview with current framing.";
      return;
    }
    if (asset.format === "svga") {
      const SVGA = await loadGiftSvga();
      if (version !== giftState.version || previewVersion !== state.previewVersion || !authorized) return;
      const canvas = document.createElement("canvas");
      canvas.width = asset.width || 720;
      canvas.height = asset.height || 1280;
      canvas.setAttribute("aria-label", "Animated gift preview");
      position(canvas);
      screen.append(canvas);
      const player = new SVGA.Player(canvas);
      state.svga = player;
      player.loops = 0;
      player.clearsAfterStop = false;
      player.setContentMode("AspectFit");
      const item = await new Promise((resolve, reject) => new SVGA.Parser().load(url, resolve, reject));
      if (version !== giftState.version || previewVersion !== state.previewVersion || !authorized) { player.stopAnimation(true); return; }
      player.setVideoItem(item);
      const controls = document.createElement("button");
      controls.type = "button";
      controls.className = "page-button";
      controls.textContent = "Pause preview";
      controls.onclick = () => {
        if (controls.textContent === "Pause preview") { player.pauseAnimation(); controls.textContent = "Play preview"; }
        else { player.startAnimation(); controls.textContent = "Pause preview"; }
      };
      screen.append(controls);
      player.startAnimation();
      feedback.textContent = "SVGA animation preview (silent). Check native playback separately.";
      return;
    }
    const media = document.createElement(
      asset.kind === "sound" ? "audio" : "video",
    );
    state.previewMedia = media;
    media.src = url;
    media.controls = true;
    media.loop = false;
    media.playsInline = true;
    const customSound =
      asset.kind === "animation" ? giftAsset(data.get("soundAssetId")) : null;
    if (customSound) {
      const soundResponse = await fetch(customSound.url, {
        headers: { Authorization: "Bearer " + token },
        credentials: "omit",
        cache: "no-store",
      });
      if (!soundResponse.ok)
        throw Object.assign(new Error("Unable to load selected sound."), {
          status: soundResponse.status,
        });
      const soundBlob = await soundResponse.blob();
      if (
        version !== giftState.version ||
        previewVersion !== state.previewVersion ||
        !authorized
      )
        return;
      const soundUrl = URL.createObjectURL(soundBlob);
      state.urls.push(soundUrl);
      const audio = new Audio(soundUrl);
      audio.muted = true;
      state.previewAudio = audio;
      media.muted = true;
      media.addEventListener("play", () => {
        audio.currentTime = media.currentTime;
        audio.play().catch(() => {
          feedback.textContent =
            "Selected sound could not play in this browser.";
        });
      });
      media.addEventListener("pause", () => audio.pause());
      media.addEventListener("ended", () => audio.pause());
      media.addEventListener("volumechange", () => { audio.muted = media.muted; });
    }
    media.addEventListener("error", () => {
      if (version === giftState.version && previewVersion === state.previewVersion)
        feedback.textContent =
          "This browser could not decode the asset. Check native playback separately.";
    });
    if (asset.format === "packed-alpha-mp4") {
      const canvas = document.createElement("canvas"),
        work = document.createElement("canvas");
      position(canvas);
      screen.append(canvas);
      media.controls = false;
      const ctx = canvas.getContext("2d"),
        wctx = work.getContext("2d", { willReadFrequently: true });
      const draw = () => {
        if (version !== giftState.version || media !== state.previewMedia)
          return;
        if (media.readyState >= 2) {
          const w = media.videoWidth / 2,
            h = media.videoHeight;
          canvas.width = w;
          canvas.height = h;
          work.width = w;
          work.height = h;
          ctx.drawImage(media, w, 0, w, h, 0, 0, w, h);
          wctx.drawImage(media, 0, 0, w, h, 0, 0, w, h);
          const color = ctx.getImageData(0, 0, w, h),
            mask = wctx.getImageData(0, 0, w, h);
          for (let i = 3; i < color.data.length; i += 4)
            color.data[i] = mask.data[i - 3];
          ctx.putImageData(color, 0, 0);
        }
        if (!media.ended) state.previewFrame = requestAnimationFrame(draw);
      };
      media.addEventListener("play", draw);
      const controls = document.createElement("button");
      controls.type = "button";
      controls.className = "page-button";
      controls.textContent = "Play packed-alpha preview";
      controls.onclick = () => {
        if (media.ended) media.currentTime = 0;
        media.muted = Boolean(customSound);
        if (state.previewAudio) state.previewAudio.muted = false;
        media.play().catch(() => {
          feedback.textContent = "Browser playback failed.";
        });
      };
      screen.append(controls);
      media.muted = true;
      media.play().catch(() => {});
      feedback.textContent =
        "Packed alpha preview: left mask / right color. Native AlphaPlayer rendering still requires iPhone verification.";
    } else {
      position(media);
      screen.append(media);
      media.muted = true;
      media.play().catch(() => {});
      feedback.textContent =
        asset.kind === "sound"
          ? "Play to preview sound."
          : "Play to preview Android WebM. Browser transparency is separate from device verification.";
    }
  } catch (error) {
    if (version === giftState.version && previewVersion === state.previewVersion && !accessError(error))
      feedback.textContent = error.message;
  }
}
async function loadGifts() {
  const version = ++giftState.version;
  stopGiftPreview();
  clearGiftCardArtwork();
  document.getElementById("gift-editor-modal")?.close();
  closeGiftCollectionEditor();
  giftState.data = null;
  document.getElementById("gift-workspace")?.replaceChildren();
  const status = document.getElementById("gift-status");
  if (status) status.textContent = "Loading gifts…";
  try {
    await api("/gifts/assets/import-existing", { method: "POST" });
    if (version !== giftState.version || !authorized || section !== "Gifts") return;
    const data = await api("/gifts");
    if (version !== giftState.version || !authorized || section !== "Gifts")
      return;
    giftState.data = data;
    if (!data.collections.some((c) => c.id === giftState.collection))
      giftState.collection = data.collections[0]?.id;
    document.getElementById("gift-status").textContent = "";
    renderGifts();
  } catch (error) {
    if (version === giftState.version && !accessError(error))
      document.getElementById("gift-status").textContent =
        `${error.message} Use Refresh gifts to retry.`;
  }
}
const giftRevision = (g) =>
  giftState.data.revisions.find(
    (r) => r.id === (g.draftRevisionId || g.currentRevisionId),
  );
const giftAsset = (id) => giftState.data.assets.find((a) => a.id === id);
function renderGifts() {
  stopGiftPreview();
  clearGiftCardArtwork();
  document.getElementById("gift-editor-modal")?.close();
  closeGiftCollectionEditor();
  const d = giftState.data;
  const collections = [...d.collections].sort((a,b) => a.sortOrder-b.sortOrder);
  const c = collections.find(collection => collection.id === giftState.collection);
  const gifts = d.gifts.filter(gift => gift.collectionId === c?.id).sort((a,b) => (giftRevision(a)?.coinCost ?? 0)-(giftRevision(b)?.coinCost ?? 0) || a.id.localeCompare(b.id));
  document.getElementById("gift-workspace").innerHTML =
    '<div class="gift-collections">' + collections.map(collection => '<button class="page-button ' + (collection.id === giftState.collection ? "selected" : "") + '" data-gift-collection="' + esc(collection.id) + '" aria-pressed="' + (collection.id === giftState.collection) + '" ' + (!collection.locked ? 'draggable="true" title="Drag to reorder; Alt + Left/Right also works"' : 'draggable="false"') + '>' + (!collection.locked ? '<span class="gift-collection-drag-handle" aria-hidden="true">⠿</span> ' : "") + esc(collection.name) + (collection.locked ? " · Default" : "") + '</button>').join("") +
    '<button class="page-button" id="gift-new-collection">+ Add collection</button></div><div class="gift-list-heading"><span id="gift-collection-summary">Gifts: ' + gifts.length + ' · Status: ' + esc(c ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : "—") + '</span><div class="gift-actions">' + (c && !c.locked ? '<button class="page-button" id="gift-manage-collection">Manage collection</button>' : "") + '<button class="primary-button" id="gift-new">Add gift</button></div></div>' +
    '<div class="gift-grid">' + (gifts.map(g => {
      const revision = giftRevision(g);
      return '<article class="gift-card"><button class="gift-card-open" data-gift-open="' + esc(g.id) + '"><span class="gift-art-placeholder" ' + (revision?.thumbnailAssetId ? 'data-card-artwork="' + esc(revision.thumbnailAssetId) + '"' : "") + '>' + (revision?.thumbnailAssetId ? '<small>Loading artwork…</small>' : g.legacy ? esc(revision?.emoji || "") : '<small>No artwork</small>') + '</span><strong>' + esc(revision?.name || g.id) + '</strong><span>' + giftCoin + ' ' + esc(revision?.coinCost?.toLocaleString() || "—") + '</span><small>' + esc(g.status) + (g.draftRevisionId ? " · Draft changes" : "") + '</small></button></article>';
    }).join("") || '<p>No gifts yet. Add a gift to begin.</p>') + '</div><div id="gift-editor"></div><div id="gift-collection-editor-slot"></div>';
  if (giftState.selected) renderGiftEditor();
  loadGiftCardArtwork();
}
function closeGiftCollectionEditor() {
  const modal = document.getElementById("gift-collection-modal");
  modal?.close();
  modal?.remove();
}
function giftStableId(value) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").replace(/^[^a-z]+/,"").slice(0,64);
}
function renderGiftCollectionEditor(create) {
  closeGiftCollectionEditor();
  const collection = giftState.data.collections.find(c => c.id === giftState.collection);
  if (!create && (!collection || collection.locked)) return;
  document.getElementById("gift-collection-editor-slot").innerHTML = '<dialog id="gift-collection-modal" class="gift-modal" aria-labelledby="gift-collection-title"><header class="gift-modal-header"><h2 id="gift-collection-title">' + (create ? "Add collection" : "Manage collection") + '</h2><button class="page-button" id="gift-collection-close" aria-label="Close collection editor">✕</button></header><form id="' + (create ? "gift-add-collection" : "gift-collection-editor") + '" class="gift-draft"><label>Name<input name="name" maxlength="80" required autofocus value="' + esc(create ? "" : collection.name) + '"></label>' +
    (create ? '<details class="gift-options"><summary>Collection identifier</summary><label>Stable collection ID<input name="id" pattern="[a-z][a-z0-9_-]*" maxlength="64" required></label></details>' : '<label>Publication<select name="status">' + ["draft","published","archived"].map(status => '<option value="' + status + '" ' + (status === collection.status ? "selected" : "") + '>' + status + '</option>').join("") + '</select></label><details class="gift-options"><summary>Archive</summary><button type="button" class="page-button" id="gift-archive-collection">Archive collection</button></details>') +
    '<p id="gift-collection-feedback" role="status"></p><footer class="gift-actions gift-modal-actions"><button type="button" class="page-button" id="gift-collection-cancel">Cancel</button><button class="primary-button" type="submit">' + (create ? "Add collection" : "Save collection") + '</button></footer></form></dialog>';
  const modal = document.getElementById("gift-collection-modal"), form = modal.querySelector("form");
  modal.addEventListener("cancel", event => { event.preventDefault(); if (!giftState.busy) closeGiftCollectionEditor(); });
  form.addEventListener("invalid", event => event.target.closest("details")?.setAttribute("open",""), true);
  if (create) {
    form.elements.name.addEventListener("input", () => { if (!form.elements.id.dataset.manual) form.elements.id.value = giftStableId(form.elements.name.value); });
    form.elements.id.addEventListener("input", () => { form.elements.id.dataset.manual = "true"; });
  }
  modal.showModal();
}
function clearGiftCardArtwork() {
  giftState.cardVersion = (giftState.cardVersion || 0) + 1;
  giftState.cardUrls.forEach(url => URL.revokeObjectURL(url));
  giftState.cardUrls = [];
}
function bindCollectionDragEvents() {
  let dragged = null, touch = null;
  const allowed = id => authorized && section === "Gifts" && !giftState.busy && giftState.data?.collections.some(collection => collection.id === id && !collection.locked);
  const clear = () => {
    main.querySelectorAll(".gift-collection-dragging, .gift-collection-drop-target").forEach(button => button.classList.remove("gift-collection-dragging", "gift-collection-drop-target"));
    dragged = null;
    touch = null;
  };
  const reorder = async (id, targetId, after) => {
    if (!allowed(id) || !allowed(targetId) || id === targetId) return;
    const ordered = [...giftState.data.collections].sort((a,b) => a.sortOrder-b.sortOrder);
    const moved = ordered.find(collection => collection.id === id);
    const remaining = ordered.filter(collection => collection.id !== id);
    const index = remaining.findIndex(collection => collection.id === targetId) + (after ? 1 : 0);
    remaining.splice(index, 0, moved);
    if (remaining.map(collection => collection.id).join(",") === ordered.map(collection => collection.id).join(",")) return;
    const result = await giftMutation("/collections/reorder", {ids:remaining.map(collection => collection.id)});
    if (result && authorized && section === "Gifts") Array.from(main.querySelectorAll("[data-gift-collection]")).find(button => button.dataset.giftCollection === id)?.focus();
    return result;
  };
  const targetAt = (x,y) => document.elementFromPoint(x,y)?.closest("[data-gift-collection]");
  const highlight = button => {
    main.querySelectorAll(".gift-collection-drop-target").forEach(node => node.classList.remove("gift-collection-drop-target"));
    if (button && allowed(button.dataset.giftCollection) && button.dataset.giftCollection !== dragged) button.classList.add("gift-collection-drop-target");
  };
  main.addEventListener("dragstart", event => {
    const button = event.target.closest("[data-gift-collection]");
    if (!button || !allowed(button.dataset.giftCollection)) { if (button) event.preventDefault(); return; }
    dragged = button.dataset.giftCollection;
    button.classList.add("gift-collection-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dragged);
  });
  main.addEventListener("dragover", event => {
    const button = event.target.closest("[data-gift-collection]");
    if (!dragged || !button || !allowed(button.dataset.giftCollection)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    highlight(button);
  });
  main.addEventListener("drop", event => {
    const button = event.target.closest("[data-gift-collection]");
    if (!dragged || !button) return clear();
    event.preventDefault();
    const id = dragged, target = button.dataset.giftCollection, after = event.clientX > button.getBoundingClientRect().left + button.offsetWidth/2;
    clear();
    reorder(id,target,after);
  });
  main.addEventListener("dragend", clear);
  main.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" || !event.target.closest(".gift-collection-drag-handle")) return;
    const button = event.target.closest("[data-gift-collection]");
    if (!button || !allowed(button.dataset.giftCollection)) return;
    event.preventDefault();
    dragged = button.dataset.giftCollection;
    touch = {id:event.pointerId,x:event.clientX,y:event.clientY,moved:false,button};
    event.target.setPointerCapture(event.pointerId);
  });
  main.addEventListener("pointermove", event => {
    if (!touch || touch.id !== event.pointerId) return;
    event.preventDefault();
    touch.moved ||= Math.hypot(event.clientX-touch.x,event.clientY-touch.y)>8;
    if (touch.moved) { touch.button.classList.add("gift-collection-dragging"); highlight(targetAt(event.clientX,event.clientY)); }
  });
  main.addEventListener("pointerup", event => {
    if (!touch || touch.id !== event.pointerId) return;
    event.preventDefault();
    const id = dragged, moved = touch.moved, button = targetAt(event.clientX,event.clientY);
    clear();
    if (moved && button) reorder(id,button.dataset.giftCollection,event.clientX>button.getBoundingClientRect().left+button.offsetWidth/2);
  });
  main.addEventListener("pointercancel", event => { if (touch?.id === event.pointerId) clear(); });
  main.addEventListener("keydown", event => {
    const button = event.target.closest("[data-gift-collection]");
    if (!button || !event.altKey || !["ArrowLeft","ArrowRight"].includes(event.key) || !allowed(button.dataset.giftCollection)) return;
    event.preventDefault();
    const list = [...giftState.data.collections].sort((a,b) => a.sortOrder-b.sortOrder);
    const index = list.findIndex(collection => collection.id === button.dataset.giftCollection), next = index + (event.key === "ArrowLeft" ? -1 : 1);
    if (next < 1 || next >= list.length) return;
    reorder(button.dataset.giftCollection,list[next].id,event.key === "ArrowRight");
  });
}
async function loadGiftCardArtwork() {
  const version = giftState.cardVersion;
  const cards = Array.from(main.querySelectorAll("[data-card-artwork]"));
  if (!cards.length) return;
  try {
    const token = await window.Clerk.session?.getToken();
    if (!token || version !== giftState.cardVersion || !authorized || section !== "Gifts") return;
    const queue = [...cards];
    await Promise.all(Array.from({length: Math.min(4, queue.length)}, async () => {
      while (queue.length && version === giftState.cardVersion && authorized && section === "Gifts") {
        const card = queue.shift(), asset = giftAsset(card.dataset.cardArtwork);
        if (!asset || asset.kind !== "thumbnail" || !/^\/api\/gift-catalog\/assets\/[a-zA-Z0-9_-]+$/.test(asset.url)) {
          card.textContent = "Artwork unavailable";
          continue;
        }
        try {
          const response = await fetch(asset.url, {headers:{Authorization:"Bearer " + token},credentials:"omit",cache:"no-store"});
          if (!response.ok) throw Object.assign(new Error("Artwork unavailable"), {status:response.status});
          const blob = await response.blob();
          if (version !== giftState.cardVersion || !card.isConnected || !authorized || section !== "Gifts") continue;
          const url = URL.createObjectURL(blob);
          giftState.cardUrls.push(url);
          const image = new Image();
          image.src = url;
          image.alt = card.closest("button").querySelector("strong").textContent + " artwork";
          image.onerror = () => { if (card.isConnected) card.textContent = "Artwork unavailable"; };
          card.replaceChildren(image);
        } catch (error) {
          if (version === giftState.cardVersion && card.isConnected && !accessError(error)) card.textContent = "Artwork unavailable";
        }
      }
    }));
  } catch (error) { if (version === giftState.cardVersion) accessError(error); }
}
function closeGiftEditor() {
  const modal = document.getElementById("gift-editor-modal");
  const selected = giftState.selected;
  giftState.version++;
  giftState.selected = null;
  giftState.busy = false;
  stopGiftPreview();
  modal?.close();
  modal?.remove();
  const trigger = selected === "__new__" ? document.getElementById("gift-new") : Array.from(main.querySelectorAll("[data-gift-open]")).find(button => button.dataset.giftOpen === selected);
  trigger?.focus();
}
function giftAssetControl(label, field, kind, formats, selected) {
  const asset = giftAsset(selected);
  const accept = formats.map(format => "." + ({"webm-alpha":"webm","packed-alpha-mp4":"mp4",jpeg:"jpg"}[format] || format)).join(",") + (formats.includes("jpeg") ? ",.jpeg" : "");
  const current = asset ? (asset.fileName || asset.label || "Original filename not recorded · " + asset.format.toUpperCase()) : (kind === "sound" ? "No custom sound attached" : "No file attached");
  return '<fieldset class="gift-asset-field"><legend>' + esc(label) + '</legend><input type="hidden" name="' + field + '" value="' + esc(selected || "") + '"><span class="gift-current-file" data-current-file="' + field + '">' + esc(current) + '</span><label>' + (selected ? "Replace file" : "Choose file") + '<input type="file" data-gift-upload="' + field + '" data-kind="' + kind + '" data-formats="' + formats.join(",") + '" accept="' + accept + '"></label><small>' + (kind === "thumbnail" ? "PNG, JPG or WebP" : kind === "sound" ? "Optional MP3 or AAC" : field === "androidAssetId" ? "Transparent WebM or SVGA" : "AlphaPlayer MP4 or SVGA") + '</small><button type="button" class="page-button" data-gift-preview="' + field + '">Preview ' + esc(label.toLowerCase()) + '</button>' + '<small data-upload-feedback="' + field + '" role="status"></small></fieldset>';
}
function giftAnimationControl(label, field, formats, selected) {
  return '<div class="gift-platform-preview">' + giftAssetControl(label, field, "animation", formats, selected) + '<div class="gift-preview-screen" id="gift-' + field + '-preview" aria-label="' + esc(label) + ' preview"><span>No animation attached</span></div><p id="gift-' + field + '-feedback" role="status"></p></div>';
}
function previewGiftSelections(form) {
  if (form.elements.thumbnailAssetId.value) previewGiftAsset("thumbnailAssetId");
  if (form.elements.type.value === "animation") {
    for (const field of ["androidAssetId", "iosAssetId"]) {
      if (form.elements[field].value) previewGiftAsset(field);
    }
  }
}
function renderGiftEditor() {
  stopGiftPreview();
  document.getElementById("gift-editor-modal")?.close();
  const g = giftState.data.gifts.find(gift => gift.id === giftState.selected);
  const r = g ? giftRevision(g) : {};
  const f = r?.framing || {preset:"contained",scale:1,x:0,y:0};
  const type = r?.type || (r?.androidAssetId || r?.iosAssetId || ["kisses","luxury_rocket","dragon"].includes(g?.id) ? "animation" : "image");
  document.getElementById("gift-editor").innerHTML = '<dialog id="gift-editor-modal" class="gift-modal" aria-labelledby="gift-modal-title"><header class="gift-modal-header"><h2 id="gift-modal-title">' + (g ? "Edit gift" : "Add gift") + '</h2><button type="button" class="page-button" id="gift-editor-close" aria-label="Close gift editor">✕</button></header><form id="gift-draft-form" class="gift-draft">' +
    '<fieldset class="gift-type-controls"><legend>Gift type</legend><label class="gift-type-choice"><input type="radio" name="type" value="image" ' + (type === "image" ? "checked autofocus" : "") + '><span>▧ Image</span></label><label class="gift-type-choice"><input type="radio" name="type" value="animation" ' + (type === "animation" ? "checked autofocus" : "") + '><span>▷ Animation</span></label></fieldset>' +
    '<div class="gift-artwork-section">' + giftAssetControl("Artwork", "thumbnailAssetId", "thumbnail", ["png","jpeg","webp"], r?.thumbnailAssetId) + '<div class="gift-artwork-preview"><div class="gift-preview-screen" id="gift-preview-screen"><span>' + (r?.thumbnailAssetId ? "Loading artwork…" : "No artwork attached") + '</span></div><p id="gift-preview-feedback" role="status"></p></div></div>' +
    '<div id="gift-animation-controls" class="gift-animation-controls">' + giftAnimationControl("Android animation", "androidAssetId", ["svga","webm-alpha"], r?.androidAssetId) + giftAnimationControl("iPhone animation", "iosAssetId", ["svga","packed-alpha-mp4"], r?.iosAssetId) + '</div>' +
    '<fieldset class="gift-details-fields"><legend>Details</legend><label>Name<input name="name" value="' + esc(r?.name) + '" maxlength="100" required></label><label class="gift-price-field"><span>Coin price</span><div class="gift-price-input">' + giftCoin + '<input name="coinCost" type="number" min="1" max="100000000" step="1" required value="' + esc(r?.coinCost || 1) + '"></div></label></fieldset>' +
    '<fieldset class="gift-sound-controls"><legend>Sound</legend><div class="gift-sound-choices"><label><input type="radio" name="soundChoice" value="default">Default gift sound</label><label id="gift-original-sound-choice"><input type="radio" name="soundChoice" value="original">Original animation audio</label><label><input type="radio" name="soundChoice" value="custom">Custom sound</label></div><div id="gift-custom-sound">' + giftAssetControl("Custom sound file", "soundAssetId", "sound", ["mp3","aac"], r?.soundAssetId) + '</div><button type="button" class="page-button" id="gift-default-sound-preview" data-gift-preview="soundAssetId">Preview default sound</button><p id="gift-sound-hint"></p><div id="gift-sound-preview"></div><p id="gift-sound-preview-feedback" role="status"></p></fieldset>' +
    '<details class="gift-options" id="gift-advanced-options"><summary>Size, position &amp; identifier</summary><fieldset><legend>Playback position</legend><label>Preset<select name="preset"><option value="contained" ' + (f.preset === "contained" ? "selected" : "") + '>Contained</option><option value="fullscreen" ' + (f.preset === "fullscreen" ? "selected" : "") + '>Full screen</option></select></label><label>Scale<input name="scale" type="number" min="0.25" max="3" step="0.01" value="' + esc(f.scale) + '" required></label><label>Horizontal offset<input name="x" type="number" min="-1" max="1" step="0.01" value="' + esc(f.x) + '" required></label><label>Vertical offset<input name="y" type="number" min="-1" max="1" step="0.01" value="' + esc(f.y) + '" required></label></fieldset><label>Stable gift ID<input name="id" value="' + esc(g?.id) + '" pattern="[a-z][a-z0-9_-]*" maxlength="64" required ' + (g ? "readonly" : "") + '></label></details>' +
    (g ? '<details class="gift-options"><summary>Manage gift</summary><div class="gift-actions"><button type="button" class="page-button" id="gift-history">Revision history</button><button type="button" class="page-button" id="gift-archive">Archive gift</button>' + '</div><div id="gift-history-records"></div></details>' : "") +
    '<fieldset class="gift-publication-status"><legend>Status</legend><label class="gift-type-choice"><input type="radio" name="status" value="draft" ' + (g?.status !== "published" ? "checked" : "") + ' required><span>Draft</span></label><label class="gift-type-choice"><input type="radio" name="status" value="published" ' + (g?.status === "published" ? "checked" : "") + ' required><span>Published</span></label></fieldset><small>Published makes this gift available in its published collection. Draft hides it from the app. Previous sent gifts stay unchanged.</small><p id="gift-editor-feedback" role="status"></p><footer class="gift-actions gift-modal-actions"><button type="button" class="page-button" id="gift-editor-cancel">Cancel</button><button class="primary-button" type="submit">Save</button></footer></form></dialog>';
  const modal = document.getElementById("gift-editor-modal");
  modal.addEventListener("cancel", event => { event.preventDefault(); if (!giftState.busy) closeGiftEditor(); });
  const form = document.getElementById("gift-draft-form");
  const savedSound = giftAsset(r?.soundAssetId);
  form.elements.soundChoice.value = savedSound?.isDefaultSound ? "default" : r?.soundAssetId ? "custom" : type === "image" ? "default" : "original";
  form.elements.soundAssetId.dataset.customSoundId = savedSound && !savedSound.isDefaultSound ? savedSound.id : "";
  form.addEventListener("invalid", event => { event.target.closest("details")?.setAttribute("open", ""); }, true);
  if (!g) form.elements.name.addEventListener("input", () => {
    if (!form.elements.id.dataset.manual) form.elements.id.value = giftStableId(form.elements.name.value);
  });
  form.elements.id.addEventListener("input", () => { form.elements.id.dataset.manual = "true"; });
  updateGiftType(form);
  modal.showModal();
  previewGiftSelections(form);
}
function updateGiftType(form) {
  const image = form.elements.type.value === "image";
  const animations = document.getElementById("gift-animation-controls");
  animations.hidden = image;
  animations.querySelectorAll("input, select, button").forEach(control => { control.disabled = image; });
  document.getElementById("gift-editor-modal").dataset.giftType = image ? "image" : "animation";
  const original = document.getElementById("gift-original-sound-choice");
  original.hidden = image;
  original.querySelector("input").disabled = image;
  if (image && form.elements.soundChoice.value === "original") form.elements.soundChoice.value = "default";
  updateGiftSound(form);
}
function updateGiftSound(form) {
  const mode = form.elements.soundChoice.value;
  const defaultAsset = giftState.data.assets.find(asset => asset.isDefaultSound);
  const reference = form.elements.soundAssetId;
  reference.value = mode === "default" ? defaultAsset?.id || "" : mode === "original" ? "" : reference.dataset.customSoundId || "";
  document.getElementById("gift-custom-sound").hidden = mode !== "custom";
  document.getElementById("gift-default-sound-preview").hidden = mode !== "default";
  document.getElementById("gift-sound-hint").textContent = mode === "default" ? "Uses the standard gift chime." : mode === "original" ? "Uses audio embedded in the animation file, if present." : "Upload an MP3 or AAC to replace the gift's other audio.";
  const custom = giftAsset(reference.dataset.customSoundId);
  main.querySelector('[data-current-file="soundAssetId"]').textContent = custom?.fileName || custom?.label || "No custom sound attached";
}
async function giftMutation(path, body, method = "POST") {
  if (giftState.busy || !authorized || section !== "Gifts") return;
  const version = giftState.version;
  giftState.busy = true;
  const buttons = Array.from(main.querySelectorAll(".gift-panel button")).map(
    (b) => [b, b.disabled],
  );
  buttons.forEach(([b]) => (b.disabled = true));
  try {
    const result = await api("/gifts" + path, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (version !== giftState.version || !authorized) return;
    await loadGifts();
    return result;
  } catch (error) {
    if (version === giftState.version && !accessError(error))
      (document.getElementById("gift-editor-feedback") || document.getElementById("gift-collection-feedback") || document.getElementById("gift-status")).textContent =
        error.status === 409
          ? "This catalog changed. Refresh gifts before saving again."
          : error.message;
  } finally {
    if (version === giftState.version) giftState.busy = false;
    else if (authorized && section === "Gifts") giftState.busy = false;
    buttons.forEach(([b, disabled]) => {
      if (b.isConnected) b.disabled = disabled;
    });
  }
}
function bindGiftSubmit() {
  main.addEventListener("submit", async (event) => {
    if (section !== "Gifts" || !authorized) return;
    const form = event.target,
      formId = form.getAttribute("id");
    if (
      ![
        "gift-add-collection",
        "gift-collection-editor",
        "gift-draft-form",
      ].includes(formId)
    )
      return;
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    if (formId === "gift-add-collection") {
      const result = await giftMutation("/collections", values);
      if (result && authorized && section === "Gifts") {
        giftState.collection = values.id;
        giftState.selected = null;
        renderGifts();
      }
      return;
    }
    if (formId === "gift-collection-editor")
      return giftMutation(
        "/collections/" + encodeURIComponent(giftState.collection),
        { name: values.name, status: values.status },
        "PATCH",
      );
    const g = giftState.data.gifts.find((g) => g.id === giftState.selected);
    if (["default", "custom"].includes(values.soundChoice) && !values.soundAssetId) {
      document.getElementById("gift-editor-feedback").textContent = values.soundChoice === "custom" ? "Upload a custom sound, or choose Default gift sound." : "Default sound is unavailable. Refresh gifts and retry.";
      return;
    }
    const body = {
      id: values.id,
      status: values.status,
      type: values.type,
      collectionId: g?.collectionId || giftState.collection,
      name: values.name,
      emoji: g ? giftRevision(g)?.emoji || "" : "",
      coinCost: Number(values.coinCost),
      thumbnailAssetId: values.thumbnailAssetId || null,
      androidAssetId: values.type === "animation" ? values.androidAssetId || null : null,
      iosAssetId: values.type === "animation" ? values.iosAssetId || null : null,
      soundAssetId: values.soundAssetId || null,
      framing: {
        preset: values.preset,
        scale: Number(values.scale),
        x: Number(values.x),
        y: Number(values.y),
      },
    };
    if (g) delete body.id;
    const result = await giftMutation(
      g ? "/gifts/" + encodeURIComponent(g.id) : "/gifts",
      body,
      g ? "PATCH" : "POST",
    );
    if (result && section === "Gifts" && authorized) {
      giftState.selected = g?.id || result.id || body.id;
      renderGifts();
    }
  });
}
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const main = document.getElementById("main"),
  dialog = document.getElementById("details");
bindGiftEvents();
bindGiftSubmit();
let section = "Overview",
  authorized = false,
  sessionId = null,
  users = [],
  cursor = null,
  nextCursor = null,
  history = [],
  requestVersion = 0,
  overviewVersion = 0,
  detailVersion = 0,
  query = "",
  filter = "all",
  searchTimer,
  signInElement = null,
  reviewFilter = "all",
  reviewCursor = null,
  reviewHistory = [],
  reviewNext = null,
  removalFilter = "pending",
  removalCursor = null,
  removalHistory = [],
  removalNext = null,
  config;
let catalogVersion = 0,
  catalog = null,
  catalogProviderId = null,
  catalogImport = null,
  catalogPreviewed = false;
const payoutDesk = {
  version: 0,
  detailVersion: 0,
  records: [],
  detail: null,
  query: "",
  filter: "all",
  settings: null,
  enrollment: null,
  mutationVersion: 0,
};
const operatorCredentials = {
  version: 0,
  busy: false,
  records: [],
  token: null,
};
const operations = {
  "Live streams": {
    endpoint: "live-streams",
    filter: "all",
    status: "pending",
    cursor: null,
    history: [],
    next: null,
  },
  Moderation: {
    endpoint: "moderation",
    filter: "stream",
    status: "pending",
    cursor: null,
    history: [],
    next: null,
  },
};
const nav = document.querySelector("nav");
nav.innerHTML = Object.keys(icons)
  .map(
    (name) =>
      `<a href="#${name.toLowerCase().replaceAll(" ", "-")}" data-nav="${name}">${icon(name)}<span>${name}</span></a>`,
  )
  .join("");
const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0] || "")
    .join("")
    .toUpperCase() || "?";
const date = (value) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
function country(code) {
  try {
    return code
      ? new Intl.DisplayNames(["en"], { type: "region" }).of(code)
      : "Unknown";
  } catch {
    return "Unknown";
  }
}
function badge(v) {
  const pending = [
    "pending",
    "in_progress",
    "review_needed",
    "id_required",
  ].includes(v.status);
  const status = v.isVerified ? "Verified" : pending ? "Pending" : "Unverified";
  return `<span class="status ${status.toLowerCase()}"><i></i>${status}</span>`;
}
function unmountSignIn() {
  if (signInElement) {
    window.Clerk?.unmountSignIn?.(signInElement);
    signInElement = null;
  }
}
function clearPrivate() {
  resetGifts();
  unmountSignIn();
  authorized = false;
  resetPayoutDesk();
  resetOperatorCredentials();
  catalogVersion++;
  catalog = null;
  catalogImport = null;
  catalogPreviewed = false;
  Object.values(operations).forEach((s) => {
    s.cursor = null;
    s.history = [];
    s.next = null;
  });
  users = [];
  enablingWithdrawals.clear();
  removalCursor = null;
  removalHistory = [];
  removalNext = null;
  reviewCursor = null;
  reviewHistory = [];
  reviewNext = null;
  requestVersion++;
  overviewVersion++;
  detailVersion++;
  clearTimeout(searchTimer);
  cursor = null;
  nextCursor = null;
  history = [];
  dialog.close();
  document.getElementById("detail-content").replaceChildren();
  main.replaceChildren();
}
function notice(title, text, retry = false) {
  unmountSignIn();
  main.innerHTML = `<section class="panel coming-soon"><span class="empty-icon">${icon("Verification")}</span><h1>${esc(title)}</h1><p>${esc(text)}</p>${retry ? '<button class="primary-button" id="retry-access">Try again</button>' : ""}</section>`;
}
async function api(path, options = {}) {
  const activeSession = window.Clerk?.session?.id;
  const token = await window.Clerk?.session?.getToken();
  if (!token)
    throw Object.assign(new Error("Please sign in again."), { status: 401 });
  if (activeSession !== window.Clerk?.session?.id)
    throw Object.assign(new Error("Session changed. Please retry."), {
      status: 401,
    });
  const r = await fetch("/api/admin-data" + path, {
    ...options,
    headers: {
      Authorization: "Bearer " + token,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    credentials: "omit",
    cache: "no-store",
  });
  const body = await r.json();
  if (!r.ok)
    throw Object.assign(new Error(body.error || "Unable to load data."), {
      status: r.status,
    });
  return body;
}
function accessError(error) {
  if (error.status === 401 || error.status === 403) {
    clearPrivate();
    notice(
      error.status === 403 ? "Admin access required" : "Session expired",
      error.message,
      true,
    );
    return true;
  }
  return false;
}
const enablingWithdrawals = new Map();
function withdrawalAccess(u) {
  return `<div class="withdrawal-access">${u.withdrawalsEnabled ? '<span class="status verified">Enabled</span>' : `<button class="page-button" data-enable-withdrawals="${esc(u.uid)}" ${enablingWithdrawals.has(String(u.uid)) ? "disabled" : ""}>Enable withdrawals</button>`}<span class="user-withdrawal-feedback" role="status"></span></div>`;
}
async function enableUserWithdrawals(uid, button) {
  if (!authorized || enablingWithdrawals.has(uid)) return;
  const version = requestVersion,
    activeSession = sessionId;
  const feedback = button
    .closest(".withdrawal-access")
    .querySelector(".user-withdrawal-feedback");
  const current = () =>
    authorized &&
    sessionId === activeSession &&
    window.Clerk?.session?.id === activeSession &&
    requestVersion === version &&
    button.isConnected;
  const attempt = {};
  enablingWithdrawals.set(uid, attempt);
  button.disabled = true;
  feedback.textContent = "Enabling…";
  try {
    const preview = await api(
      "/withdrawals/enrollment-preview?" + new URLSearchParams({ userId: uid }),
    );
    if (!current()) return;
    if (!preview.alreadyEnrolled) {
      await api("/withdrawals/enroll", {
        method: "POST",
        body: JSON.stringify({
          userId: Number(uid),
          expectedWalletCoins: preview.walletCoins,
          reason: "Enabled from the user directory.",
        }),
      });
    }
    if (!current()) return;
    const user = users.find((u) => String(u.uid) === uid);
    if (user) user.withdrawalsEnabled = true;
    document
      .querySelectorAll(`[data-enable-withdrawals="${uid}"]`)
      .forEach((control) => {
        control
          .closest(".withdrawal-access")
          .querySelector(".user-withdrawal-feedback").textContent = "";
        control.outerHTML = '<span class="status verified">Enabled</span>';
      });
  } catch (error) {
    if (!current() || accessError(error)) return;
    feedback.textContent =
      error.status === 409
        ? "The account changed. Click again to refresh and retry."
        : error.message;
  } finally {
    if (enablingWithdrawals.get(uid) === attempt)
      enablingWithdrawals.delete(uid);
    if (current()) button.disabled = false;
  }
}
function rows() {
  return (
    users
      .map(
        (u) =>
          `<tr><td><button class="user-button" data-user="${u.uid}"><span class="avatar rose">${esc(initials(u.name))}</span><span>${esc(u.name)}<small>UID ${u.uid}</small></span></button></td><td class="user-email">${esc(u.emailUnavailable ? "Unavailable" : u.email || "—")}</td><td>${esc(country(u.countryCode))}</td><td>${badge(u.verification)}</td><td>${esc(date(u.createdAt))}</td><td>${withdrawalAccess(u)}</td><td><button class="row-action" data-user="${u.uid}" aria-label="View ${esc(u.name)}">↗</button></td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="7" class="empty">No accounts match your search.</td></tr>'
  );
}
function table() {
  return `<section class="panel users-panel"><div class="panel-heading"><div><h2>${section === "Overview" ? "Recent users" : "User directory"}</h2><p>Account records and verification status.</p></div>${section === "Overview" ? '<a class="text-link" href="#users">View all users →</a>' : '<button class="row-action" id="refresh-users">Refresh</button>'}</div><div class="table-tools"><label class="search"><span aria-hidden="true">⌕</span><input id="search" type="search" maxlength="100" placeholder="Search name or UID…" aria-label="Search users" value="${esc(query)}"></label><select id="status-filter" aria-label="Filter by verification status">${[
    ["all", "All statuses"],
    ["verified", "Verified"],
    ["pending", "Pending"],
    ["unverified", "Unverified"],
  ]
    .map(
      ([v, t]) =>
        `<option value="${v}" ${v === filter ? "selected" : ""}>${t}</option>`,
    )
    .join(
      "",
    )}</select></div><div class="table-scroll"><table><thead><tr><th>User</th><th>Email</th><th>Country</th><th>Verification</th><th>Joined · UTC</th><th>Withdrawals</th><th><span class="sr-only">Details</span></th></tr></thead><tbody><tr><td colspan="7" class="empty">Loading accounts…</td></tr></tbody></table></div><div class="table-footer"><span id="result-count" role="status">Loading…</span><div><button class="page-button" id="previous-page" disabled>← Previous</button><button class="page-button" id="next-page" disabled>Next →</button></div></div></section>`;
}
function operationsPage() {
  const state = operations[section],
    live = section === "Live streams";
  state.cursor = null;
  state.history = [];
  state.next = null;
  const choices = live
    ? [
        ["all", "All broadcasts"],
        ["public", "Public"],
        ["private", "Private"],
      ]
    : [
        ["stream", "Stream reports"],
        ["post", "Post reports"],
        ["user", "Account / DM reports"],
      ];
  return `<section class="panel operations-panel"><div class="panel-heading"><div><h2>${live ? "Current live broadcasts" : "Submitted reports"}</h2><p>${live ? "Refreshes every 30 seconds while visible." : "Individual reports, not unique reported accounts or content."}</p></div><button id="refresh-operations" class="row-action">Refresh</button></div><div class="table-tools"><label>${live ? "Visibility" : "Report type"} <select id="operation-filter">${choices.map(([v, t]) => `<option value="${v}" ${v === state.filter ? "selected" : ""}>${t}</option>`).join("")}</select></label>${live ? "" : `<label>Status <select id="operation-status"><option value="pending" ${state.status === "pending" ? "selected" : ""}>Pending</option><option value="all" ${state.status === "all" ? "selected" : ""}>All statuses</option></select></label>`}</div><p class="removal-note">${live ? "Active broadcasts are based on recent host activity. Viewer counts and playback are not available here." : "Read-only review list. Reports are allegations; no enforcement action has been taken by this dashboard. Review decisions and moderation controls are not connected."}</p><div class="table-scroll"><table><thead><tr>${(live ? ["Host", "Title / category", "Visibility", "Started · UTC", "Last activity · UTC"] : ["Report / target", "Reason", "Details", "Status", "Reported · UTC"]).map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody></tbody></table></div><div class="table-footer"><span id="operation-count" role="status"></span><div><button class="page-button" id="previous-operations" disabled>← Previous</button><button class="page-button" id="next-operations" disabled>Next →</button></div></div></section>`;
}
const dateTime = (value) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
async function loadOperations() {
  if (!authorized || !operations[section]) return;
  const state = operations[section],
    live = section === "Live streams",
    version = ++requestVersion;
  const tbody = document.querySelector(".operations-panel tbody");
  state.next = null;
  tbody.innerHTML = '<tr><td colspan="5" class="empty">Loading…</td></tr>';
  document.getElementById("operation-count").textContent = "Loading…";
  document.getElementById("next-operations").disabled = true;
  document.getElementById("previous-operations").disabled = true;
  try {
    const params = new URLSearchParams({ filter: state.filter, limit: "20" });
    if (!live) params.set("status", state.status);
    if (state.cursor) params.set("cursor", state.cursor);
    const data = await api("/" + state.endpoint + "?" + params);
    if (version !== requestVersion || !authorized) return;
    state.next = data.nextCursor;
    tbody.innerHTML =
      data.rows
        .map((r) =>
          live
            ? `<tr><td><button class="user-button" data-user="${esc(r.hostUid)}"><span>${esc(r.hostName)}<small>UID ${esc(r.hostUid)} · Broadcast #${esc(r.id)}</small></span></button></td><td class="removal-notes">${esc(r.title)}<p>${esc(r.category)}</p></td><td>${r.isPrivate ? "Private" : "Public"}</td><td>${esc(dateTime(r.startedAt))}</td><td>${esc(dateTime(r.lastHeartbeatAt))}</td></tr>`
            : `<tr><td>Report #${esc(r.id)}<p>${esc(r.source)} #${esc(r.targetId)}</p><small>${r.ownerUid === null ? "Account unavailable" : "Account UID " + esc(r.ownerUid)}</small></td><td>${esc(r.reason.replaceAll("_", " "))}</td><td class="removal-notes">${esc(r.details || "No details provided")}</td><td>${esc(r.status)}</td><td>${esc(dateTime(r.createdAt))}</td></tr>`,
        )
        .join("") ||
      `<tr><td colspan="5" class="empty">${live ? "No active broadcasts match this filter." : "No reports match these filters."}</td></tr>`;
    document.getElementById("operation-count").textContent =
      `${data.rows.length} ${live ? "broadcasts" : "reports"} on this page · Updated ${new Date(data.asOf).toLocaleTimeString()}`;
    document.getElementById("next-operations").disabled = !state.next;
    document.getElementById("previous-operations").disabled =
      !state.history.length;
  } catch (e) {
    if (version !== requestVersion) return;
    if (accessError(e)) return;
    tbody.innerHTML = `<tr><td colspan="5" class="empty">${esc(e.message)} <button class="page-button" id="retry-operations">Retry</button></td></tr>`;
    document.getElementById("operation-count").textContent =
      "Unable to load records";
    document.getElementById("previous-operations").disabled =
      !state.history.length;
  }
}
function reviews() {
  reviewCursor = null;
  reviewHistory = [];
  reviewNext = null;
  return `<section class="panel reviews-panel"><div class="panel-heading"><div><h2>Verification manual review</h2><p>Only checks flagged as needing review. Routine processing is excluded.</p></div><button class="row-action" id="refresh-reviews">Refresh</button></div><div class="table-tools"><label for="review-filter">Review type</label><select id="review-filter">${[
    ["all", "All reviews"],
    ["initial", "Initial verification"],
    ["upgrade", "ID upgrade"],
  ]
    .map(
      ([s, t]) =>
        `<option value="${s}" ${s === reviewFilter ? "selected" : ""}>${t}</option>`,
    )
    .join(
      "",
    )}</select></div><p class="removal-note">Investigate and resolve evidence in Didit. This queue cannot approve verification. Accepted provider updates determine the account’s verification status.</p><div class="table-scroll"><table><thead><tr><th>Account</th><th>Needs review</th><th>Established verification</th><th>Last updated · UTC</th></tr></thead><tbody></tbody></table></div><div class="table-footer"><span id="review-count" role="status"></span><div><button class="page-button" id="previous-reviews" disabled>← Previous</button><button class="page-button" id="next-reviews" disabled>Next →</button></div></div></section>`;
}
async function loadReviews() {
  if (!authorized || section !== "Verification") return;
  const version = ++requestVersion;
  const tbody = document.querySelector(".reviews-panel tbody");
  reviewNext = null;
  tbody.innerHTML =
    '<tr><td colspan="4" class="empty">Loading reviews…</td></tr>';
  document.getElementById("review-count").textContent = "Loading…";
  document.getElementById("next-reviews").disabled = true;
  document.getElementById("previous-reviews").disabled = true;
  try {
    const params = new URLSearchParams({ kind: reviewFilter, limit: "20" });
    if (reviewCursor) params.set("cursor", reviewCursor);
    const data = await api("/verification-reviews?" + params);
    if (version !== requestVersion || !authorized || section !== "Verification")
      return;
    reviewNext = data.nextCursor;
    tbody.innerHTML =
      data.reviews
        .map(
          (r) =>
            `<tr><td><button class="user-button" data-user="${esc(r.uid)}"><span>${esc(r.name)}<small>UID ${esc(r.uid)}</small></span></button></td><td>${[r.status === "review_needed" ? "Initial verification" : "", r.upgradeStatus === "review_needed" ? "ID upgrade" : ""].filter(Boolean).join(" · ")}</td><td>${r.isVerified ? `Verified · ${esc(r.method || "Method unavailable")}` : "Unverified"}</td><td>${esc(date(r.updatedAt))}</td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="4" class="empty">No verifications need manual review.</td></tr>';
    document.getElementById("review-count").textContent =
      `${data.reviews.length} accounts · ${data.environment} verification · Updated ${new Date(data.asOf).toLocaleTimeString()}`;
    document.getElementById("next-reviews").disabled = !reviewNext;
    document.getElementById("previous-reviews").disabled =
      !reviewHistory.length;
  } catch (e) {
    if (version !== requestVersion) return;
    if (accessError(e)) return;
    tbody.innerHTML = `<tr><td colspan="4" class="empty">${esc(e.message)} <button class="page-button" id="retry-reviews">Retry</button></td></tr>`;
    document.getElementById("review-count").textContent =
      "Unable to load reviews";
    document.getElementById("previous-reviews").disabled =
      !reviewHistory.length;
  }
}
function removals() {
  removalCursor = null;
  removalHistory = [];
  removalNext = null;
  return `<section class="panel removals-panel"><div class="panel-heading"><div><h2>Account removal requests</h2><p>Pending requests are still active accounts. Completed records are marked as removed after manual review.</p></div><button class="row-action" id="refresh-removals">Refresh</button></div><div class="table-tools"><label for="removal-filter">Request status</label><select id="removal-filter">${["pending", "completed", "cancelled", "rejected", "all"].map((s) => `<option value="${s}" ${s === removalFilter ? "selected" : ""}>${s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}</option>`).join("")}</select></div><p class="removal-note">Read-only history of recorded requests. Accounts deleted outside this process may not appear. Remaining coins and unresolved payments must be resolved before removal.</p><div class="table-scroll"><table><thead><tr><th>Account</th><th>Status</th><th>Requested · UTC</th><th>Reviewed · UTC</th><th>Reason / review notes</th></tr></thead><tbody></tbody></table></div><div class="table-footer"><span id="removal-count" role="status"></span><div><button class="page-button" id="previous-removals" disabled>← Previous</button><button class="page-button" id="next-removals" disabled>Next →</button></div></div></section>`;
}
async function loadRemovals() {
  if (!authorized || section !== "Account removals") return;
  const version = ++requestVersion;
  const tbody = document.querySelector(".removals-panel tbody");
  removalNext = null;
  tbody.innerHTML =
    '<tr><td colspan="5" class="empty">Loading requests…</td></tr>';
  document.getElementById("removal-count").textContent = "Loading…";
  document.getElementById("next-removals").disabled = true;
  document.getElementById("previous-removals").disabled = true;
  try {
    const params = new URLSearchParams({ status: removalFilter, limit: "20" });
    if (removalCursor) params.set("cursor", removalCursor);
    const data = await api("/account-removals?" + params);
    if (
      version !== requestVersion ||
      !authorized ||
      section !== "Account removals"
    )
      return;
    removalNext = data.nextCursor;
    tbody.innerHTML =
      data.requests
        .map(
          (r) =>
            `<tr><td>${esc(r.name ?? "Account unavailable")}<small>UID ${esc(r.uid)} · Request #${esc(r.id)}</small></td><td>${esc(r.status[0].toUpperCase() + r.status.slice(1))}</td><td>${esc(date(r.requestedAt))}</td><td>${r.reviewedAt ? esc(date(r.reviewedAt)) : "—"}</td><td class="removal-notes"><strong>Reason</strong><p>${esc(r.reason || "Not provided")}</p><strong>Review notes</strong><p>${esc(r.reviewNotes || "None")}</p></td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="5" class="empty">No removal requests match this status.</td></tr>';
    document.getElementById("removal-count").textContent =
      `${data.requests.length} requests · Updated ${new Date(data.asOf).toLocaleTimeString()}`;
    document.getElementById("next-removals").disabled = !removalNext;
    document.getElementById("previous-removals").disabled =
      !removalHistory.length;
  } catch (e) {
    if (version !== requestVersion) return;
    if (accessError(e)) return;
    tbody.innerHTML = `<tr><td colspan="5" class="empty">${esc(e.message)} <button class="page-button" id="retry-removals">Retry</button></td></tr>`;
    document.getElementById("removal-count").textContent =
      "Unable to load requests";
    document.getElementById("previous-removals").disabled =
      !removalHistory.length;
  }
}
const formatCount = (value) => new Intl.NumberFormat("en").format(value);
function comparison(metric) {
  if (metric.changePercent === null)
    return metric.current
      ? "New activity · no prior activity"
      : "No activity in either period";
  if (metric.changePercent === 0) return "No change vs. previous period";
  return `${metric.changePercent > 0 ? "+" : ""}${formatCount(metric.changePercent)}% vs. previous period`;
}
function metricCards(data, state = "Loading data…") {
  const metrics = [
    [
      "Total users",
      data?.totalUsers,
      data ? `${formatCount(data.newUsers.current)} new in this period` : state,
      "Users",
    ],
    [
      "Live right now",
      data?.liveStreams,
      data ? "Active broadcasts" : state,
      "Live streams",
    ],
    [
      "Verified accounts",
      data?.verifiedAccounts,
      data
        ? `${formatCount(data.verifiedPercent)}% of users · ${data.verificationEnvironment === "sandbox" ? "sandbox" : "live"} verification`
        : state,
      "Verification",
    ],
    [
      "Coins gifted",
      data?.coinsGifted.current,
      data ? comparison(data.coinsGifted) : state,
      "Wallet & earnings",
    ],
  ];
  return `<div class="stats">${metrics.map(([label, value, sub, name]) => `<div class="stat"><div class="stat-top">${label}<span>${icon(name)}</span></div><strong>${value == null ? "—" : formatCount(value)}</strong><div class="stat-bottom"><small>${esc(sub)}</small></div></div>`).join("")}</div>`;
}
function growthChart(data) {
  const max = Math.max(
    4,
    Math.ceil(Math.max(...data.growth.map((d) => d.count)) / 4) * 4,
  );
  const points = data.growth.map((d, i) => ({
    ...d,
    x: (i * 700) / 6,
    y: 160 - (d.count / max) * 145,
  }));
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const label = (d) =>
    new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(d + "T00:00:00Z"));
  return `<div class="panel-heading"><div><h2>Community growth</h2><p>New accounts · seven UTC dates · today is partial</p></div><span class="legend"><i></i>New users</span></div>
  <div class="chart-summary">${formatCount(data.newUsers.current)} <span>${esc(comparison(data.newUsers))}</span></div>
  <div class="chart"><div class="chart-labels"><span>${formatCount(max)}</span><span>${formatCount(max / 2)}</span><span>0</span></div>
  <svg viewBox="0 0 700 165" preserveAspectRatio="none" role="img" aria-label="${esc(`${formatCount(data.newUsers.current)} new accounts over seven UTC dates. Daily values are in the table below.`)}"><defs><linearGradient id="overview-growth-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ff1966" stop-opacity=".24"/><stop offset="100%" stop-color="#ff1966" stop-opacity="0"/></linearGradient></defs>
  <g stroke="#252630" stroke-dasharray="3 5"><path d="M0 15H700M0 87.5H700M0 160H700"/></g>
  <polygon points="0,160 ${line} 700,160" fill="url(#overview-growth-fill)"/>
  <polyline points="${line}" fill="none" stroke="#ff4080" stroke-width="3" vector-effect="non-scaling-stroke"/>
  ${points.map((d) => `<circle cx="${d.x}" cy="${d.y}" r="4" fill="#ff6195"><title>${esc(label(d.date))}: ${formatCount(d.count)} accounts</title></circle>`).join("")}</svg>
  <div class="x-labels">${points.map((d) => `<span>${esc(label(d.date))}</span>`).join("")}</div></div>
  ${data.newUsers.current === 0 ? '<p class="chart-empty">No new accounts in this period.</p>' : ""}
  <details class="chart-data"><summary>View daily counts</summary><table><caption class="sr-only">Daily new accounts in UTC; today is partial</caption><thead><tr><th scope="col">Date (UTC)</th><th scope="col">New accounts</th></tr></thead><tbody>${points.map((d, i) => `<tr><td>${esc(label(d.date))}${i === 6 ? " · Today, partial" : ""}</td><td>${formatCount(d.count)}</td></tr>`).join("")}</tbody></table></details>`;
}
function overview() {
  return `<div class="overview-toolbar"><span id="overview-range">Last seven UTC dates · Today is partial</span><button class="page-button" id="refresh-overview">Refresh overview</button></div><p id="overview-feedback" role="status">Loading metrics…</p><div id="overview-metrics">${metricCards(null)}</div><div class="middle-grid"><section class="panel chart-panel" id="growth-panel"><div class="unconnected">Loading community growth…</div></section><section class="panel attention"><div class="panel-heading"><div><h2>Needs attention</h2><p>Queues will appear as each section is connected.</p></div></div>${[
    ["Verification", "Verification reviews", "amber"],
    ["Moderation", "Submitted reports", "rose"],
    ["Live streams", "Flagged live streams", "purple"],
  ]
    .map(
      ([name, title, color]) =>
        `<a class="attention-row" href="#${name.toLowerCase().replaceAll(" ", "-")}"><span class="attention-icon ${color}">${icon(name)}</span><span><strong>${title}</strong><small>${name === "Verification" ? "Open manual-review queue" : name === "Moderation" ? "Open report list" : "Flagging queue not connected"}</small></span><span class="arrow">›</span></a>`,
    )
    .join("")}</section></div>${table()}`;
}
async function loadOverview() {
  if (!authorized || section !== "Overview" || document.hidden) return;
  const version = ++overviewVersion;
  const feedback = document.getElementById("overview-feedback");
  if (!feedback) return;
  feedback.textContent = "Refreshing overview…";
  document.getElementById("refresh-overview").disabled = true;
  try {
    const data = await api("/overview");
    if (version !== overviewVersion || !authorized || section !== "Overview")
      return;
    document.getElementById("overview-metrics").innerHTML = metricCards(data);
    const chart = document.getElementById("growth-panel");
    const expanded = chart.querySelector("details")?.open;
    chart.innerHTML = growthChart(data);
    if (expanded) chart.querySelector("details").open = true;
    document.getElementById("overview-range").textContent =
      `${date(data.range.start)} – ${date(data.range.end)} · UTC · Today is partial`;
    feedback.textContent = `Updated ${new Date(data.asOf).toLocaleTimeString()} · Refreshes every minute · ${data.environment === "production" ? "Production" : "Development"} data`;
  } catch (error) {
    if (version !== overviewVersion) return;
    if (accessError(error)) return;
    document.getElementById("overview-metrics").innerHTML = metricCards(
      null,
      "Unavailable",
    );
    document.getElementById("growth-panel").innerHTML =
      '<div class="unconnected">Community growth is temporarily unavailable.</div>';
    feedback.textContent = error.message + " Use Refresh overview to retry.";
  } finally {
    if (
      version === overviewVersion &&
      document.getElementById("refresh-overview")
    )
      document.getElementById("refresh-overview").disabled = false;
  }
}
function catalogPage() {
  return `<section class="panel catalog-import"><div class="panel-heading"><div><h2>Import methods and fees</h2></div></div><div class="catalog-content"><p id="catalog-import-provider">Select a provider below, then preview its JSON before importing.</p><label for="catalog-file">Research JSON file</label><input id="catalog-file" type="file" accept="application/json,.json"><div class="catalog-actions"><button class="page-button" id="download-catalog-template" disabled>Download import template</button><button class="page-button" id="preview-catalog-import" disabled>Preview import</button><button class="primary-button" id="commit-catalog-import" disabled>Import research</button></div><p id="catalog-import-status" role="status">No file selected. Import does not send payments.</p></div></section><section class="panel catalog-panel"><div class="panel-heading"><div><h2>Payout providers, countries and fees</h2><p>Manage providers and their observed payout options. Saved fees are estimates; verify the actual quote before preparing payment.</p></div><button class="page-button" id="refresh-catalog">Refresh</button></div><div class="catalog-content"><form id="catalog-add-provider" class="catalog-editor"><label>Provider name<input name="name" required maxlength="120" placeholder="Remitly, Payoneer…"></label><button class="primary-button" type="submit">Add provider</button><span class="catalog-feedback" role="status"></span></form><p id="catalog-status" role="status">Loading catalog…</p><div id="catalog-records"></div></div></section>`;
}
const catalogMoney = (cents, currency = "USD") => {
  if (!Number.isFinite(cents)) return "Unknown";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(
      cents / 100,
    );
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
};
const catalogDate = (value) =>
  value && !Number.isNaN(Date.parse(value)) ? date(value) : "Not verified";
function catalogPencil(kind, record) {
  const label =
    kind === "countries"
      ? "country"
      : kind === "methods"
        ? "payout type"
        : "provider";
  return `<button class="catalog-pencil" type="button" data-edit-catalog="${esc(record.id)}" aria-label="Edit ${label} name" title="Edit ${label} name" aria-expanded="false"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg></button>`;
}
function catalogEditor(kind, record, inheritedDisabled = false) {
  return `<form class="catalog-editor catalog-inline-editor" data-catalog-kind="${kind}" data-catalog-id="${esc(record.id)}" data-catalog-revision="${esc(record.revision)}"><label class="catalog-name-field" hidden>Name<input name="name" required maxlength="120" value="${esc(record.name)}"></label><label class="catalog-toggle"><input name="enabled" type="checkbox" ${record.enabled ? "checked" : ""}> Enabled</label><button class="page-button" type="submit" hidden>Save</button><button class="page-button" type="button" data-cancel-catalog hidden>Cancel</button><span class="catalog-feedback" role="status"></span>${inheritedDisabled ? '<p class="catalog-inherited">Unavailable to creators because a parent is disabled.</p>' : ""}</form>`;
}
const catalogFundingName = (value) =>
  ({
    debit_card: "Debit card",
    credit_card: "Credit card",
    bank_account: "Bank account",
  })[value] ||
  value ||
  "—";
function catalogObservationRows(observations = []) {
  const groups = new Map();
  for (const observation of observations) {
    const key = JSON.stringify([
      observation.feeCents,
      observation.feeCurrency,
      observation.fundingMethod,
      observation.deliveryEstimate,
      observation.taxStatus,
    ]);
    if (!groups.has(key))
      groups.set(key, { observation, amounts: new Set(), dates: new Set() });
    const group = groups.get(key);
    group.amounts.add(catalogMoney(observation.sendAmountCents));
    group.dates.add(catalogDate(observation.observedAt));
  }
  return (
    Array.from(groups.values())
      .map(
        ({ observation: o, amounts, dates }) =>
          `<tr><td>${esc(Array.from(amounts).join(", "))}</td><td>${esc(catalogFundingName(o.fundingMethod))}</td><td>${esc(catalogMoney(o.feeCents, o.feeCurrency))}${o.feeCents === 0 ? "<small>Promotion status unverified</small>" : ""}</td><td>${esc(o.deliveryEstimate || "—")}</td><td>${esc(Array.from(dates).join(", "))}</td><td>${esc(o.taxStatus || "Unknown")}</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="6" class="empty">No quotes recorded.</td></tr>'
  );
}
function catalogDefaultFeeEditor(method) {
  return `<form class="catalog-default-fee-editor catalog-editor" data-method-id="${esc(method.id)}" data-revision="${esc(method.revision)}"><label>Default fee · USD<input name="fee" required inputmode="decimal" placeholder="0.99" value="${method.defaultFeeCents == null ? "" : (method.defaultFeeCents / 100).toFixed(2)}"></label><label>Funding method<select name="fundingMethod"><option value="debit_card" ${method.defaultFundingMethod === "debit_card" ? "selected" : ""}>Debit card</option><option value="credit_card" ${method.defaultFundingMethod === "credit_card" ? "selected" : ""}>Credit card</option><option value="bank_account" ${method.defaultFundingMethod === "bank_account" ? "selected" : ""}>Bank account</option></select></label><button class="page-button" type="submit">Save default fee</button><button class="page-button" type="button" data-close-fee-row>Cancel</button><span class="catalog-feedback" role="status"></span></form><p class="catalog-fee-note">Enter the normal fee, excluding temporary promotions. Actual payouts still require a current provider quote.</p>`;
}
function catalogMethodsTable(country, provider) {
  if (!country.methods?.length)
    return "<p>No payout types available for this country.</p>";
  return `<div class="table-scroll"><table class="catalog-methods-table"><thead><tr><th>Payout type</th><th>Default fee · USD</th><th>Funding</th><th>Receive currency</th><th>Delivery</th><th>Status</th><th>Actions</th></tr></thead>${country.methods
    .map((method) => {
      const latest = method.observations?.[0] || {};
      const inherited = !provider.enabled || !country.enabled;
      return `<tbody class="catalog-method"><tr class="catalog-method-row"><td><div class="catalog-method-heading"><h3>${esc(method.name)}</h3>${catalogPencil("methods", method)}</div></td><td>${method.defaultFeeCents == null ? '<span class="catalog-unset">Not set</span>' : esc(catalogMoney(method.defaultFeeCents))}</td><td>${esc(catalogFundingName(method.defaultFundingMethod))}</td><td>${esc(method.receiveCurrency || "—")}</td><td>${esc(latest.deliveryEstimate || "—")}</td><td>${esc(!method.enabled ? "Disabled" : inherited ? "Parent disabled" : method.availability === "available" ? "Available" : "Needs review")}</td><td><div class="catalog-row-actions"><button class="page-button" type="button" data-default-fee="${esc(method.id)}">${method.defaultFeeCents == null ? "Add default fee" : "Edit fee"}</button><button class="catalog-history-button" type="button" data-fee-history="${esc(method.id)}" aria-expanded="false">Quote history</button></div></td></tr><tr class="catalog-method-controls" data-catalog-editor-row hidden><td colspan="7">${catalogEditor("methods", method, inherited)}</td></tr><tr class="catalog-method-controls" data-default-fee-row="${esc(method.id)}" hidden><td colspan="7">${catalogDefaultFeeEditor(method)}</td></tr><tr class="catalog-method-controls" data-fee-history-row="${esc(method.id)}" hidden><td colspan="7">${catalogFeeEditor(method)}<table class="catalog-quote-table"><caption>Recorded quotes · zero fees may be promotional</caption><thead><tr><th>Send amount · USD</th><th>Funding</th><th>Quoted fee</th><th>Delivery</th><th>Recorded</th><th>Taxes</th></tr></thead><tbody>${catalogObservationRows(method.observations)}</tbody></table></td></tr></tbody>`;
    })
    .join("")}</table></div>`;
}
function catalogFeeEditor(method) {
  const latest = method.observations?.[0] || {};
  return `<details class="catalog-evidence"><summary>Record a provider quote</summary><form class="catalog-fee-editor catalog-editor" data-method-id="${esc(method.id)}" data-revision="${esc(method.revision)}"><label>Send amount · USD<input name="sendAmount" type="text" inputmode="decimal" required placeholder="15.00"></label><label>Quoted fee · USD<input name="fee" type="text" inputmode="decimal" required placeholder="0.99"></label><label>Funding method<select name="fundingMethod"><option value="debit_card">Debit card</option><option value="credit_card">Credit card</option><option value="bank_account">Bank account</option></select></label><label>Quoted at · local time<input name="observedAt" type="datetime-local" required></label><label>Delivery estimate<input name="deliveryEstimate" maxlength="200" value="${esc(latest.deliveryEstimate || "")}"></label><label>Taxes<select name="taxStatus"><option value="not_observed">Not observed</option><option value="unresolved">Unresolved</option><option value="none">Confirmed none</option><option value="included">Confirmed included</option></select></label><label>Provider source page<input name="sourceUrl" type="url" required maxlength="500" value="${esc(latest.sourceUrls?.[0] || "")}" placeholder="https://…"></label><button class="page-button" type="submit">Save quote</button><span class="catalog-feedback" role="status"></span></form><p>Enter a fee observed in the provider account for this exact send amount and funding method. Saving retains previous observations and does not change existing withdrawal quotes.</p></details>`;
}
function catalogCents(value) {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value))
    throw new Error("Enter USD amounts with at most two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
function resetCatalogPreview() {
  catalogPreviewed = false;
  document.getElementById("commit-catalog-import").disabled = true;
}
function downloadCatalogTemplate() {
  const provider = catalog?.providers?.find((p) => p.id === catalogProviderId);
  if (!provider) return;
  const template = {
    observed_date: new Date().toISOString().slice(0, 10),
    source: /^remitly_[a-f0-9]{24}$/.test(provider.id)
      ? "Signed-in Remitly Business website UI"
      : `Signed-in ${provider.name} website UI`,
    source_urls: /^remitly_[a-f0-9]{24}$/.test(provider.id)
      ? ["https://www.remitly.com/us/en/transfer/send"]
      : [],
    sender_country: "US",
    funding_method: "debit_card",
    comparison_send_amounts_usd: [15],
    fee_currency: "USD",
    production_fee_schedule: false,
    live_requote_required: true,
    scope: "Replace with the scope of your signed-in provider observations.",
    countries: [
      {
        country_code: "",
        country: "",
        receive_currency: "",
        inspection_status: /^remitly_[a-f0-9]{24}$/.test(provider.id)
          ? "link_options"
          : "verified_methods",
        notes: "Replace with your actual country and method observations.",
        methods: [
          {
            label: "",
            delivery_estimate: null,
            fee_cents_at_15_usd_send: null,
          },
        ],
      },
    ],
  };
  const blob = new Blob([JSON.stringify(template, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = "payout-provider-import.json";
  link.click();
  URL.revokeObjectURL(url);
  document.getElementById("catalog-import-status").textContent =
    "Template downloaded. Add country records with country_code, country, receive_currency, inspection_status, notes and methods. Each method needs label, delivery_estimate and fee_cents_at_15_usd_send. Fees are integer USD cents. Fill in the country and method records before previewing.";
}
function renderCatalogRecords() {
  const target = document.getElementById("catalog-records");
  if (!target || !catalog) return;
  const providers = catalog.providers || [];
  const provider =
    providers.find((p) => String(p.id) === String(catalogProviderId)) ||
    providers[0];
  catalogProviderId = provider?.id ?? null;
  if (!provider) {
    target.innerHTML =
      "<p>No providers yet. Add a provider above, then import its countries, methods and fees.</p>";
    document.getElementById("download-catalog-template").disabled = true;
    return;
  }
  document.getElementById("download-catalog-template").disabled = false;
  document.getElementById("catalog-import-provider").textContent =
    `Import into ${provider.name}. Upload countries, delivery methods and observed fees for this provider.`;
  target.innerHTML = `<div class="catalog-provider-row"><label class="catalog-provider">Provider<select id="catalog-provider">${providers.map((p) => `<option value="${esc(p.id)}" ${p === provider ? "selected" : ""}>${esc(p.name)}${p.enabled ? "" : " (disabled)"}</option>`).join("")}</select></label>${catalogPencil("providers", provider)}</div>${catalogEditor("providers", provider)}${/^remitly_[a-f0-9]{24}$/.test(provider.id) ? "" : "<p>Provider information can be managed here. Its actual withdrawal workflow requires a separate integration before it appears in the mobile app.</p>"}<div class="catalog-countries">${(provider.countries || []).map((c) => `<details class="catalog-country" data-catalog-country-id="${esc(c.id)}"><summary><span class="catalog-country-name">${esc(c.name)} · ${esc(c.countryCode)}</span>${catalogPencil("countries", c)} <span>${esc(c.availability)}${c.enabled ? "" : " · Disabled"}</span></summary><p>Receive currency: ${esc(c.receiveCurrency || c.methods?.[0]?.receiveCurrency || "Not observed")} · Last verified: ${esc(catalogDate(c.lastVerifiedAt))} · Inspection: ${esc(c.inspectionStatus || c.availability)}</p>${catalogEditor("countries", c, !provider.enabled)}${catalogMethodsTable(c, provider)}</details>`).join("")}</div>`;
}
async function loadCatalog() {
  if (!authorized || section !== "Payout methods") return;
  const openCountries = new Set(
    Array.from(document.querySelectorAll(".catalog-country[open]")).map(
      (node) => node.dataset.catalogCountryId,
    ),
  );
  const version = ++catalogVersion;
  catalog = null;
  document.getElementById("catalog-records").replaceChildren();
  document.getElementById("catalog-status").textContent = "Loading catalog…";
  try {
    const data = await api("/payout-catalog");
    if (
      version !== catalogVersion ||
      !authorized ||
      section !== "Payout methods"
    )
      return;
    catalog = data;
    renderCatalogRecords();
    for (const node of document.querySelectorAll(".catalog-country"))
      node.open = openCountries.has(node.dataset.catalogCountryId);
    document.getElementById("catalog-status").textContent =
      `Updated ${catalogDate(data.asOf)}. Availability and pricing are account-specific. Taxes and promotions are separate from fees. No payments are sent here.`;
  } catch (e) {
    if (version !== catalogVersion) return;
    if (accessError(e)) return;
    catalog = null;
    document.getElementById("catalog-records").replaceChildren();
    document.getElementById("catalog-status").textContent = e.message;
  }
}
async function catalogImportAction(dryRun) {
  if (
    !authorized ||
    section !== "Payout methods" ||
    !catalogImport ||
    (!dryRun && !catalogPreviewed)
  )
    return;
  const version = catalogVersion,
    research = catalogImport,
    providerId = catalogProviderId;
  if (!providerId) return;
  const status = document.getElementById("catalog-import-status");
  document.getElementById("preview-catalog-import").disabled = true;
  document.getElementById("commit-catalog-import").disabled = true;
  catalogPreviewed = false;
  status.textContent = dryRun ? "Validating research…" : "Importing research…";
  try {
    const result = await api("/payout-catalog/import", {
      method: "POST",
      body: JSON.stringify({ research, dryRun, providerId }),
    });
    if (
      version !== catalogVersion ||
      !authorized ||
      research !== catalogImport ||
      providerId !== catalogProviderId
    )
      return;
    status.textContent = `${dryRun ? "Preview validated" : "Imported"}: ${result.countries} countries, ${result.methods} methods, ${result.observations} observations.${dryRun ? " Select Import research to apply." : " Re-importing the same research does not duplicate observations."}`;
    catalogPreviewed = dryRun;
    if (!dryRun) await loadCatalog();
  } catch (e) {
    if (
      version !== catalogVersion ||
      research !== catalogImport ||
      providerId !== catalogProviderId
    )
      return;
    if (accessError(e)) return;
    status.textContent = e.message;
  } finally {
    if (
      authorized &&
      section === "Payout methods" &&
      research === catalogImport &&
      providerId === catalogProviderId
    ) {
      document.getElementById("preview-catalog-import").disabled = false;
      document.getElementById("commit-catalog-import").disabled =
        !catalogPreviewed;
    }
  }
}
document.addEventListener("submit", async (event) => {
  const specialForm = event.target.closest(
    "#catalog-add-provider, .catalog-fee-editor, .catalog-default-fee-editor",
  );
  if (specialForm) {
    event.preventDefault();
    if (!authorized || section !== "Payout methods") return;
    const version = catalogVersion,
      button = specialForm.querySelector("button"),
      feedback = specialForm.querySelector(".catalog-feedback");
    button.disabled = true;
    feedback.textContent = "Saving…";
    try {
      const fields = specialForm.elements;
      let result;
      if (specialForm.id === "catalog-add-provider") {
        result = await api("/payout-catalog/providers", {
          method: "POST",
          body: JSON.stringify({ name: fields.name.value.trim() }),
        });
      } else if (specialForm.matches(".catalog-default-fee-editor")) {
        result = await api(
          `/payout-catalog/methods/${encodeURIComponent(specialForm.dataset.methodId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              revision: Number(specialForm.dataset.revision),
              defaultFeeCents: catalogCents(fields.fee.value.trim()),
              defaultFundingMethod: fields.fundingMethod.value,
            }),
          },
        );
      } else {
        result = await api(
          `/payout-catalog/methods/${encodeURIComponent(specialForm.dataset.methodId)}/fees`,
          {
            method: "POST",
            body: JSON.stringify({
              revision: Number(specialForm.dataset.revision),
              sendAmountCents: catalogCents(fields.sendAmount.value.trim()),
              feeCents: catalogCents(fields.fee.value.trim()),
              fundingMethod: fields.fundingMethod.value,
              observedAt: new Date(fields.observedAt.value).toISOString(),
              deliveryEstimate: fields.deliveryEstimate.value.trim(),
              taxStatus: fields.taxStatus.value,
              sourceUrl: fields.sourceUrl.value.trim(),
            }),
          },
        );
      }
      if (
        version !== catalogVersion ||
        !authorized ||
        section !== "Payout methods"
      )
        return;
      if (specialForm.id === "catalog-add-provider") {
        catalogProviderId = result.id;
        specialForm.reset();
        feedback.textContent = "Provider added.";
        resetCatalogPreview();
        document.getElementById("catalog-import-status").textContent =
          `Provider added. Choose a JSON file to import into ${result.name}.`;
      }
      await loadCatalog();
    } catch (error) {
      if (version !== catalogVersion || accessError(error)) return;
      feedback.textContent = error.message;
    } finally {
      if (specialForm.isConnected) button.disabled = false;
    }
    return;
  }
  const form = event.target.closest(".catalog-editor");
  if (!form) return;
  event.preventDefault();
  if (!authorized || section !== "Payout methods") return;
  const version = catalogVersion,
    feedback = form.querySelector(".catalog-feedback"),
    button = form.querySelector("button");
  button.disabled = true;
  feedback.textContent = "Saving…";
  try {
    await api(
      `/payout-catalog/${form.dataset.catalogKind}/${encodeURIComponent(form.dataset.catalogId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: form.elements.name.value.trim(),
          enabled: form.elements.enabled.checked,
          revision: Number(form.dataset.catalogRevision),
        }),
      },
    );
    if (version !== catalogVersion || !authorized) return;
    await loadCatalog();
  } catch (e) {
    if (version !== catalogVersion) return;
    if (accessError(e)) return;
    feedback.textContent =
      e.status === 409
        ? "This record changed. Refresh the catalog before saving again."
        : e.message;
  } finally {
    if (form.isConnected) button.disabled = false;
  }
});
document.addEventListener("change", async (event) => {
  if (!authorized || section !== "Payout methods") return;
  const editor = event.target.closest(".catalog-inline-editor");
  if (editor && event.target.name === "enabled") {
    editor.querySelector('[type="submit"]').hidden = false;
    editor.querySelector("[data-cancel-catalog]").hidden = false;
  }
  if (event.target.id === "catalog-provider") {
    ++catalogVersion;
    catalogProviderId = event.target.value;
    resetCatalogPreview();
    document.getElementById("preview-catalog-import").disabled = !catalogImport;
    document.getElementById("catalog-import-status").textContent =
      "Provider changed. Preview the file for this provider before importing.";
    renderCatalogRecords();
  }
  if (event.target.id !== "catalog-file") return;
  const version = catalogVersion,
    file = event.target.files?.[0];
  catalogImport = null;
  catalogPreviewed = false;
  document.getElementById("preview-catalog-import").disabled = true;
  document.getElementById("commit-catalog-import").disabled = true;
  const status = document.getElementById("catalog-import-status");
  status.textContent = "Reading file…";
  try {
    if (!file) {
      status.textContent = "No file selected.";
      return;
    }
    if (file.size > 1024 * 1024)
      throw new Error("Research file must be at most 1 MB.");
    const parsed = JSON.parse(await file.text());
    if (
      version !== catalogVersion ||
      !authorized ||
      event.target.files?.[0] !== file
    )
      return;
    catalogImport = parsed;
    status.textContent =
      "File loaded. Preview to validate signed-in research before importing.";
    document.getElementById("preview-catalog-import").disabled = false;
  } catch (e) {
    if (version === catalogVersion) status.textContent = e.message;
  }
});
document.addEventListener("click", (event) => {
  if (!authorized || section !== "Payout methods") return;
  const feeButton = event.target.closest(
    "[data-default-fee], [data-fee-history]",
  );
  if (feeButton) {
    const defaultEdit = feeButton.hasAttribute("data-default-fee");
    const id = defaultEdit
      ? feeButton.dataset.defaultFee
      : feeButton.dataset.feeHistory;
    const rows = document.querySelectorAll(
      defaultEdit ? "[data-default-fee-row]" : "[data-fee-history-row]",
    );
    const row = Array.from(rows).find(
      (node) =>
        (defaultEdit
          ? node.dataset.defaultFeeRow
          : node.dataset.feeHistoryRow) === id,
    );
    if (row) {
      row.hidden = !row.hidden;
      feeButton.setAttribute("aria-expanded", String(!row.hidden));
      if (defaultEdit && !row.hidden) row.querySelector("input").focus();
    }
    return;
  }
  const closeFeeRow = event.target.closest("[data-close-fee-row]");
  if (closeFeeRow) {
    const row = closeFeeRow.closest("[data-default-fee-row]");
    row.querySelector("form").reset();
    row.hidden = true;
    return;
  }
  const pencil = event.target.closest("[data-edit-catalog]");
  if (pencil) {
    event.preventDefault();
    const form = Array.from(
      document.querySelectorAll(".catalog-inline-editor"),
    ).find((node) => node.dataset.catalogId === pencil.dataset.editCatalog);
    if (!form) return;
    const country = form.closest(".catalog-country");
    if (country) country.open = true;
    const editorRow = form.closest("[data-catalog-editor-row]");
    if (editorRow) editorRow.hidden = false;
    form.querySelector(".catalog-name-field").hidden = false;
    form.querySelector('[type="submit"]').hidden = false;
    form.querySelector("[data-cancel-catalog]").hidden = false;
    pencil.setAttribute("aria-expanded", "true");
    form.elements.name.focus();
    form.elements.name.select();
    return;
  }
  const cancel = event.target.closest("[data-cancel-catalog]");
  if (cancel) {
    const form = cancel.closest("form");
    form.reset();
    const editorRow = form.closest("[data-catalog-editor-row]");
    if (editorRow) editorRow.hidden = true;
    form.querySelector(".catalog-name-field").hidden = true;
    form.querySelector('[type="submit"]').hidden = true;
    cancel.hidden = true;
    form.querySelector(".catalog-feedback").textContent = "";
    const button = Array.from(
      document.querySelectorAll("[data-edit-catalog]"),
    ).find((node) => node.dataset.editCatalog === form.dataset.catalogId);
    if (button) {
      button.setAttribute("aria-expanded", "false");
      button.focus();
    }
    return;
  }
  if (event.target.id === "refresh-catalog") {
    resetCatalogPreview();
    loadCatalog();
  }
  if (event.target.id === "download-catalog-template")
    downloadCatalogTemplate();
  if (event.target.id === "preview-catalog-import") catalogImportAction(true);
  if (event.target.id === "commit-catalog-import") catalogImportAction(false);
});

function render() {
  if (!authorized) return;
  resetGifts();
  resetPayoutDesk();
  resetOperatorCredentials();
  catalogVersion++;
  catalog = null;
  catalogImport = null;
  catalogPreviewed = false;
  requestVersion++;
  overviewVersion++;
  detailVersion++;
  dialog.close();
  document.getElementById("detail-content").replaceChildren();
  const slug = location.hash.slice(1);
  section =
    Object.keys(icons).find(
      (n) => n.toLowerCase().replaceAll(" ", "-") === slug,
    ) || "Overview";
  document.querySelectorAll("[data-nav]").forEach((a) => {
    a.classList.toggle("active", a.dataset.nav === section);
    if (a.dataset.nav === section) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.getElementById("breadcrumb").textContent = section;
  main.innerHTML = `<div class="page-heading"><div><div class="eyebrow">PULSE WORKSPACE</div><h1>${section}</h1><p>${section === "Overview" ? "Welcome back. Your community workspace." : section === "Users" ? "Find and review the people who make Pulse." : section === "Payout desk" ? "Review creator withdrawals and record verified provider outcomes." : "Your space for " + section.toLowerCase() + "."}</p></div><div class="date-label">${section === "Payout methods" ? "Catalog management" : section === "Payout desk" ? "Human release required" : section === "Payout operators" ? "Credential management" : section === "Users" ? "Account management" : "Read-only access"}</div></div>${section === "Overview" ? overview() : section === "Users" ? table() : section === "Account removals" ? removals() : section === "Verification" ? reviews() : section === "Payout methods" ? catalogPage() : section === "Payout desk" ? payoutDeskPage() : section === "Payout operators" ? operatorCredentialsPage() : operations[section] ? operationsPage() : `<section class="panel coming-soon"><span class="empty-icon">${icon(section)}</span><span class="tag">COMING NEXT</span><h2>${section}</h2><p>This section is not connected yet.</p><a class="primary-button" href="#users">Open user directory →</a></section>`}`;
  if (section === "Users" || section === "Overview") loadUsers();
  if (section === "Gifts") {
    main.querySelector('.date-label').textContent='Catalog management';
    main.insertAdjacentHTML("beforeend", giftsPage());
    main.querySelector(".coming-soon")?.remove();
    loadGifts();
  }
  if (section === "Overview") loadOverview();
  if (section === "Account removals") loadRemovals();
  if (section === "Verification") loadReviews();
  if (section === "Payout methods") loadCatalog();
  if (section === "Payout desk") loadWithdrawals();
  if (section === "Payout operators") loadOperatorCredentials();
  if (operations[section]) loadOperations();
}
async function loadUsers() {
  const version = ++requestVersion;
  users = [];
  nextCursor = null;
  const tbody = document.querySelector(".users-panel tbody");
  if (!tbody) return;
  tbody.innerHTML =
    '<tr><td colspan="7" class="empty">Loading accounts…</td></tr>';
  document.getElementById("result-count").textContent = "Loading…";
  document.getElementById("next-page").disabled = true;
  document.getElementById("previous-page").disabled = true;
  try {
    const params = new URLSearchParams({
      q: query,
      status: filter,
      limit: "20",
    });
    if (cursor) params.set("cursor", cursor);
    const data = await api("/users?" + params);
    if (version !== requestVersion || !authorized) return;
    users = data.users;
    nextCursor = data.nextCursor;
    tbody.innerHTML = rows();
    document.getElementById("result-count").textContent =
      `${users.length} accounts · Updated ${new Date(data.asOf).toLocaleTimeString()}`;
    document.getElementById("next-page").disabled = !nextCursor;
    document.getElementById("previous-page").disabled = !history.length;
  } catch (e) {
    if (version !== requestVersion) return;
    if (accessError(e)) return;
    tbody.innerHTML = `<tr><td colspan="7" class="empty">${esc(e.message)} <button class="page-button" id="retry-users">Retry</button></td></tr>`;
    document.getElementById("result-count").textContent =
      "Unable to load accounts";
    document.getElementById("previous-page").disabled = !history.length;
  }
}
async function details(uid) {
  const version = ++detailVersion;
  document.getElementById("detail-content").textContent = "Loading account…";
  dialog.showModal();
  try {
    const u = await api("/users/" + uid);
    if (!authorized || version !== detailVersion) return;
    const v = u.verification;
    document.getElementById("detail-content").innerHTML =
      `<span class="avatar large rose">${esc(initials(u.name))}</span><h2>${esc(u.name)}</h2><p class="muted">UID ${u.uid}</p>${badge(v)}<dl>${[
        ["Email", u.emailUnavailable ? "Unavailable" : u.email || "—"],
        ["Country", country(u.countryCode)],
        ["Joined (UTC)", date(u.createdAt)],
        ["Verification status", v.status.replaceAll("_", " ")],
        ["Established method", v.method || "None"],
        ["ID upgrade", v.upgradeStatus.replaceAll("_", " ")],
        ["Verification environment", v.environment],
      ]
        .map(([k, val]) => `<div><dt>${k}</dt><dd>${esc(val)}</dd></div>`)
        .join("")}</dl>${withdrawalAccess(u)}`;
  } catch (e) {
    if (version !== detailVersion) return;
    if (!accessError(e))
      document.getElementById("detail-content").textContent = e.message;
  }
}
async function checkAccess() {
  const current = window.Clerk?.session?.id || null;
  if (current !== sessionId) {
    clearPrivate();
    sessionId = current;
  }
  document.getElementById("sign-out").hidden = !current;
  if (!current) {
    if (signInElement?.isConnected) return;
    document.getElementById("environment").textContent = "Staff sign-in";
    notice(
      "Sign in to Pulse admin",
      "Use your existing Pulse account. Access is limited to authorized staff.",
    );
    const el = document.createElement("div");
    el.id = "sign-in";
    main.firstElementChild.append(el);
    signInElement = el;
    window.Clerk.mountSignIn(el, {
      routing: "virtual",
      forceRedirectUrl: location.origin + location.pathname,
      appearance: {
        variables: {
          colorPrimary: "#ff1966",
          colorBackground: "#171820",
          colorText: "#efeff4",
          colorTextSecondary: "#a0a1b0",
          colorInputBackground: "#101117",
          colorInputText: "#efeff4",
        },
        elements: { footerAction: { display: "none" } },
      },
    });
    return;
  }
  try {
    const data = await api("/session");
    if (window.Clerk?.session?.id !== current) return;
    document.getElementById("environment").textContent =
      data.environment === "production"
        ? "Production data"
        : "Development data";
    if (!authorized) {
      authorized = true;
      render();
    }
  } catch (e) {
    clearPrivate();
    notice(
      e.status === 403 ? "Admin access required" : "Unable to connect",
      e.message,
      true,
    );
  }
}
function loadScript(src, attrs = {}) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.crossOrigin = "anonymous";
    Object.entries(attrs).forEach(([k, v]) => script.setAttribute(k, v));
    script.onload = resolve;
    script.onerror = () =>
      reject(new Error("Sign-in could not load. Please retry."));
    document.head.append(script);
  });
}
async function start() {
  notice("Pulse admin", "Connecting to secure sign-in…");
  try {
    const r = await fetch("/api/admin-data/config", {
      cache: "no-store",
      credentials: "omit",
    });
    config = await r.json();
    if (!r.ok) throw new Error(config.error);
    const proxyUrl = config.proxyUrl
      ? new URL(config.proxyUrl, window.location.origin).href
      : undefined;
    const scriptOrigin = proxyUrl || config.frontendApi;
    await loadScript(scriptOrigin + "/npm/@clerk/ui@1/dist/ui.browser.js");
    await loadScript(
      scriptOrigin + "/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
      {
        "data-clerk-publishable-key": config.publishableKey,
        ...(proxyUrl ? { "data-clerk-proxy-url": proxyUrl } : {}),
      },
    );
    await window.Clerk.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor },
      ...(proxyUrl ? { proxyUrl } : {}),
    });
    await checkAccess();
    window.Clerk.addListener(({ session }) => {
      if ((session?.id || null) !== sessionId) checkAccess();
    });
  } catch (e) {
    notice("Unable to connect", e.message, true);
  }
}
window.addEventListener("hashchange", () => {
  cursor = null;
  history = [];
  clearTimeout(searchTimer);
  render();
});
document.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    query = e.target.value.trim();
    cursor = null;
    history = [];
    requestVersion++;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadUsers, 300);
  }
});
document.addEventListener("change", (e) => {
  if (["operation-filter", "operation-status"].includes(e.target.id)) {
    const state = operations[section];
    state[e.target.id === "operation-filter" ? "filter" : "status"] =
      e.target.value;
    state.cursor = null;
    state.history = [];
    loadOperations();
  }
  if (e.target.id === "review-filter") {
    reviewFilter = e.target.value;
    reviewCursor = null;
    reviewHistory = [];
    loadReviews();
  }
  if (e.target.id === "removal-filter") {
    removalFilter = e.target.value;
    removalCursor = null;
    removalHistory = [];
    loadRemovals();
  }
  if (e.target.id === "status-filter") {
    filter = e.target.value;
    cursor = null;
    history = [];
    clearTimeout(searchTimer);
    loadUsers();
  }
});
document.addEventListener("click", (e) => {
  if (operations[section]) {
    const state = operations[section];
    if (e.target.id === "next-operations" && state.next) {
      state.history.push(state.cursor);
      state.cursor = state.next;
      loadOperations();
    }
    if (e.target.id === "previous-operations" && state.history.length) {
      state.cursor = state.history.pop();
      loadOperations();
    }
    if (["refresh-operations", "retry-operations"].includes(e.target.id))
      loadOperations();
  }
  if (e.target.id === "next-reviews" && reviewNext) {
    reviewHistory.push(reviewCursor);
    reviewCursor = reviewNext;
    loadReviews();
  }
  if (e.target.id === "previous-reviews" && reviewHistory.length) {
    reviewCursor = reviewHistory.pop();
    loadReviews();
  }
  if (["refresh-reviews", "retry-reviews"].includes(e.target.id)) loadReviews();
  if (e.target.id === "next-removals" && removalNext) {
    removalHistory.push(removalCursor);
    removalCursor = removalNext;
    loadRemovals();
  }
  if (e.target.id === "previous-removals" && removalHistory.length) {
    removalCursor = removalHistory.pop();
    loadRemovals();
  }
  if (["refresh-removals", "retry-removals"].includes(e.target.id))
    loadRemovals();
  const enable = e.target.closest("[data-enable-withdrawals]");
  if (enable && authorized) {
    void enableUserWithdrawals(enable.dataset.enableWithdrawals, enable);
    return;
  }
  const user = e.target.closest("[data-user]");
  if (user && authorized) details(user.dataset.user);
  if (e.target.id === "next-page" && nextCursor) {
    history.push(cursor);
    cursor = nextCursor;
    loadUsers();
  }
  if (e.target.id === "previous-page" && history.length) {
    cursor = history.pop();
    loadUsers();
  }
  if (["refresh-users", "retry-users"].includes(e.target.id)) loadUsers();
  if (e.target.id === "refresh-overview") loadOverview();
  if (e.target.id === "retry-access") {
    if (window.Clerk?.loaded) checkAccess();
    else location.reload();
  }
});
document.getElementById("close-dialog").onclick = () => {
  detailVersion++;
  dialog.close();
  document.getElementById("detail-content").replaceChildren();
};
dialog.addEventListener("cancel", () => {
  detailVersion++;
  document.getElementById("detail-content").replaceChildren();
});
document.getElementById("sign-out").onclick = async () => {
  const id = window.Clerk?.session?.id;
  clearPrivate();
  notice("Signing out", "Closing this browser session…");
  try {
    if (id) await window.Clerk.signOut({ sessionId: id });
    sessionId = null;
    await checkAccess();
  } catch {
    notice(
      "Sign-out incomplete",
      "Your private view has been cleared. Try signing out again.",
    );
  }
};
setInterval(() => {
  if (window.Clerk?.session && !document.hidden) checkAccess();
  if (authorized && section === "Live streams" && !document.hidden)
    loadOperations();
}, 30000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    // Keep Clerk's in-progress email/password flow intact when using a password manager.
    if (!authorized && !sessionId) return;
    clearPrivate();
    notice("Pulse admin", "Checking access when you return…");
  } else if (window.Clerk?.loaded) checkAccess();
});
window.addEventListener("pagehide", () => clearPrivate());
window.addEventListener("pageshow", (e) => {
  if (e.persisted && window.Clerk?.loaded) checkAccess();
});
setInterval(() => {
  if (authorized && section === "Overview" && !document.hidden) loadOverview();
}, 60000);
start();
function resetPayoutDesk() {
  payoutDesk.version++;
  payoutDesk.detailVersion++;
  payoutDesk.records = [];
  payoutDesk.detail = null;
  payoutDesk.settings = null;
  payoutDesk.enrollment = null;
  payoutDesk.busy = false;
  payoutDesk.mutationVersion = (payoutDesk.mutationVersion || 0) + 1;
}
const payoutStatusNames = {
  awaiting_quote: "Awaiting actual quote",
  awaiting_confirmation: "Ready to prepare",
  requested: "Ready to prepare",
  preparing: "Preparing",
  awaiting_human_review: "Awaiting human review",
  awaiting_recipient: "Awaiting recipient",
  processing: "Processing",
  delivered: "Delivery verified",
  failed: "Failed",
  canceled: "Canceled",
  returned: "Returned",
  unknown: "Unknown outcome",
  error: "Error",
  expired: "Expired / investigation required",
};
const payoutRecipientIssueLabels = { phone: "phone number", email: "email address", name: "legal name", other: "other recipient details" };
function payoutRecipientIssueFields(w) {
  const fields = w.recipientIssue?.fields;
  if (!["unknown", "expired"].includes(w.status) || w.recipientIssue?.code !== "recipient_validation_failed" || !Array.isArray(fields) || !fields.length || fields.length > 4 || new Set(fields).size !== fields.length || fields.some(field => !Object.hasOwn(payoutRecipientIssueLabels, field))) return [];
  return ["phone", "email", "name", "other"].filter(field => fields.includes(field));
}
const payoutDisplayStatus = (w) => payoutRecipientIssueFields(w).length ? "error" : w.status;
const payoutRecipientErrorMessage = (w) => {
  const fields = payoutRecipientIssueFields(w);
  return fields.length ? `Remitly could not accept the recipient ${fields.map(field => payoutRecipientIssueLabels[field]).join(", ")}. Coins remain reserved.` : "";
};
const payoutExceptions = (w) =>
  ["unknown", "expired"].includes(w.status) ||
  ["failed", "canceled", "returned"].includes(w.status) ||
  w.checker?.status === "needs_attention" ||
  ((payoutAttempt(w)?.evidence?.deadline || w.reviewDeadline) &&
    Date.parse(payoutAttempt(w)?.evidence?.deadline || w.reviewDeadline) <
      Date.now() &&
    !["delivered", "failed", "canceled", "returned"].includes(w.status));
const payoutAttempt = (w) => w.attempts?.[0] || null;
const payoutTime = (v) =>
  v && Number.isFinite(Date.parse(v)) ? dateTime(v) : "Not recorded";
const payoutRecipientName = (w) =>
  [
    w.recipient?.legalFirstName,
    w.recipient?.legalLastName,
    w.recipient?.secondSurname,
  ]
    .filter(Boolean)
    .join(" ");
function payoutLink(value, label) {
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      u.hash ||
      !(u.hostname === "www.remitly.com" || u.hostname.endsWith(".remitly.com"))
    )
      return '<span class="muted">Provider link requires review</span>';
    return `<a class="text-link payout-provider-link" href="${esc(u.href)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${esc(label)} ↗</a>`;
  } catch {
    return "";
  }
}
function payoutDeskPage() {
  return `<section class="panel payouts-panel"><div class="panel-heading"><div><h2>Creator withdrawal queue</h2><p>USD 15 maximum includes fees and taxes. Saved catalog prices are estimates.</p></div><button id="refresh-withdrawals" class="page-button">Refresh queue</button></div><div class="payout-content"><div id="payout-summary" class="payout-summary"></div><p id="payout-queue-status" role="status">Loading withdrawals…</p><form id="payout-pause-form" class="payout-pause-form" hidden><span id="payout-pause-state"></span><label>Reason<input name="reason" maxlength="2000" required placeholder="Why preparation should pause or resume"></label><button type="submit" class="page-button" id="payout-pause-button">Pause preparation</button><span class="payout-feedback" role="status"></span></form></div><div class="table-tools"><label class="search"><span aria-hidden="true">⌕</span><input id="payout-search" type="search" maxlength="100" value="${esc(payoutDesk.query)}" placeholder="Creator, recipient or withdrawal ID…" aria-label="Search withdrawals"></label><label>Status <select id="payout-filter">${[["all", "All withdrawals"], ["exceptions", "Exceptions"], ...Object.entries(payoutStatusNames)].map(([value, label]) => `<option value="${value}" ${value === payoutDesk.filter ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label></div><div class="table-scroll"><table><thead><tr><th>Creator / withdrawal</th><th>Recipient / route</th><th>Gross limit</th><th>Fee / send · USD</th><th>Transfer status</th><th>Independent checker</th><th>Review deadline · UTC</th><th>Review</th></tr></thead><tbody id="payout-rows"></tbody></table></div><div class="table-footer"><span id="payout-result-count"></span><span>Internal approval does not mean payment was sent.</span></div></section><section id="payout-detail" aria-live="polite"></section><details class="panel payout-enrollment"><summary>Creator withdrawal access</summary><div class="payout-content"><p id="payout-funding-status">Withdrawal balance policy is awaiting confirmation. Enrollment is unavailable until that policy is configured.</p><form id="payout-enrollment-preview"><label>Pulse user ID<input name="userId" type="number" min="1" step="1" required></label><button class="page-button" type="submit" disabled>Preview withdrawal balance</button><span class="payout-feedback" role="status"></span></form><div id="payout-enrollment-result"></div></div></details>`;
}
function renderWithdrawalRows() {
  const target = document.getElementById("payout-rows");
  if (!target) return;
  const query = payoutDesk.query.toLowerCase();
  const records = payoutDesk.records.filter(
    (w) =>
      (payoutDesk.filter === "all" ||
        (payoutDesk.filter === "exceptions"
          ? payoutExceptions(w)
          : payoutDisplayStatus(w) === payoutDesk.filter)) &&
      [
        w.id,
        w.userId,
        w.creatorName,
        payoutRecipientName(w),
        w.route?.country,
        w.route?.countryCode,
      ].some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(query),
      ),
  );
  target.innerHTML =
    records
      .map((w) => {
        const attempt = payoutAttempt(w);
        return `<tr><td><button class="user-button" data-withdrawal="${esc(w.id)}"><span><strong>${esc(w.creatorName || `UID ${w.userId}`)}</strong><small>${esc(w.id)}</small></span></button></td><td>${esc(payoutRecipientName(w))}<small>${esc(w.route?.country || w.route?.countryCode)} · ${esc(w.route?.method)} · ${esc(w.route?.receiveCurrency)}</small></td><td>${esc(catalogMoney(w.grossCents))}</td><td>${w.quote ? `${esc(catalogMoney(w.quote.feeCents))} / ${esc(catalogMoney(w.quote.sendAmountCents))}` : "Actual quote needed"}${w.quote?.taxCents ? `<small>Tax ${esc(catalogMoney(w.quote.taxCents))}</small>` : ""}</td><td><span class="status ${w.status === "delivered" ? "verified" : payoutExceptions(w) ? "payout-exception" : "pending"}">${esc(payoutStatusNames[payoutDisplayStatus(w)] || w.status)}</span>${payoutRecipientErrorMessage(w) ? `<small><strong>Error Message:</strong> ${esc(payoutRecipientErrorMessage(w))}</small>` : ""}</td><td>${esc(w.checker?.status?.replaceAll("_", " ") || "Not checked")}${w.checker?.actor ? `<small>${esc(w.checker.actor)}</small>` : ""}</td><td>${esc(payoutTime(attempt?.evidence?.deadline || w.reviewDeadline))}</td><td><button class="page-button" data-withdrawal="${esc(w.id)}">Open details</button></td></tr>`;
      })
      .join("") ||
    '<tr><td colspan="8" class="empty">No withdrawals match this view.</td></tr>';
  document.getElementById("payout-result-count").textContent =
    `${records.length} shown · ${payoutDesk.records.length} loaded`;
}
async function loadWithdrawals() {
  if (!authorized || section !== "Payout desk") return;
  const version = ++payoutDesk.version;
  const status = document.getElementById("payout-queue-status");
  status.textContent = "Loading withdrawals…";
  try {
    const data = await api("/withdrawals");
    if (
      !authorized ||
      section !== "Payout desk" ||
      version !== payoutDesk.version
    )
      return;
    payoutDesk.records = data.withdrawals;
    payoutDesk.settings = {
      preparationPaused: data.preparationPaused,
      policy: data.policy,
    };
    const unresolved = data.withdrawals.filter(
      (w) =>
        !["delivered", "failed", "canceled", "returned"].includes(w.status),
    );
    document.getElementById("payout-summary").innerHTML =
      `<span><strong>${unresolved.length}</strong> unresolved</span><span><strong>${esc(catalogMoney(unresolved.reduce((sum, w) => sum + w.grossCents, 0)))}</strong> reserved gross</span><span><strong>${data.withdrawals.filter(payoutExceptions).length}</strong> exceptions</span>`;
    status.textContent = `${data.withdrawals.length} withdrawals loaded${data.truncated ? " · Limited to the newest 500 records" : ""}. Preparation ${data.preparationPaused ? "paused" : "active"}. Reconciliation remains available. Repeat withdrawals ${data.policy?.repeatAllowed ? "follow the configured policy" : "await an approved policy"}.`;
    const pauseForm = document.getElementById("payout-pause-form");
    pauseForm.hidden = false;
    document.getElementById("payout-pause-state").textContent =
      data.preparationPaused ? "Preparation paused" : "Preparation active";
    document.getElementById("payout-pause-button").textContent =
      data.preparationPaused ? "Resume preparation" : "Pause preparation";
    const fundingReady = data.policy?.fundingPolicyReady === true;
    const enrollmentButton = document.querySelector(
      "#payout-enrollment-preview button",
    );
    if (enrollmentButton) enrollmentButton.disabled = !fundingReady;
    document.getElementById("payout-funding-status").textContent = fundingReady
      ? "All existing wallet coins can be withdrawn, including bought, gifted and granted coins. 400 coins equal USD 1; USD 15 gross reserves 6,000 coins. Enabling an account does not add or remove coins."
      : "Withdrawal balance policy is awaiting confirmation. Enrollment is unavailable until that policy is configured.";
    renderWithdrawalRows();
    if (["requested", "awaiting_confirmation"].includes(payoutDesk.detail?.status)) {
      const button = document.querySelector(
        '[data-payout-action="prepare"] button',
      );
      if (button) button.disabled = data.preparationPaused || payoutDesk.busy;
    }
  } catch (e) {
    if (version !== payoutDesk.version) return;
    if (accessError(e)) return;
    payoutDesk.records = [];
    payoutDesk.settings = null;
    const enrollmentButton = document.querySelector(
      "#payout-enrollment-preview button",
    );
    if (enrollmentButton) enrollmentButton.disabled = true;
    const prepareButton = document.querySelector(
      '[data-payout-action="prepare"] button',
    );
    if (prepareButton) prepareButton.disabled = true;
    document.getElementById("payout-summary").replaceChildren();
    document.getElementById("payout-pause-form").hidden = true;
    document.getElementById("payout-rows").innerHTML =
      '<tr><td colspan="8" class="empty">Withdrawal queue unavailable. Use Refresh queue to retry.</td></tr>';
    document.getElementById("payout-result-count").textContent =
      "Unable to load withdrawals";
    status.textContent = e.message;
  }
}
function payoutInput(
  name,
  label,
  {
    value = "",
    type = "text",
    required = true,
    maxlength = 200,
    placeholder = "",
    min,
    step,
  } = {},
) {
  return `<label>${esc(label)}<input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${required ? "required" : ""} maxlength="${maxlength}" ${min !== undefined ? `min="${min}"` : ""} ${step ? `step="${step}"` : ""} placeholder="${esc(placeholder)}" ${type === "text" ? 'autocomplete="off"' : ""}></label>`;
}
const payoutUsdInput = (name, label, value) =>
  payoutInput(name, label, {
    value: value === undefined ? "" : (value / 100).toFixed(2),
    placeholder: "0.00",
    maxlength: 12,
  });
const payoutTimestampInput = (name, label) =>
  payoutInput(name, `${label} · UTC`, {
    maxlength: 24,
    placeholder: "YYYY-MM-DDTHH:mm:ssZ",
  });
const payoutEvidence = (
  name = "evidence",
  label = "Provider evidence / observation notes",
  maxlength = 5000,
) =>
  `<label class="payout-wide">${esc(label)}<textarea name="${esc(name)}" required maxlength="${maxlength}" rows="3" placeholder="Record what you independently observed. Keep bank account details with Remitly."></textarea></label>`;
const payoutCheckbox = (name, label, required = false) =>
  `<label class="payout-check"><input name="${esc(name)}" type="checkbox" ${required ? "required" : ""}> ${esc(label)}</label>`;
function payoutForm(
  action,
  title,
  content,
  button,
  { disabled = false, note = "" } = {},
) {
  return `<details class="payout-action"><summary>${esc(title)}</summary><form class="payout-action-form" data-payout-action="${action}">${note ? `<p class="payout-wide">${esc(note)}</p>` : ""}<div class="payout-fields">${content}</div><div class="catalog-actions"><button type="submit" class="primary-button" ${disabled ? "disabled" : ""}>${esc(button)}</button><span class="payout-feedback" role="status"></span></div></form></details>`;
}
function quoteActionForm(w) {
  return payoutForm(
    "quote",
    "Record a fresh signed-in Remitly quote",
    payoutUsdInput("sendAmountCents", "Amount sent · USD") +
      payoutUsdInput("feeCents", "Provider fee · USD") +
      payoutUsdInput("taxCents", "Taxes · USD") +
      payoutUsdInput(
        "promotionalDiscountCents",
        "Promotion · USD (separate from fees)",
      ) +
      payoutInput(
        "receiveAmount",
        `Estimated recipient amount · ${w.route.receiveCurrency}`,
        { maxlength: 40 },
      ) +
      payoutUsdInput(
        "providerMinimumSendCents",
        "Verified route minimum · USD",
      ) +
      payoutInput("sourceUrl", "Signed-in source page", {
        type: "url",
        maxlength: 2000,
        placeholder: "https://www.remitly.com/us/en/transfer/send",
      }) +
      payoutTimestampInput("observedAt", "Quote observed") +
      payoutTimestampInput("expiresAt", "Quote expires") +
      payoutEvidence() +
      payoutCheckbox(
        "actualQuoteConfirmed",
        "I checked this exact send amount, delivery method, funding method, minimum, taxes and recipient amount in the signed-in Business account.",
        true,
      ),
    "Save quote and continue preparation",
    {
      note: "Do not infer a USD 14.01 quote from the saved USD 15 fee sample. The initial withdrawal request authorizes preparation within its amount and selected method. Save the actual quote, then continue preparing. Promotions cannot fund the withdrawal.",
    },
  );
}
function renderWithdrawalDetail() {
  const target = document.getElementById("payout-detail"),
    w = payoutDesk.detail;
  if (!target || !w) return;
  const attempt = payoutAttempt(w),
    q = w.quote,
    checker = w.checker;
  const creatorName =
    w.creatorName ||
    payoutDesk.records.find((r) => r.id === w.id)?.creatorName ||
    `UID ${w.userId}`;
  const facts = [
    ["Creator", `${creatorName} · UID ${w.userId}`],
    ["Legal recipient", payoutRecipientName(w)],
    [
      "Recipient contact",
      [w.recipient?.email, w.recipient?.phone].filter(Boolean).join(" · "),
    ],
    [
      "Provider / country",
      `${w.route?.provider} · ${w.route?.country || w.route?.countryCode}`,
    ],
    [
      "Delivery method / currency",
      `${w.route?.method} · ${w.route?.receiveCurrency}`,
    ],
    [
      "Masked destination",
      w.maskedDestination ||
        attempt?.evidence?.maskedDestination ||
        "Not verified · delivery details stay with Remitly",
    ],
    ["Requested gross limit", catalogMoney(w.grossCents)],
    ...(w.balances
      ? [
          [
            "Available wallet",
            `${w.balances.availableCoins} coins · ${w.balances.availableUsd} USD`,
          ],
          [
            "Reserved wallet",
            `${w.balances.reservedCoins} coins · ${w.balances.reservedUsd} USD`,
          ],
        ]
      : []),
    ["Transfer status", payoutStatusNames[payoutDisplayStatus(w)] || w.status],
    ...(payoutRecipientErrorMessage(w) ? [["Error Message", payoutRecipientErrorMessage(w)], ["Operational status", payoutStatusNames[w.status] || w.status]] : []),
    [
      "Recipient onboarding",
      w.providerOnboardingStatus === "ready"
        ? "Provider readiness verified"
        : "Provider onboarding pending",
    ],
    [
      "Independent checker",
      `${checker?.status?.replaceAll("_", " ") || "Not checked"}${checker?.actor ? ` · ${checker.actor}` : ""}`,
    ],
    ["Review deadline · UTC", payoutTime(attempt?.evidence?.deadline)],
    ["Maker", attempt?.maker || "Not assigned"],
    [
      "Preparation lease · UTC",
      payoutTime(attempt?.leaseUntil || attempt?.lease_until),
    ],
    [
      "Provider reference",
      attempt?.providerReference ||
        attempt?.provider_reference ||
        "Not recorded",
    ],
  ];
  let actions = "";
  if (
    ["awaiting_quote", "awaiting_confirmation", "requested"].includes(w.status)
  )
    actions += quoteActionForm(w);
  if (["requested", "awaiting_confirmation"].includes(w.status) && q)
    actions += payoutForm(
      "prepare",
      "Claim preparation before any provider draft action",
      payoutEvidence("evidence", "Preparation reason / evidence"),
      "Claim preparation",
      {
        disabled: payoutDesk.settings?.preparationPaused !== false,
        note: payoutDesk.settings?.preparationPaused
          ? "Preparation is paused. Reconciliation remains available."
          : "Creates one durable attempt and a 15-minute lease. If creation might have completed during an interruption, record Unknown and inspect provider history before retrying.",
      },
    );
  if (w.status === "preparing")
    actions += payoutForm(
      "preparation",
      "Record the prepared plan or saved one-time draft",
      `<label>Preparation type<select name="kind"><option value="first_time_link">First-time recipient link plan</option><option value="scheduled">Saved one-time scheduled draft</option></select></label>` +
        payoutInput("draftId", "Scheduled draft ID", { required: false }) +
        payoutInput("reviewUrl", "Scheduled draft review URL", {
          type: "url",
          required: false,
          maxlength: 2000,
        }) +
        payoutTimestampInput("deadline", "Human review deadline") +
        payoutInput("historyCoverage", "Provider history coverage inspected", {
          maxlength: 2000,
        }) +
        payoutCheckbox(
          "recipientMatches",
          "Recipient and selected destination match the snapshot.",
          true,
        ) +
        payoutCheckbox(
          "amountsMatch",
          "Send, fee, taxes, currencies and approved quote match.",
          true,
        ) +
        payoutCheckbox(
          "historyInspected",
          "I inspected provider history for pending, paid or uncertain duplicates.",
          true,
        ) +
        payoutCheckbox(
          "oneTime",
          "This is a one-time transfer plan or schedule.",
          true,
        ) +
        payoutCheckbox("autoSendOff", "Auto-send is off.", true) +
        payoutEvidence(),
      "Record preparation",
      {
        disabled: !attempt,
        note: "A first-time link must not be issued at this step. Record the plan for independent checking; the human issues the link after a passed check. A scheduled draft requires its actual draft ID and review URL.",
      },
    );
  if (w.status === "awaiting_human_review") {
    const ownMaker =
      attempt?.maker &&
      attempt.maker ===
        (window.Clerk?.user?.id || window.Clerk?.session?.user?.id);
    actions += payoutForm(
      "check",
      "Record an independent check",
      payoutCheckbox(
        "recipientMatches",
        "Withdrawal, legal recipient and destination match.",
      ) +
        payoutCheckbox(
          "amountsMatch",
          "Gross, send amount, fee, taxes and currencies reconcile.",
        ) +
        payoutCheckbox(
          "reservationMatches",
          "The wallet coins reserved for this withdrawal remain unavailable to spend.",
        ) +
        payoutCheckbox(
          "historyInspected",
          "I independently checked provider history for paid, pending and uncertain duplicates.",
        ) +
        payoutCheckbox(
          "oneTime",
          "The plan or schedule is one-time and the deadline is valid.",
        ) +
        payoutCheckbox("autoSendOff", "Auto-send is off.") +
        payoutInput(
          "historyCoverage",
          "Independent provider history coverage",
          { maxlength: 2000 },
        ) +
        payoutEvidence(),
      "Save independent check",
      {
        disabled: !attempt || ownMaker,
        note: ownMaker
          ? "You prepared this attempt. A different authorized operator must check it."
          : "Confirm only checks you independently verified. Missing checks produce Needs attention. Any changed quote, recipient or draft invalidates the check.",
      },
    );
    if (checker?.status === "passed")
      actions += payoutForm(
        "release",
        "Approve payout and record your manual Remitly action",
        payoutInput("providerLink", "Recipient link (optional)", {
          type: "url",
          required: false,
          maxlength: 2000,
        }) +
          payoutInput("providerReference", "Actual provider reference", {
            required: attempt?.evidence?.kind === "scheduled",
          }) +
          payoutTimestampInput("releasedAt", "Provider action observed") +
          payoutEvidence("evidence", "Human release evidence") +
          payoutCheckbox(
            "humanActionConfirmed",
            "I approve this final payout and have manually issued the link or sent the transfer in Remitly after reviewing the current passed check.",
            true,
          ),
        "Approve and record manual release",
        {
          disabled: !attempt,
          note: "You make the final approve or decline decision. Complete the provider action yourself in Remitly, then record what you did. Remitly emails the first-time recipient link directly; copying it here is optional. Saved-recipient transfers still require the provider reference. Saving this record does not send a payment or verify delivery.",
        },
      );
  }
  if (
    [
      "awaiting_recipient",
      "processing",
      "unknown",
      "expired",
      "delivered",
    ].includes(w.status)
  )
    actions += payoutForm(
      "reconcile",
      "Record a verified provider outcome",
      `<label>Outcome<select name="status">${(w.status === "delivered" ? ["returned"] : ["processing", "delivered", "failed", "canceled"]).map((s) => `<option value="${s}">${esc(payoutStatusNames[s])}</option>`).join("")}</select></label>` +
        payoutInput("providerStatus", "Raw provider status") +
        payoutInput("observationId", "Stable observation ID", {
          placeholder: "Provider reference + observation time",
        }) +
        payoutInput("providerReference", "Provider reference", {
          value:
            attempt?.providerReference || attempt?.provider_reference || "",
        }) +
        payoutInput("activityId", "Provider activity ID", { required: false }) +
        payoutInput("activityUrl", "Provider activity URL", {
          required: false,
          type: "url",
          maxlength: 2000,
        }) +
        payoutInput("sourceUrl", "Signed-in evidence source URL", {
          type: "url",
          maxlength: 2000,
        }) +
        payoutTimestampInput("observedAt", "Provider outcome observed") +
        payoutUsdInput("sendAmountCents", "Actual send amount · USD") +
        payoutUsdInput("feeCents", "Actual provider fee · USD") +
        payoutUsdInput("taxCents", "Actual taxes · USD") +
        payoutInput(
          "receiveAmount",
          `Actual recipient amount · ${w.route.receiveCurrency}`,
          { maxlength: 40 },
        ) +
        payoutCheckbox(
          "recipientMatches",
          "I matched the actual recipient, method, currencies and amounts to the approved withdrawal.",
          true,
        ) +
        payoutCheckbox(
          "fundingReturned",
          "Authoritative failure, cancellation or return and funding return are confirmed (required for those outcomes).",
        ) +
        payoutCheckbox(
          "recipientReady",
          "Provider evidence confirms the saved recipient and delivery method are ready.",
        ) +
        payoutEvidence(),
      "Record provider outcome",
      {
        note: "Only provider evidence confirms delivery. Unknown outcomes retain the reservation and block retries. Failed, canceled and returned outcomes require confirmed funding return. Reuse the same observation ID and identical evidence when retrying an uncertain save.",
      },
    );
  if (
    !["delivered", "failed", "canceled", "returned"].includes(
      w.status,
    )
  )
    actions += payoutForm(
      "unknown",
      "Report an uncertain outcome or rejected recipient details",
      payoutEvidence("reason", "Reason and investigation notes") +
        [["phone", "Phone number"], ["email", "Email address"], ["name", "Legal name"], ["other", "Other recipient details"]].map(([field, label]) =>
          payoutCheckbox(`recipientIssue_${field}`, `Remitly rejected: ${label}`)
        ).join(""),
      "Record unknown outcome",
      {
        note: "Select only recipient fields explicitly rejected by Remitly. The creator sees a safe field-specific error; investigation notes stay protected. Leave all fields unchecked for a generic unknown outcome. Reserved wallet coins stay unavailable to spend. Inspect provider history before correcting contact records or making a replacement attempt.",
      },
    );
  if (payoutRecipientIssueFields(w).length && w.recipientCorrection?.hash && attempt && w.canResolveRecipientError === true)
    actions += payoutForm(
      "resolve-recipient-error",
      "Reconciler recovery after recipient correction",
      payoutInput("observationId", "Stable recovery observation ID") +
        payoutInput("sourceUrl", "Signed-in Remitly evidence source URL", { type: "url", maxlength: 2000 }) +
        payoutTimestampInput("observedAt", "Provider history inspected") +
        payoutInput("historyCoverage", "Provider history coverage inspected", { maxlength: 2000 }) +
        [["historyInspected", "I inspected provider history for this exact withdrawal and prior attempt."],
         ["recipientRecordInspected", "I inspected the saved Remitly recipient record."],
         ["recipientCorrectionApplied", "I applied the creator's pending corrected contact details to the saved Remitly recipient record."],
         ["noRecipientLinkIssued", "No recipient link was issued for this prior attempt."],
         ["noFundsSent", "No funds were sent for this prior attempt."],
         ["noFundingDebit", "No funding debit exists for this prior attempt."],
         ["noPendingTransfers", "No pending transfer exists for this prior attempt."],
         ["noUnknownTransfers", "No uncertain transfer remains for this prior attempt."],
         ["previousDraftClosed", "Every prior draft or recipient link for this attempt is definitively canceled or removed."]]
          .map(([name, label]) => payoutCheckbox(name, label, true)).join("") + payoutEvidence(),
      "Record verified correction recovery",
      { note: "Configured reconcilers only. This preserves reserved coins, closes the prior attempt and returns to a fresh quote. It does not send a payment or make a replacement draft. Human release or provider transfer references block this recovery." },
    );
  const events = w.events || w.history || [];
  if (
    !["delivered", "failed", "canceled", "returned"].includes(w.status) &&
    !events.some((event) => event.action === "human_declined")
  )
    actions += payoutForm(
      "decline",
      "Decline this payout",
      payoutEvidence("reason", "Reason for your final decline decision", 2000) +
        payoutCheckbox(
          "declineConfirmed",
          "I decline this payout as the human decision maker.",
          true,
        ),
      "Decline payout",
      {
        note: attempt
          ? "A provider attempt exists. Declining blocks release and opens cancellation investigation; wallet coins remain reserved until provider history and funding return are confirmed. This action does not cancel or refund a Remitly transfer."
          : "No provider attempt exists. Declining cancels this request and returns its reserved wallet coins once. This action does not send a payment.",
      },
    );
  const issueFields = payoutRecipientIssueFields(w);
  const recipientIssue = issueFields.length
    ? `<section class="payout-callout" role="alert"><strong>Error · Recipient details need attention</strong><p><strong>Error Message:</strong> ${esc(payoutRecipientErrorMessage(w))}</p><p>Verify the saved details and inspect provider history before correction or resuming. Preparation stays blocked until reconciler recovery.</p>${w.recipientCorrection ? `<p><strong>Correction pending reconciler review</strong><br>${w.recipientCorrection.phone ? `Phone: ${esc(w.recipientCorrection.phone)}<br>` : ""}${w.recipientCorrection.email ? `Email: ${esc(w.recipientCorrection.email)}<br>` : ""}Submitted ${esc(payoutTime(w.recipientCorrection.requestedAt))}. The immutable recipient snapshot has not changed.</p>` : '<p>Waiting for the creator to correct the rejected contact details. Legal-name or other recipient issues require operator review.</p>'}</section>` : "";
  target.innerHTML = `<section class="panel payout-detail-panel"><div class="panel-heading"><div><h2>Withdrawal ${esc(w.id)}</h2><p>Version ${esc(w.version)} · Updated ${esc(payoutTime(w.updatedAt))}</p></div><div class="payout-detail-toolbar"><button class="page-button" id="refresh-payout-detail">Refresh details</button><button class="page-button" id="close-payout-detail">Close</button></div></div><div class="payout-content"><dl class="payout-facts">${facts.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>${q ? `<section class="payout-quote"><h3>Current provider quote</h3><p>Send ${esc(catalogMoney(q.sendAmountCents))} + fee ${esc(catalogMoney(q.feeCents))} + tax ${esc(catalogMoney(q.taxCents))} = ${esc(catalogMoney(q.totalEarningsDeductedCents))} total wallet deduction.</p><p>Recipient estimate: ${esc(q.receiveAmount)} ${esc(q.receiveCurrency)} · ${esc(q.fundingMethod)}. Promotion: ${esc(catalogMoney(q.promotionalDiscountCents))}, separate from fees.</p><p>Observed ${esc(payoutTime(q.observedAt))} · Expires ${esc(payoutTime(q.expiresAt))}</p><p class="payout-hash">Quote reference: ${esc(q.hash)}</p></section>` : '<p class="payout-callout">No exact signed-in provider quote recorded. Do not prepare a transfer from catalog fee estimates.</p>'}<div class="payout-links">${attempt?.evidence?.reviewUrl ? payoutLink(attempt.evidence.reviewUrl, "Review in Remitly") : ""}${w.providerLink ? payoutLink(w.providerLink, "Recipient link") : ""}${events.findLast((e) => e.evidence?.activityUrl)?.evidence?.activityUrl ? payoutLink(events.findLast((e) => e.evidence?.activityUrl).evidence.activityUrl, "Provider activity") : ""}</div>${["unknown", "expired"].includes(w.status) ? `<p class="payout-callout">${w.status === "expired" ? "Expired withdrawal" : "Unknown outcome"}: reservation retained. Replacement preparation is blocked until provider history resolves the existing attempt.</p>` : ""}${recipientIssue}${actions}<details class="payout-history"><summary>Evidence and history (${events.length} events)</summary>${events.map((e) => `<article><strong>${esc(e.action?.replaceAll("_", " "))}</strong><small>${esc(payoutTime(e.createdAt || e.created_at))}${e.actor ? ` · ${esc(e.actor)}` : ""}</small>${e.evidence ? `<pre>${esc(typeof e.evidence === "string" ? e.evidence : JSON.stringify(e.evidence, null, 2))}</pre>` : ""}</article>`).join("") || "<p>No events recorded.</p>"}</details></div></section>`;
}
async function loadWithdrawalDetail(id) {
  if (!authorized || section !== "Payout desk") return;
  const version = ++payoutDesk.detailVersion;
  payoutDesk.detail = null;
  const target = document.getElementById("payout-detail");
  target.innerHTML =
    '<section class="panel payout-content">Loading withdrawal details…</section>';
  try {
    const data = await api("/withdrawals/" + encodeURIComponent(id));
    if (
      !authorized ||
      section !== "Payout desk" ||
      version !== payoutDesk.detailVersion
    )
      return;
    payoutDesk.detail = data;
    renderWithdrawalDetail();
  } catch (e) {
    if (version !== payoutDesk.detailVersion) return;
    if (accessError(e)) return;
    target.innerHTML = `<section class="panel payout-content"><p>${esc(e.message)}</p><button class="page-button" data-withdrawal="${esc(id)}">Retry details</button></section>`;
  }
}
function payoutDecimalCents(value, label) {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value))
    throw new Error(
      `${label} must be an exact USD amount with at most two decimal places.`,
    );
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount > 1500)
    throw new Error(`${label} exceeds the USD 15 limit.`);
  return amount;
}
function payoutTimestamp(value, label) {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error(`${label} must be a UTC ISO timestamp.`);
  return new Date(value).toISOString();
}
async function submitPayoutAction(form) {
  if (
    !authorized ||
    section !== "Payout desk" ||
    payoutDesk.busy ||
    !payoutDesk.detail
  )
    return;
  const w = payoutDesk.detail,
    attempt = payoutAttempt(w),
    version = payoutDesk.detailVersion,
    action = form.dataset.payoutAction;
  const values = new FormData(form),
    get = (name) => String(values.get(name) ?? "").trim(),
    checked = (name) => values.has(name);
  const feedback = form.querySelector(".payout-feedback");
  let body;
  try {
    if (action === "quote") {
      body = {
        methodId: w.methodId,
        receiveCurrency: w.route.receiveCurrency,
        fundingMethod: w.route.fundingMethod,
        source: "signed_in_remitly_business",
        sourceUrl: get("sourceUrl"),
        receiveAmount: get("receiveAmount"),
        observedAt: payoutTimestamp(get("observedAt"), "Observation time"),
        expiresAt: payoutTimestamp(get("expiresAt"), "Expiry"),
        evidence: get("evidence"),
      };
      [
        "sendAmountCents",
        "feeCents",
        "taxCents",
        "promotionalDiscountCents",
        "providerMinimumSendCents",
      ].forEach((k) => (body[k] = payoutDecimalCents(get(k), k)));
      if (body.sendAmountCents + body.feeCents + body.taxCents > 1500)
        throw new Error(
          "Send, fee and taxes must fit the USD 15 total wallet deduction.",
        );
    } else if (action === "prepare") {
      if (payoutDesk.settings?.preparationPaused !== false)
        throw new Error(
          "Refresh the queue to confirm that preparation is active.",
        );
      body = { quoteHash: w.quote?.hash, evidence: get("evidence") };
    } else if (action === "unknown" || action === "decline") {
      body = { reason: get("reason") };
      if (action === "unknown") {
        const fields = ["phone", "email", "name", "other"].filter(field => checked(`recipientIssue_${field}`));
        if (fields.length) body.recipientIssue = { code: "recipient_validation_failed", fields };
      }
    } else if (action === "resolve-recipient-error") {
      if (!attempt || !w.recipientCorrection?.hash || w.canResolveRecipientError !== true || !payoutRecipientIssueFields(w).length)
        throw new Error("Refresh details to confirm current reconciler permission and pending correction.");
      body = {
        attemptId: attempt.id,
        correctionHash: w.recipientCorrection.hash,
        observationId: get("observationId"),
        sourceUrl: get("sourceUrl"),
        observedAt: payoutTimestamp(get("observedAt"), "Provider history inspection time"),
        evidence: get("evidence"),
        historyCoverage: get("historyCoverage"),
      };
      ["historyInspected", "recipientRecordInspected", "recipientCorrectionApplied", "noRecipientLinkIssued", "noFundsSent", "noFundingDebit", "noPendingTransfers", "noUnknownTransfers", "previousDraftClosed"].forEach(name => {
        if (!checked(name)) throw new Error("Confirm every independent recovery check before proceeding.");
        body[name] = true;
      });
    } else if (action === "preparation") {
      if (!attempt)
        throw new Error("Reload the active preparation attempt first.");
      body = {
        attemptId: attempt.id,
        quoteHash: w.quote?.hash,
        kind: get("kind"),
        deadline: payoutTimestamp(get("deadline"), "Review deadline"),
        oneTime: checked("oneTime"),
        autoSend: !checked("autoSendOff"),
        recipientMatches: checked("recipientMatches"),
        amountsMatch: checked("amountsMatch"),
        historyInspected: checked("historyInspected"),
        historyCoverage: get("historyCoverage"),
        evidence: get("evidence"),
      };
      if (get("draftId")) body.draftId = get("draftId");
      if (get("reviewUrl")) body.reviewUrl = get("reviewUrl");
      if (body.kind === "scheduled" && (!body.draftId || !body.reviewUrl))
        throw new Error(
          "A scheduled draft requires its actual ID and review URL.",
        );
    } else if (action === "check") {
      if (!attempt)
        throw new Error("Reload the active preparation attempt first.");
      body = {
        attemptId: attempt.id,
        quoteHash: w.quote?.hash,
        recipientMatches: checked("recipientMatches"),
        amountsMatch: checked("amountsMatch"),
        reservationMatches: checked("reservationMatches"),
        historyInspected: checked("historyInspected"),
        oneTime: checked("oneTime"),
        autoSend: !checked("autoSendOff"),
        historyCoverage: get("historyCoverage"),
        evidence: get("evidence"),
      };
    } else if (action === "release") {
      if (!attempt)
        throw new Error("Reload the checked preparation attempt first.");
      body = {
        attemptId: attempt.id,
        quoteHash: w.quote?.hash,
        releasedAt: payoutTimestamp(get("releasedAt"), "Provider action time"),
        evidence: get("evidence"),
      };
      if (get("providerLink")) body.providerLink = get("providerLink");
      if (get("providerReference"))
        body.providerReference = get("providerReference");
    } else if (action === "reconcile") {
      body = {
        observationId: get("observationId"),
        status: get("status"),
        providerStatus: get("providerStatus"),
        providerReference: get("providerReference"),
        sourceUrl: get("sourceUrl"),
        observedAt: payoutTimestamp(
          get("observedAt"),
          "Provider observation time",
        ),
        recipientMatches: checked("recipientMatches"),
        methodId: w.methodId,
        receiveCurrency: w.route.receiveCurrency,
        receiveAmount: get("receiveAmount"),
        fundingReturned: checked("fundingReturned"),
        recipientReady: checked("recipientReady"),
        evidence: get("evidence"),
      };
      ["sendAmountCents", "feeCents", "taxCents"].forEach(
        (k) => (body[k] = payoutDecimalCents(get(k), k)),
      );
      if (get("activityId")) body.activityId = get("activityId");
      if (get("activityUrl")) body.activityUrl = get("activityUrl");
      if (
        ["failed", "canceled", "returned"].includes(body.status) &&
        !body.fundingReturned
      )
        throw new Error(
          "Confirm authoritative funding return before recording this outcome.",
        );
    } else return;
  } catch (e) {
    feedback.textContent = e.message;
    return;
  }
  payoutDesk.busy = true;
  const mutationVersion = ++payoutDesk.mutationVersion;
  const buttons = [
    ...document.querySelectorAll(".payout-action-form button"),
  ].map((button) => ({ button, disabled: button.disabled }));
  buttons.forEach(({ button }) => (button.disabled = true));
  feedback.textContent = "Saving verified record…";
  try {
    await api(`/withdrawals/${encodeURIComponent(w.id)}/${action}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (
      !authorized ||
      section !== "Payout desk" ||
      version !== payoutDesk.detailVersion
    )
      return;
    await loadWithdrawalDetail(w.id);
    await loadWithdrawals();
  } catch (e) {
    if (version !== payoutDesk.detailVersion) return;
    if (accessError(e)) return;
    feedback.textContent =
      e.status === 409
        ? `${e.message} Refresh details before proceeding.`
        : e.status
          ? e.message
          : "Save outcome uncertain. Refresh details before retrying; if a provider action may have completed, record Unknown and investigate.";
  } finally {
    if (mutationVersion === payoutDesk.mutationVersion) payoutDesk.busy = false;
    if (form.isConnected)
      buttons.forEach(({ button, disabled }) => (button.disabled = disabled));
  }
}
async function submitEnrollmentPreview(form) {
  if (payoutDesk.settings?.policy?.fundingPolicyReady !== true) {
    form.querySelector(".payout-feedback").textContent =
      "Withdrawal balance policy must be configured before enrollment.";
    return;
  }
  const version = payoutDesk.version,
    feedback = form.querySelector(".payout-feedback"),
    uid = Number(form.elements.userId.value);
  payoutDesk.enrollment = null;
  document.getElementById("payout-enrollment-result").replaceChildren();
  feedback.textContent = "Loading current wallet balance…";
  form.querySelector("button").disabled = true;
  try {
    const p = await api(
      "/withdrawals/enrollment-preview?" +
        new URLSearchParams({ userId: String(uid) }),
    );
    if (
      !authorized ||
      section !== "Payout desk" ||
      version !== payoutDesk.version ||
      Number(form.elements.userId.value) !== uid
    )
      return;
    payoutDesk.enrollment = p;
    feedback.textContent = "Preview loaded. No balance was changed.";
    document.getElementById("payout-enrollment-result").innerHTML =
      `<section class="payout-quote"><h3>${esc(p.name)} · UID ${esc(p.userId)}</h3><p>Current wallet balance: ${esc(p.walletCoins)} coins · Available wallet value: ${esc(p.availableUsd)} USD</p><p>${p.alreadyEnrolled ? "This account already has withdrawal access." : "Enable this account only. Enrollment does not credit earnings, debit the wallet or add a settlement hold. A USD 15 request reserves 6,000 existing wallet coins when the user submits it."}</p>${p.alreadyEnrolled ? "" : `<form id="payout-enrollment-confirm"><div class="payout-fields">${payoutEvidence("reason", "Reason for enabling this actual account", 2000)}${payoutCheckbox("enrollmentConfirmed", "I authorize withdrawal access for this account using the previewed wallet balance, without adding or removing coins.", true)}</div><div class="catalog-actions"><button type="submit" class="primary-button">Enable this account</button><span class="payout-feedback" role="status"></span></div></form>`}</section>`;
  } catch (e) {
    if (version !== payoutDesk.version) return;
    if (accessError(e)) return;
    feedback.textContent = e.message;
  } finally {
    if (form.isConnected) form.querySelector("button").disabled = false;
  }
}
document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!authorized || section !== "Payout desk") return;
  if (
    !form.matches(
      ".payout-action-form,#payout-pause-form,#payout-enrollment-preview,#payout-enrollment-confirm",
    )
  )
    return;
  event.preventDefault();
  if (form.matches(".payout-action-form")) return submitPayoutAction(form);
  if (form.id === "payout-enrollment-preview")
    return submitEnrollmentPreview(form);
  const version = payoutDesk.version,
    feedback = form.querySelector(".payout-feedback"),
    button = form.querySelector("button");
  button.disabled = true;
  try {
    if (form.id === "payout-pause-form") {
      if (!payoutDesk.settings) return;
      await api("/withdrawals/pause", {
        method: "POST",
        body: JSON.stringify({
          paused: !payoutDesk.settings.preparationPaused,
          reason: form.elements.reason.value.trim(),
        }),
      });
      if (authorized && version === payoutDesk.version) await loadWithdrawals();
    } else {
      const p = payoutDesk.enrollment;
      if (
        payoutDesk.settings?.policy?.fundingPolicyReady !== true ||
        !p ||
        p.alreadyEnrolled
      )
        return;
      await api("/withdrawals/enroll", {
        method: "POST",
        body: JSON.stringify({
          userId: p.userId,
          expectedWalletCoins: p.walletCoins,
          reason: form.elements.reason.value.trim(),
        }),
      });
      if (!authorized || version !== payoutDesk.version) return;
      payoutDesk.enrollment = null;
      document.getElementById("payout-enrollment-result").innerHTML =
        '<p role="status">Withdrawal access enabled for this account. Its wallet balance is unchanged. The user completes recipient setup and requests their own withdrawal in Pulse.</p>';
    }
  } catch (e) {
    if (version !== payoutDesk.version) return;
    if (accessError(e)) return;
    feedback.textContent =
      e.status === 409
        ? `${e.message} Preview or refresh again before retrying.`
        : e.message;
  } finally {
    if (form.isConnected) button.disabled = false;
  }
});
document.addEventListener("input", (event) => {
  if (!authorized || section !== "Payout desk") return;
  if (event.target.id === "payout-search") {
    payoutDesk.query = event.target.value.trim();
    renderWithdrawalRows();
  }
  if (
    event.target.closest("#payout-enrollment-preview") &&
    event.target.name === "userId"
  ) {
    payoutDesk.enrollment = null;
    document.getElementById("payout-enrollment-result").replaceChildren();
  }
});
document.addEventListener("change", (event) => {
  if (
    authorized &&
    section === "Payout desk" &&
    event.target.id === "payout-filter"
  ) {
    payoutDesk.filter = event.target.value;
    renderWithdrawalRows();
  }
});
document.addEventListener("click", (event) => {
  if (!authorized || section !== "Payout desk") return;
  const row = event.target.closest("[data-withdrawal]");
  if (row) loadWithdrawalDetail(row.dataset.withdrawal);
  if (event.target.id === "refresh-withdrawals") loadWithdrawals();
  if (event.target.id === "refresh-payout-detail" && payoutDesk.detail)
    loadWithdrawalDetail(payoutDesk.detail.id);
  if (event.target.id === "close-payout-detail") {
    payoutDesk.detailVersion++;
    payoutDesk.detail = null;
    document.getElementById("payout-detail").replaceChildren();
  }
});

function resetOperatorCredentials() {
  operatorCredentials.version++;
  operatorCredentials.busy = false;
  operatorCredentials.records = [];
  operatorCredentials.token = null;
}
function operatorCredentialsPage() {
  return `<section class="panel"><div class="panel-heading"><div><h2>Scheduled payout operators</h2><p>Separate maker, checker and reconciler credentials. None can approve or send a payout.</p></div><button class="page-button" id="refresh-operators">Refresh</button></div><div class="payout-content"><p>Connect Codex on your Mac to <strong>${esc(location.origin)}/api/payout-mcp</strong>. Store each credential in macOS Keychain and configure one role per scheduled job. Revocation stops future operator calls.</p><form id="issue-operator" class="payout-fields"><label>Operator name<input name="name" required maxlength="80" autocomplete="off" placeholder="Mac maker"/></label><label>Role<select name="role"><option value="maker">Maker · prepare</option><option value="checker">Checker · independent review</option><option value="reconciler">Reconciler · verify outcomes</option></select></label><label>Expires · UTC<input name="expiresAt" type="text" placeholder="Blank: 7 days; maximum 30 days" autocomplete="off"/></label><div class="payout-wide"><button type="submit" class="primary-button">Issue operator credential</button><p id="operator-feedback" role="status"></p></div></form><div id="operator-secret"></div><div id="operator-records">Loading operators…</div></div></section>`;
}
function renderOperatorCredentials() {
  const target = document.getElementById("operator-records");
  if (!target) return;
  target.innerHTML = `<div class="table-scroll"><table><thead><tr><th>Operator</th><th>Scope</th><th>Expires · UTC</th><th>Last used</th><th>Access</th></tr></thead><tbody>${operatorCredentials.records.map((record) => `<tr><td>${esc(record.name)}<small>${esc(record.role)} · ${esc(record.id)}</small></td><td>${esc(record.environment)}<small>${esc(record.accountKey)}</small></td><td>${esc(payoutTime(record.expiresAt))}</td><td>${esc(payoutTime(record.lastUsedAt))}</td><td>${record.revokedAt ? "Revoked" : Date.parse(record.expiresAt) <= Date.now() ? "Expired" : `<button class="page-button" data-revoke-operator="${esc(record.id)}">Revoke</button>`}</td></tr>`).join("") || '<tr><td colspan="5">No operator credentials issued.</td></tr>'}</tbody></table></div>`;
}
async function loadOperatorCredentials() {
  if (!authorized || section !== "Payout operators") return;
  const version = ++operatorCredentials.version;
  try {
    const data = await api("/payout-operators");
    if (
      !authorized ||
      section !== "Payout operators" ||
      version !== operatorCredentials.version
    )
      return;
    operatorCredentials.records = data.credentials;
    renderOperatorCredentials();
  } catch (error) {
    if (version !== operatorCredentials.version || accessError(error)) return;
    const target = document.getElementById("operator-records");
    if (target) target.textContent = error.message;
  }
}
document.addEventListener("submit", async (event) => {
  if (!event.target.matches("#issue-operator")) return;
  event.preventDefault();
  if (!authorized || section !== "Payout operators" || operatorCredentials.busy)
    return;
  const form = event.target,
    values = new FormData(form),
    version = operatorCredentials.version;
  const button = form.querySelector("button[type=submit]"),
    feedback = document.getElementById("operator-feedback");
  const busy = {};
  operatorCredentials.busy = busy;
  operatorCredentials.token = null;
  document.getElementById("operator-secret").replaceChildren();
  button.disabled = true;
  feedback.textContent = "Issuing scoped credential…";
  try {
    const expiresAt = String(values.get("expiresAt") || "").trim();
    const body = {
      name: String(values.get("name") || "").trim(),
      role: String(values.get("role")),
      ...(expiresAt ? { expiresAt } : {}),
    };
    const result = await api("/payout-operators/issue", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (
      !authorized ||
      section !== "Payout operators" ||
      version !== operatorCredentials.version
    )
      return;
    operatorCredentials.token = result.token;
    const secret = document.getElementById("operator-secret");
    secret.innerHTML =
      '<section class="payout-quote"><h3>Credential shown once</h3><p>Save this in macOS Keychain now. It disappears when you hide or leave this page and cannot be retrieved later.</p><label>Operator credential<input id="operator-token" type="password" readonly autocomplete="off" spellcheck="false"/></label><div class="catalog-actions"><button class="page-button" id="copy-operator-token">Copy credential</button><button class="page-button" id="dismiss-operator-token">Dismiss</button></div><p id="operator-copy-feedback" role="status"></p></section>';
    document.getElementById("operator-token").value = result.token;
    feedback.textContent =
      "Credential issued. Human payout approval remains separate.";
    form.reset();
    await loadOperatorCredentials();
  } catch (error) {
    if (
      !authorized ||
      version !== operatorCredentials.version ||
      accessError(error)
    )
      return;
    feedback.textContent = `${error.message} If a save may have completed without showing its credential, refresh and revoke that entry before issuing another.`;
  } finally {
    if (form.isConnected) button.disabled = false;
    if (operatorCredentials.busy === busy) operatorCredentials.busy = false;
  }
});
document.addEventListener("click", async (event) => {
  if (!authorized || section !== "Payout operators") return;
  if (event.target.id === "refresh-operators" && !operatorCredentials.busy)
    return loadOperatorCredentials();
  if (event.target.id === "dismiss-operator-token") {
    operatorCredentials.token = null;
    document.getElementById("operator-secret").replaceChildren();
    return;
  }
  if (event.target.id === "copy-operator-token" && operatorCredentials.token) {
    const feedback = document.getElementById("operator-copy-feedback");
    try {
      await navigator.clipboard.writeText(operatorCredentials.token);
      if (feedback.isConnected)
        feedback.textContent = "Copied. Save in Keychain, then dismiss.";
    } catch {
      if (feedback.isConnected)
        feedback.textContent =
          "Clipboard unavailable. Select the credential field to copy it manually.";
    }
    return;
  }
  const id = event.target.closest("[data-revoke-operator]")?.dataset
    .revokeOperator;
  if (!id || operatorCredentials.busy) return;
  if (
    !confirm(
      "Revoke this operator credential? Future calls will be denied. Existing payout reservations and uncertain attempts remain for review.",
    )
  )
    return;
  const version = operatorCredentials.version,
    busy = {};
  operatorCredentials.busy = busy;
  try {
    await api("/payout-operators/" + encodeURIComponent(id) + "/revoke", {
      method: "POST",
      body: "{}",
    });
    if (authorized && version === operatorCredentials.version) {
      operatorCredentials.token = null;
      document.getElementById("operator-secret").replaceChildren();
      await loadOperatorCredentials();
    }
  } catch (error) {
    if (version === operatorCredentials.version && !accessError(error))
      document.getElementById("operator-feedback").textContent = error.message;
  } finally {
    if (operatorCredentials.busy === busy) operatorCredentials.busy = false;
  }
});

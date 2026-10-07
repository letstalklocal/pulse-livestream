import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { objectStorageClient } from "./objectStorage";
import { loadLegacyGiftAssets } from "./legacyGiftAssets";

export interface GiftDb {
  query: (sql: string, values?: any[]) => Promise<any>;
}
export class GiftCatalogError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = status === 409 ? "GIFT_CHANGED" : "INVALID_GIFT",
  ) {
    super(message);
  }
}
export const GIFT_UPLOAD_LIMITS = {
  thumbnail: 4 * 1024 * 1024,
  animation: 30 * 1024 * 1024,
  sound: 8 * 1024 * 1024,
  maxDurationMs: 60000,
};
const ident = (v: unknown) => {
  if (typeof v !== "string" || !/^[a-z][a-z0-9_-]{0,79}$/.test(v))
    throw new GiftCatalogError("Use a stable lowercase identifier.");
  return v;
};
const name = (v: unknown) => {
  if (typeof v !== "string" || !v.trim() || v.length > 100)
    throw new GiftCatalogError("Provide a name of 1–100 characters.");
  return v.trim();
};
const integer = (v: unknown, min = 0) => {
  if (!Number.isSafeInteger(v) || Number(v) < min || Number(v) > 2147483647)
    throw new GiftCatalogError("Provide a valid integer.");
  return Number(v);
};
function knownFields(input: any, allowed: string[]) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !allowed.includes(k))
  )
    throw new GiftCatalogError("Unknown or invalid catalog fields.");
}
export function validateGiftFraming(v: any = {}) {
  const f = {
    preset: v.preset ?? "contained",
    scale: v.scale ?? 1,
    x: v.x ?? 0,
    y: v.y ?? 0,
  };
  if (
    !["contained", "fullscreen"].includes(f.preset) ||
    !Number.isFinite(f.scale) ||
    f.scale < 0.25 ||
    f.scale > 3 ||
    !Number.isFinite(f.x) ||
    !Number.isFinite(f.y) ||
    Math.abs(f.x) > 1 ||
    Math.abs(f.y) > 1
  )
    throw new GiftCatalogError("Invalid framing preset, scale or position.");
  return f;
}
const audit = (db: GiftDb, actor: string, action: string, target: string) =>
  db.query(
    "INSERT INTO admin_audit_events(actor_clerk_id,action,target,outcome) VALUES($1,$2,$3,'allowed')",
    [actor, `gifts.${action}`, target],
  );
export const lockGiftCatalog = (db: GiftDb) =>
  db.query("SELECT pg_advisory_xact_lock(731007)");
const bump = (db: GiftDb) =>
  db.query("UPDATE gift_catalog_state SET version=version+1 WHERE id=1");
export function giftAssetDto(a: any) {
  return a
    ? {
        id: a.id,
        url: `/api/gift-catalog/assets/${a.id}`,
        kind: a.kind,
        format: a.format,
        sha256: a.sha256,
        byteSize: a.byte_size,
        durationMs: a.duration_ms,
        width: a.width,
        height: a.height,
        audioAssetId: a.audio_asset_id ?? null,
        ...(a.format === "packed-alpha-mp4"
          ? { maskLayout: "left-alpha-right-color" }
          : {}),
      }
    : null;
}
// Resolve immutable assets in the same statement as the revision. This avoids
// extra network round trips while a paid gift holds the existing transaction locks.
const giftRevisionSelect = `SELECT r.*,g.legacy,g.current_revision_id,
  g.collection_id AS active_collection_id,
  COALESCE((SELECT jsonb_agg(a) FROM gift_assets a
    WHERE a.id IN(r.thumbnail_asset_id,r.android_asset_id,r.ios_asset_id,r.sound_asset_id)
    OR a.id IN(SELECT linked.audio_asset_id FROM gift_assets linked
      WHERE linked.id IN(r.thumbnail_asset_id,r.android_asset_id,r.ios_asset_id,r.sound_asset_id))), '[]'::jsonb) AS assets
  FROM gift_revisions r JOIN catalog_gifts g ON g.id=r.gift_id
  JOIN gift_collections c ON c.id=g.collection_id`;
function giftFromRevisionRow(r: any) {
  const assets: any[] = r.assets;
  const asset = (id: string) =>
    giftAssetDto(assets.find((a: any) => a.id === id));
  const embedded =
    assets.find((a: any) => a.id === r.android_asset_id)?.audio_asset_id ??
    assets.find((a: any) => a.id === r.ios_asset_id)?.audio_asset_id;
  return {
    id: r.gift_id,
    revisionId: r.id,
    type: giftRevisionType(r),
    name: r.name,
    emoji: r.emoji,
    coinCost: r.coin_cost,
    thumbnail: asset(r.thumbnail_asset_id),
    androidAnimation: asset(r.android_asset_id),
    iosAnimation: asset(r.ios_asset_id),
    sound: asset(r.sound_asset_id ?? embedded),
    framing: r.framing,
    legacy: r.legacy,
  };
}
export async function readGiftRevision(db: GiftDb, id: string) {
  const r = (await db.query(`${giftRevisionSelect} WHERE r.id=$1`, [id])).rows[0];
  if (!r) throw new GiftCatalogError("Gift revision not found.", 404);
  return giftFromRevisionRow(r);
}
export async function resolvePublishedGift(
  db: GiftDb,
  giftId: string,
  revisionId?: string,
  expectedCoinCost?: number,
) {
  await lockGiftCatalog(db);
  const g = (
    await db.query(
      `${giftRevisionSelect} WHERE g.id=$1 AND r.id=g.current_revision_id AND g.status='published' AND c.status='published'`,
      [giftId],
    )
  ).rows[0];
  if (!g)
    throw new GiftCatalogError(
      "Gift is unavailable. Refresh the catalog.",
      400,
    );
  if (
    (!revisionId &&
      (!g.legacy || g.current_revision_id !== `${giftId}_legacy_v1`)) ||
    (revisionId && revisionId !== g.current_revision_id)
  )
    throw new GiftCatalogError(
      "Gift changed. Refresh and confirm the current gift.",
      409,
    );
  const gift = giftFromRevisionRow(g);
  if (expectedCoinCost !== undefined && expectedCoinCost !== gift.coinCost)
    throw new GiftCatalogError(
      "Gift price changed. Refresh and confirm the price.",
      409,
    );
  return gift;
}
export function selectPlatformGift(
  g: any,
  platform: string,
  caps: string[] = [],
) {
  const animation =
    platform === "android"
      ? g.androidAnimation
      : platform === "ios"
        ? g.iosAnimation
        : null;
  return {
    ...g,
    animation: animation && caps.includes(animation.format) ? animation : null,
  };
}
export async function readPublishedGiftCatalog(
  db: GiftDb,
  platform: string,
  caps: string[],
) {
  await lockGiftCatalog(db);
  const collections = (
    await db.query(
      "SELECT * FROM gift_collections WHERE status='published' ORDER BY locked DESC,sort_order,id",
    )
  ).rows;
  const gifts = (
    await db.query(
      `${giftRevisionSelect} WHERE r.id=g.current_revision_id AND g.status='published' AND c.status='published' ORDER BY r.coin_cost,g.sort_order,g.id`,
    )
  ).rows;
  const version = String(
    (await db.query("SELECT version FROM gift_catalog_state WHERE id=1"))
      .rows[0]?.version ?? 1,
  );
  return {
    version,
    collections: collections.map((c: any) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sort_order,
        locked: c.locked,
        gifts: gifts
            .filter((g: any) => g.active_collection_id === c.id)
            .map((g: any) =>
              selectPlatformGift(
                giftFromRevisionRow(g),
                platform,
                caps,
              ),
            ),
      })),
  };
}
export async function readAdminGiftCatalog(db: GiftDb, actor: string) {
  await audit(db, actor, "view", "catalog");
  const collections = (
    await db.query(
      "SELECT * FROM gift_collections ORDER BY locked DESC,sort_order,id",
    )
  ).rows.map((c: any) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sort_order,
    locked: c.locked,
    status: c.status,
  }));
  const gifts = (
    await db.query("SELECT * FROM catalog_gifts ORDER BY sort_order,id")
  ).rows.map((g: any) => ({
    id: g.id,
    collectionId: g.collection_id,
    sortOrder: g.sort_order,
    status: g.status,
    currentRevisionId: g.current_revision_id,
    draftRevisionId: g.draft_revision_id,
    legacy: g.legacy,
  }));
  const rawRevisions = (
    await db.query("SELECT * FROM gift_revisions ORDER BY created_at DESC")
  ).rows;
  const ownedAssets = (
    await db.query(
      "SELECT * FROM gift_assets WHERE owner_clerk_id=$1 ORDER BY created_at DESC",
      [actor],
    )
  ).rows;
  const originals = await loadLegacyGiftAssets();
  const imported = originals.map(original => ({ ...original, asset: ownedAssets.find((a: any) => a.sha256 === original.sha256 && a.kind === original.kind && a.format === original.format) }));
  const revisions = rawRevisions.map((row: any) => {
    const revision = revisionDto(row);
    if (!gifts.some((g: any) => g.id === row.gift_id && g.legacy)) return revision;
    const artwork = imported.find(original => original.giftId === row.gift_id && original.kind === "thumbnail")?.asset;
    const animation = imported.find(original => original.giftId === row.gift_id && original.kind === "animation")?.asset;
    // Editor defaults only: immutable published revisions and old receipts stay untouched.
    return { ...revision, thumbnailAssetId: revision.thumbnailAssetId ?? artwork?.id ?? null,
      androidAssetId: revision.androidAssetId ?? (revision.type === "animation" ? animation?.id : null) ?? null,
      iosAssetId: revision.iosAssetId ?? (revision.type === "animation" ? animation?.id : null) ?? null };
  });
  const assets = ownedAssets.map((a: any) => {
    const original = imported.find(source => source.asset?.id === a.id);
    return { ...giftAssetDto(a), label: a.original_filename ?? original?.label ?? null,
      fileName: a.original_filename ?? original?.file.split("/").pop() ?? null,
      isDefaultSound: original?.giftId === "__default_sound" };
  });
  return { collections, gifts, revisions, assets, limits: GIFT_UPLOAD_LIMITS };
}
export async function importExistingGiftAssets(db: GiftDb, actor: string, upload = uploadManagedGiftAsset) {
  await lockGiftCatalog(db);
  let imported = 0;
  for (const source of await loadLegacyGiftAssets()) {
    const exists = await db.query("SELECT id FROM gift_assets WHERE owner_clerk_id=$1 AND sha256=$2 AND kind=$3 AND format=$4", [actor, source.sha256, source.kind, source.format]);
    if (exists.rows.length) continue;
    await upload(db, actor, source.bytes, source.kind, source.format, source.file.split("/").pop());
    imported++;
  }
  return { imported };
}
function giftRevisionType(r: any): "image" | "animation" {
  return r.gift_type ?? (r.android_asset_id || r.ios_asset_id || ["kisses", "luxury_rocket", "dragon"].includes(r.gift_id) ? "animation" : "image");
}
export function revisionDto(r: any) {
  return {
    id: r.id,
    giftId: r.gift_id,
    type: giftRevisionType(r),
    collectionId: r.collection_id,
    sortOrder: r.sort_order,
    name: r.name,
    emoji: r.emoji,
    coinCost: r.coin_cost,
    thumbnailAssetId: r.thumbnail_asset_id,
    androidAssetId: r.android_asset_id,
    iosAssetId: r.ios_asset_id,
    soundAssetId: r.sound_asset_id,
    framing: r.framing,
    createdAt: r.created_at,
  };
}
export async function reorderManagedGifts(
  db: GiftDb,
  actor: string,
  collectionId: string,
  ids: any,
) {
  await lockGiftCatalog(db);
  ident(collectionId);
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length)
    throw new GiftCatalogError("Include each gift once.");
  const existing = (
    await db.query("SELECT id FROM catalog_gifts WHERE collection_id=$1", [
      collectionId,
    ])
  ).rows.map((r: any) => r.id);
  if (
    ids.length !== existing.length ||
    ids.some((id) => !existing.includes(id))
  )
    throw new GiftCatalogError("Include every collection gift once.");
  for (let i = 0; i < ids.length; i++)
    await db.query("UPDATE catalog_gifts SET sort_order=$2 WHERE id=$1", [
      ids[i],
      i,
    ]);
  await bump(db);
  await audit(db, actor, "gift.reorder", collectionId);
  return { ok: true };
}
export async function mutateGiftCollection(
  db: GiftDb,
  actor: string,
  id: string,
  input: any,
  create = false,
) {
  knownFields(input, ["id", "name", "sortOrder", "status"]);
  await lockGiftCatalog(db);
  ident(id);
  if (create && id === "test")
    throw new GiftCatalogError(
      "Test is reserved for native playback previews.",
    );
  if (create)
    await db.query(
      "INSERT INTO gift_collections(id,name,sort_order) VALUES($1,$2,$3)",
      [id, name(input.name), integer(input.sortOrder ?? 1)],
    );
  else {
    const c = (
      await db.query("SELECT * FROM gift_collections WHERE id=$1 FOR UPDATE", [
        id,
      ])
    ).rows[0];
    if (!c) throw new GiftCatalogError("Collection not found.", 404);
    if (c.locked)
      throw new GiftCatalogError("Popular is locked and always first.", 409);
    const status = input.status ?? c.status;
    if (!["draft", "published", "archived"].includes(status))
      throw new GiftCatalogError("Invalid status.");
    await db.query(
      "UPDATE gift_collections SET name=$2,sort_order=$3,status=$4 WHERE id=$1",
      [
        id,
        name(input.name ?? c.name),
        integer(input.sortOrder ?? c.sort_order),
        status,
      ],
    );
  }
  await bump(db);
  await audit(
    db,
    actor,
    create ? "collection.create" : "collection.update",
    id,
  );
  return { id };
}
export async function reorderGiftCollections(
  db: GiftDb,
  actor: string,
  ids: any,
) {
  await lockGiftCatalog(db);
  if (
    !Array.isArray(ids) ||
    new Set(ids).size !== ids.length ||
    ids[0] !== "popular"
  )
    throw new GiftCatalogError("Popular must remain first.");
  const existing = (await db.query("SELECT id FROM gift_collections")).rows.map(
    (r: any) => r.id,
  );
  if (
    ids.length !== existing.length ||
    ids.some((id) => !existing.includes(id))
  )
    throw new GiftCatalogError("Include each collection once.");
  for (let i = 0; i < ids.length; i++)
    await db.query("UPDATE gift_collections SET sort_order=$2 WHERE id=$1", [
      ids[i],
      i,
    ]);
  await bump(db);
  await audit(db, actor, "collection.reorder", "catalog");
  return { ok: true };
}
export async function draftManagedGift(
  db: GiftDb,
  actor: string,
  id: string,
  input: any,
  create = false,
) {
  knownFields(input, [
    "id",
    "type",
    "collectionId",
    "name",
    "emoji",
    "coinCost",
    "sortOrder",
    "thumbnailAssetId",
    "androidAssetId",
    "iosAssetId",
    "soundAssetId",
    "framing",
    "status",
  ]);
  if (input.status !== undefined && !["draft", "published"].includes(input.status))
    throw new GiftCatalogError("Choose Draft or Published status.");
  await lockGiftCatalog(db);
  ident(id);
  let g = (
    await db.query("SELECT * FROM catalog_gifts WHERE id=$1 FOR UPDATE", [id])
  ).rows[0];
  if (create) {
    if (g) throw new GiftCatalogError("Gift ID already exists.", 409);
    await db.query(
      "INSERT INTO catalog_gifts(id,collection_id,sort_order) VALUES($1,$2,$3)",
      [id, ident(input.collectionId), integer(input.sortOrder ?? 0)],
    );
    g = {};
  } else if (!g) throw new GiftCatalogError("Gift not found.", 404);
  const previous = g.draft_revision_id ?? g.current_revision_id;
  const old = previous
    ? (await db.query("SELECT * FROM gift_revisions WHERE id=$1", [previous]))
        .rows[0]
    : {};
  const body = { ...revisionDto(old), ...input };
  const type = input.type ?? (input.androidAssetId || input.iosAssetId ? "animation" : body.type);
  if (!["image", "animation"].includes(type)) throw new GiftCatalogError("Choose Image or Animation.");
  if (type === "image") {
    body.androidAssetId = null;
    body.iosAssetId = null;
  }
  const collectionId = ident(
    body.collectionId ?? g.collection_id ?? input.collectionId,
  );
  if (collectionId === "test")
    throw new GiftCatalogError("Test is reserved for native previews.");
  if (
    !(
      await db.query("SELECT id FROM gift_collections WHERE id=$1", [
        collectionId,
      ])
    ).rows.length
  )
    throw new GiftCatalogError("Collection not found.", 404);
  const sortOrder = integer(body.sortOrder ?? g.sort_order ?? 0);
  const revisionId = randomUUID();
  const fields = [
    "thumbnailAssetId",
    "androidAssetId",
    "iosAssetId",
    "soundAssetId",
  ];
  for (const field of fields) {
    const a = body[field];
    if (!a) continue;
    const row = (
      await db.query(
        "SELECT * FROM gift_assets WHERE id=$1 AND owner_clerk_id=$2",
        [a, actor],
      )
    ).rows[0];
    if (!row) throw new GiftCatalogError("Choose an owned, validated asset.");
    const expected =
      field === "thumbnailAssetId"
        ? "thumbnail"
        : field === "soundAssetId"
          ? "sound"
          : "animation";
    if (
      row.kind !== expected ||
      (field === "androidAssetId" &&
        !["svga", "webm-alpha"].includes(row.format)) ||
      (field === "iosAssetId" &&
        !["svga", "packed-alpha-mp4"].includes(row.format))
    )
      throw new GiftCatalogError(
        "Asset format does not match its platform/slot.",
      );
  }
  await db.query(
    "INSERT INTO gift_revisions(id,gift_id,name,emoji,coin_cost,thumbnail_asset_id,android_asset_id,ios_asset_id,sound_asset_id,framing,created_by,collection_id,sort_order,gift_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
    [
      revisionId,
      id,
      name(body.name),
      typeof body.emoji === "string" ? body.emoji.slice(0, 32) : "",
      integer(body.coinCost, 1),
      ...fields.map((f) => body[f] ?? null),
      JSON.stringify(validateGiftFraming(body.framing)),
      actor,
      collectionId,
      sortOrder,
      type,
    ],
  );
  await db.query("UPDATE catalog_gifts SET draft_revision_id=$2 WHERE id=$1", [
    id,
    revisionId,
  ]);
  await audit(db, actor, "gift.draft", id);
  if (input.status === "published") await publishManagedGift(db, actor, id, revisionId);
  else if (input.status === "draft" && g.status !== "draft" && !create)
    await unpublishManagedGift(db, actor, id);
  return { id, revisionId, ...(input.status ? { status: input.status } : {}) };
}
export async function publishManagedGift(
  db: GiftDb,
  actor: string,
  id: string,
  revisionId: string,
) {
  await lockGiftCatalog(db);
  const r = (
    await db.query(
      "SELECT r.*,g.legacy FROM gift_revisions r JOIN catalog_gifts g ON g.id=r.gift_id WHERE r.id=$1 AND r.gift_id=$2",
      [revisionId, id],
    )
  ).rows[0];
  if (!r) throw new GiftCatalogError("Revision not found.", 404);
  if (!r.legacy && !r.thumbnail_asset_id)
    throw new GiftCatalogError("Upload a thumbnail before publishing.");
  if (giftRevisionType(r) === "animation" && !r.android_asset_id && !r.ios_asset_id && !(r.legacy && ["kisses", "luxury_rocket", "dragon"].includes(id)))
    throw new GiftCatalogError("Upload an Android or iPhone animation before publishing.");
  // Older seed revisions predate placement fields. Restoring them uses the
  // original seed placement without rewriting immutable history.
  const legacyGroups = {
    popular: [
      "rose",
      "heart",
      "party",
      "strawberry",
      "diamond",
      "lips",
      "rocket",
      "crown",
    ],
    luxury: ["kisses", "luxury_rocket", "dragon"],
  };
  const legacyPlacement =
    r.id === `${id}_legacy_v1`
      ? Object.entries(legacyGroups).find(([, ids]) => ids.includes(id))
      : undefined;
  const collectionId = r.collection_id ?? legacyPlacement?.[0] ?? null;
  const sortOrder = r.sort_order ?? legacyPlacement?.[1].indexOf(id) ?? null;
  await db.query(
    "UPDATE catalog_gifts SET current_revision_id=$2,draft_revision_id=NULL,status='published',collection_id=COALESCE($3,collection_id),sort_order=COALESCE($4,sort_order) WHERE id=$1",
    [id, revisionId, collectionId, sortOrder],
  );
  await db.query(
    "INSERT INTO gift_revision_publications(revision_id) VALUES($1) ON CONFLICT DO NOTHING",
    [revisionId],
  );
  await bump(db);
  await audit(db, actor, "gift.publish", `${id}:${revisionId}`);
  return { id, revisionId };
}
export async function archiveManagedGift(
  db: GiftDb,
  actor: string,
  id: string,
) {
  await lockGiftCatalog(db);
  const r = await db.query(
    "UPDATE catalog_gifts SET status='archived' WHERE id=$1 RETURNING id",
    [id],
  );
  if (!r.rows.length) throw new GiftCatalogError("Gift not found.", 404);
  await bump(db);
  await audit(db, actor, "gift.archive", id);
  return { id };
}
export async function unpublishManagedGift(
  db: GiftDb,
  actor: string,
  id: string,
) {
  await lockGiftCatalog(db);
  const r = await db.query(
    "UPDATE catalog_gifts SET status='draft' WHERE id=$1 RETURNING id",
    [id],
  );
  if (!r.rows.length) throw new GiftCatalogError("Gift not found.", 404);
  await bump(db);
  await audit(db, actor, "gift.unpublish", id);
  return { id };
}

export async function validateGiftAsset(
  bytes: Buffer,
  kind: string,
  format: string,
) {
  if (
    !Object.hasOwn(GIFT_UPLOAD_LIMITS, kind) ||
    !bytes.length ||
    bytes.length > GIFT_UPLOAD_LIMITS[kind as "thumbnail"]
  )
    throw new GiftCatalogError("Asset exceeds its upload limit.");
  const allowed: Record<string, string[]> = {
    thumbnail: ["png", "jpeg", "webp"],
    animation: ["svga", "webm-alpha", "packed-alpha-mp4"],
    sound: ["mp3", "aac"],
  };
  if (!allowed[kind]?.includes(format))
    throw new GiftCatalogError("Unsupported asset format.");
  if (format === "svga") {
    try {
      const decoded = inflateSync(bytes, { maxOutputLength: 64 * 1024 * 1024 });
      const movie = protobufFields(decoded);
      const version = movie.get(1);
      const params = movie.get(2);
      if (
        !Buffer.isBuffer(version) ||
        !/^2\./.test(version.toString()) ||
        !Buffer.isBuffer(params) ||
        !movie.has(3)
      )
        throw new Error();
      const p = protobufFields(params);
      const width = Number(p.get(1)),
        height = Number(p.get(2)),
        fps = Number(p.get(3)),
        frames = Number(p.get(4));
      const durationMs = Math.round((frames / fps) * 1000);
      if (
        !(
          width > 0 &&
          width <= 4096 &&
          height > 0 &&
          height <= 4096 &&
          fps > 0 &&
          fps <= 120 &&
          frames > 0 &&
          durationMs <= 60000
        )
      )
        throw new Error();
      return { durationMs, width, height };
    } catch {
      throw new GiftCatalogError("Invalid compressed SVGA movie or duration.");
    }
  }
  const directory = await mkdtemp(join(tmpdir(), "pulse-gift-probe-"));
  const path = join(directory, "asset");
  try {
    await writeFile(path, bytes);
    let probe: any;
    try {
      const { stdout } = await promisify(execFile)(
        "ffprobe",
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-show_format",
          "-show_streams",
          "-of",
          "json",
          path,
        ],
        { timeout: 15000, maxBuffer: 1024 * 1024 },
      );
      probe = JSON.parse(stdout);
    } catch {
      throw new GiftCatalogError("File content could not be validated.");
    }
    const v = probe.streams?.find((s: any) => s.codec_type === "video");
    const audio = probe.streams?.find((s: any) => s.codec_type === "audio");
    const durationMs = Math.round(
      Number(probe.format?.duration ?? v?.duration ?? audio?.duration ?? 0) *
        1000,
    );
    if (
      kind !== "thumbnail" &&
      (!durationMs || durationMs > GIFT_UPLOAD_LIMITS.maxDurationMs)
    )
      throw new GiftCatalogError("Media must last at most 60 seconds.");
    if (
      kind === "thumbnail" &&
      (!v ||
        !({ png: "png", jpeg: "mjpeg", webp: "webp" } as any)[format] ||
        v.codec_name !==
          ({ png: "png", jpeg: "mjpeg", webp: "webp" } as any)[format])
    )
      throw new GiftCatalogError(
        "Thumbnail content does not match its format.",
      );
    if (v && (v.width > 4096 || v.height > 4096 || v.width < 1 || v.height < 1))
      throw new GiftCatalogError("Image dimensions exceed 4096 pixels.");
    if (
      format === "webm-alpha" &&
      (!v ||
        v.codec_name !== "vp9" ||
        String(v.tags?.alpha_mode ?? v.tags?.ALPHA_MODE) !== "1" ||
        !String(probe.format?.format_name).includes("webm"))
    )
      throw new GiftCatalogError("Upload VP9 WebM with alpha metadata.");
    if (
      format === "packed-alpha-mp4" &&
      (!v ||
        v.codec_name !== "h264" ||
        v.width % 2 ||
        !String(probe.format?.format_name).includes("mp4"))
    )
      throw new GiftCatalogError(
        "Upload an H.264 MP4 packed with alpha on the left and color on the right.",
      );
    if (
      kind === "sound" &&
      (!audio ||
        v ||
        (format === "mp3" && audio.codec_name !== "mp3") ||
        (format === "aac" && audio.codec_name !== "aac"))
    )
      throw new GiftCatalogError("Invalid sound file.");
    return {
      durationMs: durationMs || null,
      width: v?.width ?? null,
      height: v?.height ?? null,
      hasAudio: !!audio,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
function protobufFields(bytes: Buffer) {
  const fields = new Map<number, Buffer | number>();
  let offset = 0;
  const variable = () => {
    let value = 0,
      shift = 0;
    for (let i = 0; i < 5; i++) {
      if (offset >= bytes.length) throw new Error();
      const b = bytes[offset++]!;
      value += (b & 127) * 2 ** shift;
      if (!(b & 128)) return value;
      shift += 7;
    }
    throw new Error();
  };
  while (offset < bytes.length) {
    const tag = variable(),
      field = tag >>> 3,
      wire = tag & 7;
    if (!field) throw new Error();
    if (wire === 0) fields.set(field, variable());
    else if (wire === 2) {
      const size = variable();
      if (offset + size > bytes.length) throw new Error();
      fields.set(field, bytes.subarray(offset, offset + size));
      offset += size;
    } else if (wire === 5) {
      if (offset + 4 > bytes.length) throw new Error();
      fields.set(field, bytes.readFloatLE(offset));
      offset += 4;
    } else if (wire === 1) {
      if (offset + 8 > bytes.length) throw new Error();
      offset += 8;
    } else throw new Error();
  }
  return fields;
}
export async function uploadManagedGiftAsset(
  db: GiftDb,
  actor: string,
  bytes: Buffer,
  kind: string,
  format: string,
  originalFilename?: string,
): Promise<NonNullable<ReturnType<typeof giftAssetDto>> & { fileName: string | null }> {
  if (originalFilename !== undefined && (typeof originalFilename !== "string" || !originalFilename.trim() || originalFilename.length > 255 || /[\x00-\x1f\x7f/\\]/.test(originalFilename)))
    throw new GiftCatalogError("Provide a filename without paths or control characters.");
  const meta = await validateGiftAsset(bytes, kind, format);
  const root = process.env.PRIVATE_OBJECT_DIR;
  if (!root) throw new GiftCatalogError("Object storage is unavailable.", 503);
  let audioAssetId: string | null = null;
  if (kind === "animation" && "hasAudio" in meta && meta.hasAudio) {
    const dir = await mkdtemp(join(tmpdir(), "pulse-gift-audio-"));
    try {
      const src = join(dir, "source");
      const out = join(dir, "audio.mp3");
      await writeFile(src, bytes);
      try {
        await promisify(execFile)(
          "ffmpeg",
          [
            "-v",
            "error",
            "-nostdin",
            "-i",
            src,
            "-vn",
            "-t",
            "60",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "128k",
            out,
          ],
          { timeout: 30000, maxBuffer: 1024 * 1024 },
        );
      } catch {
        throw new GiftCatalogError(
          "Embedded sound could not be validated/extracted.",
        );
      }
      const sound = await uploadManagedGiftAsset(
        db,
        actor,
        await readFile(out),
        "sound",
        "mp3",
      );
      audioAssetId = sound!.id;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  const id = randomUUID();
  const objectPath = `/objects/gifts/${id}`;
  const parts = root.replace(/^\//, "").replace(/\/$/, "").split("/");
  const bucket = parts.shift()!;
  await objectStorageClient
    .bucket(bucket)
    .file(`${parts.join("/")}/gifts/${id}`)
    .save(bytes, {
      resumable: false,
      metadata: {
        contentType: "application/octet-stream",
        cacheControl: "private, max-age=31536000, immutable",
      },
    });
  const a = (
    await db.query(
      "INSERT INTO gift_assets(id,owner_clerk_id,kind,format,object_path,sha256,byte_size,duration_ms,width,height,audio_asset_id,original_filename) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",
      [
        id,
        actor,
        kind,
        format,
        objectPath,
        createHash("sha256").update(bytes).digest("hex"),
        bytes.length,
        meta.durationMs,
        meta.width,
        meta.height,
        audioAssetId,
        originalFilename ?? null,
      ],
    )
  ).rows[0];
  await audit(db, actor, "asset.upload", id);
  return { ...giftAssetDto(a)!, fileName: a.original_filename ?? null };
}
export async function giftAssetDelivery(
  db: GiftDb,
  id: string,
  actor?: string,
) {
  const a = (
    await db.query(
      `SELECT a.* FROM gift_assets a WHERE a.id=$1 AND (a.owner_clerk_id=$2 OR EXISTS(SELECT 1 FROM gift_revisions r JOIN gift_revision_publications p ON p.revision_id=r.id WHERE a.id IN(r.thumbnail_asset_id,r.android_asset_id,r.ios_asset_id,r.sound_asset_id) OR a.id IN(SELECT audio_asset_id FROM gift_assets WHERE id IN(r.android_asset_id,r.ios_asset_id))))`,
      [id, actor ?? null],
    )
  ).rows[0];
  if (!a) throw new GiftCatalogError("Asset not found.", 404);
  const root = process.env.PRIVATE_OBJECT_DIR;
  if (!root) throw new GiftCatalogError("Object storage unavailable.", 503);
  const parts = root.replace(/^\//, "").replace(/\/$/, "").split("/");
  const bucket = parts.shift()!;
  const [bytes] = await objectStorageClient
    .bucket(bucket)
    .file(`${parts.join("/")}/${a.object_path.slice("/objects/".length)}`)
    .download();
  if (
    bytes.length !== a.byte_size ||
    createHash("sha256").update(bytes).digest("hex") !== a.sha256
  )
    throw new GiftCatalogError("Asset integrity check failed.", 503);
  return { bytes, asset: giftAssetDto(a) };
}

import { createHash } from "node:crypto";

// This catalog contains observations, never an executable payment authorization.
export const MAX_WITHDRAWAL_CENTS = 50000;
export class CatalogError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
type Row = Record<string, any>;
type Sql = {
  query(
    sql: string,
    values?: any[],
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
};
type Database = Sql & { connect(): Promise<Sql & { release(): void }> };
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function object(value: unknown, allowed: string[], label: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CatalogError(`${label} must be an object.`);
  const obj = value as Row;
  if (Object.keys(obj).some((k) => !allowed.includes(k)))
    throw new CatalogError(`${label} has unsupported fields.`);
  return obj;
}
function string(value: unknown, label: string, max = 160): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u001f]/.test(value)
  )
    throw new CatalogError(`Invalid ${label}.`);
  return value;
}
function cents(value: unknown, label: string): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > 100000000
  )
    throw new CatalogError(`Invalid ${label}.`);
  return value as number;
}
function array(value: unknown, label: string, max: number): any[] {
  if (!Array.isArray(value) || value.length > max)
    throw new CatalogError(`Invalid ${label}.`);
  return value;
}
export function validateAccountKey(value: unknown): string {
  const key = string(value, "provider account scope", 100);
  if (!/^[a-zA-Z0-9_.:-]+$/.test(key))
    throw new CatalogError("Invalid provider account scope.");
  return key;
}
type ProviderTarget = { id: string; name: string; accountKey: string };
export function normalizeResearch(
  input: unknown,
  accountKey: string,
  provider?: ProviderTarget,
) {
  validateAccountKey(accountKey);
  if (provider) {
    string(provider.id, "provider ID", 250);
    string(provider.name, "provider name", 120);
    if (provider.accountKey !== accountKey)
      throw new CatalogError("Provider does not belong to this catalog.", 404);
  }
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(input);
  } catch {
    throw new CatalogError("Research must be valid JSON.");
  }
  if (!serialized || serialized.length > 250000)
    throw new CatalogError("Research is missing or too large.");
  const data = object(
    input,
    [
      "observed_date",
      "observed_at",
      "source",
      "source_urls",
      "sender_country",
      "funding_method",
      "comparison_send_amounts_usd",
      "fee_currency",
      "production_fee_schedule",
      "live_requote_required",
      "scope",
      "discount_note",
      "countries",
    ],
    "Research",
  );
  const remitly = !provider || /^remitly_[a-f0-9]{24}$/.test(provider.id);
  const expectedSource = remitly
    ? "Signed-in Remitly Business website UI"
    : `Signed-in ${provider!.name} website UI`;
  if (
    data.source !== expectedSource ||
    data.production_fee_schedule !== false ||
    data.live_requote_required !== true
  )
    throw new CatalogError(
      `Use source "${expectedSource}" and observations requiring a live requote.`,
    );
  const date = string(data.observed_date, "observed date", 10);
  let observedAt = `${date}T00:00:00.000Z`;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(observedAt)) ||
    new Date(observedAt).toISOString().slice(0, 10) !== date ||
    Date.parse(observedAt) > Date.now() + 86400000
  )
    throw new CatalogError("Invalid observed date.");
  if (data.observed_at !== undefined) {
    const timestamp = string(data.observed_at, "observed timestamp", 24);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(timestamp) ||
      !Number.isFinite(Date.parse(timestamp))
    )
      throw new CatalogError(
        "Observed timestamp must be an exact UTC ISO timestamp.",
      );
    const canonicalTimestamp = new Date(timestamp).toISOString();
    if (
      canonicalTimestamp !==
        (timestamp.length === 20
          ? timestamp.replace("Z", ".000Z")
          : timestamp) ||
      canonicalTimestamp.slice(0, 10) !== date ||
      Date.parse(canonicalTimestamp) > Date.now()
    )
      throw new CatalogError(
        "Observed timestamp must match the observed date and cannot be in the future.",
      );
    observedAt = canonicalTimestamp;
  }
  if (data.sender_country !== "US" || data.fee_currency !== "USD")
    throw new CatalogError(
      "This catalog currently accepts US sender USD fees only.",
    );
  const fundingMethod = string(data.funding_method, "funding method", 40);
  if (!["debit_card", "credit_card", "bank_account"].includes(fundingMethod))
    throw new CatalogError("Unsupported funding method.");
  const sourceUrls = array(data.source_urls, "source URLs", 10).map((v) => {
    let u: URL;
    try {
      u = new URL(string(v, "source URL", 500));
    } catch {
      throw new CatalogError("Invalid provider source URL.");
    }
    if (
      u.protocol !== "https:" ||
      (remitly &&
        (u.hostname !== "www.remitly.com" ||
          !["/us/en/homepage", "/us/en/transfer/send"].includes(u.pathname))) ||
      u.username ||
      u.password ||
      u.port ||
      u.search ||
      u.hash
    )
      throw new CatalogError(
        "Use HTTPS provider source pages without credentials, ports, queries or fragments.",
      );
    return u.toString();
  });
  if (!sourceUrls.length)
    throw new CatalogError(
      "At least one signed-in research source URL is required.",
    );
  const amounts = array(
    data.comparison_send_amounts_usd,
    "comparison amounts",
    20,
  ).map((v) => {
    const decimal = String(v);
    if (
      typeof v !== "number" ||
      !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(decimal) ||
      v <= 0 ||
      v > 100000
    )
      throw new CatalogError("Comparison amounts must be exact USD cents.");
    const [whole, fraction = ""] = decimal.split(".");
    return {
      amount: v,
      sendAmountCents: Number(whole) * 100 + Number(fraction.padEnd(2, "0")),
    };
  });
  if (
    !amounts.length ||
    new Set(amounts.map((a) => a.sendAmountCents)).size !== amounts.length
  )
    throw new CatalogError("Comparison amounts must be unique and nonempty.");
  string(data.scope, "research scope", 2000);
  const discountNote =
    data.discount_note == null
      ? null
      : string(data.discount_note, "discount note", 2000);
  const providerId = provider?.id ?? `remitly_${hash(accountKey).slice(0, 24)}`;
  const countries: Row[] = [],
    methods: Row[] = [],
    observations: Row[] = [];
  const seenCountries = new Set<string>();
  const statuses = [
    "link_options",
    "verified_methods",
    "manual_only",
    "not_in_destination_picker",
    "quote_error",
    "link_available_no_method_modal",
  ];
  for (const raw of array(data.countries, "countries", 250)) {
    const country = object(
      raw,
      [
        "country_code",
        "country",
        "receive_currency",
        "inspection_status",
        "notes",
        "methods",
      ],
      "Country",
    );
    const countryCode = string(country.country_code, "country code", 2);
    if (!/^[A-Z]{2}$/.test(countryCode) || seenCountries.has(countryCode))
      throw new CatalogError("Country codes must be unique ISO-style codes.");
    seenCountries.add(countryCode);
    const name = string(country.country, "country name");
    if (!statuses.includes(country.inspection_status))
      throw new CatalogError("Unsupported inspection status.");
    const inspectionStatus = country.inspection_status as string;
    const availability =
      inspectionStatus === "not_in_destination_picker"
        ? "unavailable"
        : inspectionStatus === "quote_error"
          ? "quote_error"
          : inspectionStatus === "link_options" ||
              (!remitly && inspectionStatus === "verified_methods")
            ? "available"
            : "unverified";
    const notes =
      country.notes === "" ? "" : string(country.notes, "country notes", 4000);
    const countryId = `${providerId}_${countryCode}`;
    const receiveCurrency = country.receive_currency;
    if (
      receiveCurrency !== null &&
      (typeof receiveCurrency !== "string" ||
        !/^[A-Z]{3}$/.test(receiveCurrency))
    )
      throw new CatalogError("Invalid receive currency.");
    countries.push({
      id: countryId,
      providerId,
      countryCode,
      name,
      availability,
      observedAt,
    });
    const addObservation = (
      methodId: string | null,
      sendAmountCents: number | null,
      payload: Row,
    ) => {
      const id = `obs_${hash(canonical({ providerId, countryId, methodId, observedAt, fundingMethod, sendAmountCents })).slice(0, 48)}`;
      observations.push({
        id,
        providerId,
        countryId,
        methodId,
        source: remitly ? "signed_in_remitly_business" : "signed_in_provider",
        observedAt,
        availability,
        payload,
        fingerprint: hash(canonical({ availability, payload })),
      });
    };
    addObservation(null, null, {
      inspectionStatus,
      notes,
      sourceUrls,
      discountNote,
      discountVerified: false,
      scope: data.scope,
      receiveCurrency,
      senderCountry: "US",
      fundingMethod,
      liveRequoteRequired: true,
    });
    const seenMethods = new Set<string>();
    const methodInputs = array(country.methods, "delivery methods", 40);
    if (
      (availability === "unavailable" || availability === "quote_error") &&
      methodInputs.length
    )
      throw new CatalogError("Unavailable routes cannot have quoted methods.");
    for (const rawMethod of methodInputs) {
      const feeKeys = amounts.map(
        ({ amount }) => `fee_cents_at_${amount}_usd_send`,
      );
      const method = object(
        rawMethod,
        ["label", "delivery_estimate", ...feeKeys],
        "Delivery method",
      );
      const methodName = string(method.label, "method name");
      const code = methodName
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      if (!code || seenMethods.has(code) || !receiveCurrency)
        throw new CatalogError(
          "Method codes must be unique and require a receive currency.",
        );
      seenMethods.add(code);
      const deliveryEstimate =
        method.delivery_estimate === null
          ? null
          : string(method.delivery_estimate, "delivery estimate", 200);
      const methodId = `${countryId}_${code}_${receiveCurrency}`;
      methods.push({
        id: methodId,
        countryId,
        code,
        name: methodName,
        receiveCurrency,
        availability,
        observedAt,
      });
      for (const { amount, sendAmountCents } of amounts) {
        addObservation(methodId, sendAmountCents, {
          sendAmountCents,
          feeCents: cents(method[`fee_cents_at_${amount}_usd_send`], "fee"),
          feeCurrency: "USD",
          fundingMethod,
          senderCountry: "US",
          receiveCurrency,
          deliveryEstimate,
          inspectionStatus,
          linkMethodVerified: inspectionStatus === "link_options",
          taxStatus: countryCode === "BR" ? "unresolved" : "not_observed",
          discountNote,
          discountVerified: false,
          liveRequoteRequired: true,
          sourceUrls,
        });
      }
    }
  }
  if (!countries.length)
    throw new CatalogError("Research must include at least one country.");
  return { providerId, accountKey, countries, methods, observations };
}

export async function importResearch(
  database: Database,
  research: unknown,
  accountKey: string,
  actor: string,
  dryRun = false,
  provider?: ProviderTarget,
) {
  const data = normalizeResearch(research, accountKey, provider);
  const summary = {
    dryRun,
    providerId: data.providerId,
    countries: data.countries.length,
    methods: data.methods.length,
    observations: data.observations.length,
  };
  // Dry runs validate without requiring a database or acquiring a connection.
  if (dryRun) return summary;
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      data.providerId,
    ]);
    await client.query(
      "INSERT INTO payout_catalog_providers(id,name,account_key) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
      [data.providerId, provider?.name ?? "Remitly", accountKey],
    );
    const owner = await client.query(
      "SELECT id FROM payout_catalog_providers WHERE id=$1 AND account_key=$2",
      [data.providerId, accountKey],
    );
    if (!owner.rows.length)
      throw new CatalogError("Provider does not belong to this catalog.", 404);
    for (const c of data.countries) {
      await client.query(
        `INSERT INTO payout_catalog_countries(id,provider_id,country_code,name,availability,last_verified_at) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(id) DO UPDATE SET availability=EXCLUDED.availability,last_verified_at=EXCLUDED.last_verified_at,revision=payout_catalog_countries.revision+1,updated_at=now()
        WHERE payout_catalog_countries.last_verified_at < EXCLUDED.last_verified_at`,
        [
          c.id,
          c.providerId,
          c.countryCode,
          c.name,
          c.availability,
          c.observedAt,
        ],
      );
    }
    for (const m of data.methods) {
      await client.query(
        `INSERT INTO payout_catalog_methods(id,country_id,code,name,receive_currency,availability,last_verified_at) VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(id) DO UPDATE SET availability=EXCLUDED.availability,last_verified_at=EXCLUDED.last_verified_at,revision=payout_catalog_methods.revision+1,updated_at=now()
        WHERE payout_catalog_methods.last_verified_at < EXCLUDED.last_verified_at`,
        [
          m.id,
          m.countryId,
          m.code,
          m.name,
          m.receiveCurrency,
          m.availability,
          m.observedAt,
        ],
      );
    }
    // A newer full country inspection supersedes methods omitted from that inspection.
    for (const c of data.countries)
      await client.query(
        `UPDATE payout_catalog_methods SET availability='unverified',last_verified_at=$2,revision=revision+1,updated_at=now()
      WHERE country_id=$1 AND last_verified_at < $2 AND NOT(id=ANY($3::text[]))`,
        [
          c.id,
          c.observedAt,
          data.methods.filter((m) => m.countryId === c.id).map((m) => m.id),
        ],
      );
    // A historical import must not reintroduce a method absent in a newer inspection.
    await client.query(
      `UPDATE payout_catalog_methods m SET availability='unverified',revision=m.revision+1,updated_at=now()
      FROM payout_catalog_countries c WHERE m.country_id=c.id AND c.provider_id=$1 AND m.last_verified_at<c.last_verified_at AND m.availability<>'unverified'`,
      [data.providerId],
    );
    let insertedObservations = 0;
    for (const o of data.observations) {
      const existing = await client.query(
        "SELECT fingerprint FROM payout_catalog_observations WHERE id=$1",
        [o.id],
      );
      if (existing.rows.length) {
        if (existing.rows[0].fingerprint !== o.fingerprint)
          throw new CatalogError(
            "An observation with this identity already exists with different data. Import a new dated observation instead.",
            409,
          );
        continue;
      }
      await client.query(
        `INSERT INTO payout_catalog_observations(id,provider_id,country_id,method_id,source,observed_at,availability,payload,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          o.id,
          o.providerId,
          o.countryId,
          o.methodId,
          o.source,
          o.observedAt,
          o.availability,
          JSON.stringify(o.payload),
          o.fingerprint,
        ],
      );
      insertedObservations++;
    }
    if (insertedObservations)
      await client.query(
        "INSERT INTO payout_catalog_events(actor,action,target,after_value) VALUES($1,'research_import',$2,$3)",
        [
          actor,
          data.providerId,
          JSON.stringify({ ...summary, insertedObservations }),
        ],
      );
    await client.query("COMMIT");
    return { ...summary, insertedObservations };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createCatalogProvider(
  database: Database,
  accountKey: string,
  input: unknown,
  actor: string,
) {
  validateAccountKey(accountKey);
  const body = object(input, ["name"], "Provider");
  const name = string(body.name, "provider name", 120).trim();
  const code = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (!code || code.length > 80)
    throw new CatalogError(
      "Use a provider name containing letters or numbers.",
    );
  const id = `${code}_${hash(accountKey).slice(0, 24)}`;
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [id]);
    const duplicate = await client.query(
      "SELECT id FROM payout_catalog_providers WHERE account_key=$1 AND (id=$2 OR lower(name)=lower($3))",
      [accountKey, id, name],
    );
    if (duplicate.rows.length)
      throw new CatalogError(
        "This provider already exists. Select it to import methods and fees.",
        409,
      );
    const result = await client.query(
      "INSERT INTO payout_catalog_providers(id,name,account_key) VALUES($1,$2,$3) RETURNING *",
      [id, name, accountKey],
    );
    await client.query(
      "INSERT INTO payout_catalog_events(actor,action,target,after_value) VALUES($1,'provider_create',$2,$3)",
      [actor, id, JSON.stringify(result.rows[0])],
    );
    await client.query("COMMIT");
    return { id, name, enabled: true, revision: 1 };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// New fee observations retain history instead of overwriting prior quotes.
export async function addCatalogFee(
  database: Database,
  accountKey: string,
  methodId: string,
  input: unknown,
  actor: string,
) {
  validateAccountKey(accountKey);
  const body = object(
    input,
    [
      "revision",
      "sendAmountCents",
      "feeCents",
      "fundingMethod",
      "observedAt",
      "deliveryEstimate",
      "taxStatus",
      "sourceUrl",
    ],
    "Fee observation",
  );
  if (!Number.isSafeInteger(body.revision) || body.revision < 1)
    throw new CatalogError("An expected method revision is required.");
  const sendAmountCents = cents(body.sendAmountCents, "send amount");
  if (!sendAmountCents)
    throw new CatalogError("Send amount must be above zero.");
  const feeCents = cents(body.feeCents, "fee");
  if (
    !["debit_card", "credit_card", "bank_account"].includes(body.fundingMethod)
  )
    throw new CatalogError("Unsupported funding method.");
  const observedAt = string(body.observedAt, "observed timestamp", 24);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(observedAt) ||
    !Number.isFinite(Date.parse(observedAt)) ||
    new Date(observedAt).toISOString() !== observedAt ||
    Date.parse(observedAt) > Date.now()
  )
    throw new CatalogError(
      "Use a valid observation time that is not in the future.",
    );
  const deliveryEstimate =
    body.deliveryEstimate == null || body.deliveryEstimate === ""
      ? null
      : string(body.deliveryEstimate, "delivery estimate", 200);
  if (
    !["not_observed", "unresolved", "included", "none"].includes(body.taxStatus)
  )
    throw new CatalogError("Select the observed tax status.");
  let url: URL;
  try {
    url = new URL(string(body.sourceUrl, "provider source URL", 500));
  } catch {
    throw new CatalogError("Use a valid provider source URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  )
    throw new CatalogError(
      "Use an HTTPS provider page without credentials, ports, queries or fragments.",
    );
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT m.*,c.provider_id,c.country_code FROM payout_catalog_methods m JOIN payout_catalog_countries c ON c.id=m.country_id JOIN payout_catalog_providers p ON p.id=c.provider_id WHERE m.id=$1 AND p.account_key=$2 FOR UPDATE OF m`,
      [methodId, accountKey],
    );
    const method = result.rows[0];
    if (!method) throw new CatalogError("Catalog method not found.", 404);
    const remitly = /^remitly_[a-f0-9]{24}$/.test(method.provider_id);
    if (
      remitly &&
      (url.hostname !== "www.remitly.com" ||
        !["/us/en/homepage", "/us/en/transfer/send"].includes(url.pathname))
    )
      throw new CatalogError("Use an observed Remitly Business source page.");
    if (method.country_code === "BR" && body.taxStatus !== "unresolved")
      throw new CatalogError(
        "Brazil taxes remain unresolved until their method-specific requirements are verified.",
      );
    const latest = await client.query(
      "SELECT payload FROM payout_catalog_observations WHERE method_id=$1 ORDER BY observed_at DESC,id DESC LIMIT 1",
      [methodId],
    );
    const evidence = latest.rows[0]?.payload ?? {};
    const payload = {
      ...evidence,
      sendAmountCents,
      feeCents,
      feeCurrency: "USD",
      fundingMethod: body.fundingMethod,
      senderCountry: "US",
      receiveCurrency: method.receive_currency,
      deliveryEstimate,
      taxStatus: body.taxStatus,
      sourceUrls: [url.toString()],
      discountNote: null,
      discountVerified: false,
      liveRequoteRequired: true,
    };
    const id = `obs_${hash(canonical({ providerId: method.provider_id, countryId: method.country_id, methodId, observedAt, fundingMethod: body.fundingMethod, sendAmountCents })).slice(0, 48)}`;
    const fingerprint = hash(
      canonical({ availability: method.availability, payload }),
    );
    const existing = await client.query(
      "SELECT fingerprint FROM payout_catalog_observations WHERE id=$1",
      [id],
    );
    if (existing.rows.length) {
      if (existing.rows[0].fingerprint !== fingerprint)
        throw new CatalogError(
          "This observation already exists with different data. Use a new observation time.",
          409,
        );
      await client.query("COMMIT");
      return { id, inserted: false };
    }
    if (method.revision !== body.revision)
      throw new CatalogError(
        "This method changed. Refresh before saving.",
        409,
      );
    await client.query(
      "INSERT INTO payout_catalog_observations(id,provider_id,country_id,method_id,source,observed_at,availability,payload,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        id,
        method.provider_id,
        method.country_id,
        methodId,
        remitly ? "signed_in_remitly_business" : "signed_in_provider",
        observedAt,
        method.availability,
        JSON.stringify(payload),
        fingerprint,
      ],
    );
    await client.query(
      "UPDATE payout_catalog_methods SET last_verified_at=GREATEST(last_verified_at,$2),revision=revision+1,updated_at=now() WHERE id=$1",
      [methodId, observedAt],
    );
    await client.query(
      "INSERT INTO payout_catalog_events(actor,action,target,after_value) VALUES($1,'fee_observation',$2,$3)",
      [actor, methodId, JSON.stringify({ id, observedAt, payload })],
    );
    await client.query("COMMIT");
    return { id, inserted: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function readCatalog(
  database: Sql,
  accountKey: string | undefined,
  admin = false,
) {
  const base = {
    asOf: new Date().toISOString(),
    environment:
      process.env.NODE_ENV === "production" ? "production" : "development",
    maxWithdrawalCents: MAX_WITHDRAWAL_CENTS,
    liveRequoteRequired: true,
    providers: [] as Row[],
  };
  if (!accountKey) return base;
  validateAccountKey(accountKey);
  // A single statement gives a consistent snapshot across the hierarchy.
  const result = await database.query(
    `SELECT p.*, 
    COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.name) FROM payout_catalog_countries c WHERE c.provider_id=p.id),'[]') countries,
    COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.name) FROM payout_catalog_methods m JOIN payout_catalog_countries c ON c.id=m.country_id WHERE c.provider_id=p.id),'[]') methods,
    COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.observed_at DESC,o.id) FROM payout_catalog_observations o WHERE o.provider_id=p.id),'[]') observations
    FROM payout_catalog_providers p WHERE p.account_key=$1 ORDER BY p.name`,
    [accountKey],
  );
  const version = (r: Row) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    revision: r.revision,
  });
  for (const p of result.rows) {
    // Catalog setup is separate from integrating a provider's actual payout workflow.
    if (!admin && (!p.enabled || !/^remitly_[a-f0-9]{24}$/.test(p.id)))
      continue;
    const countries: Row[] = [];
    for (const c of p.countries as Row[]) {
      if (!admin && (!c.enabled || c.availability !== "available")) continue;
      const methods: Row[] = [];
      for (const m of p.methods as Row[]) {
        if (
          m.country_id !== c.id ||
          (!admin &&
            (!m.enabled ||
              m.availability !== "available" ||
              Date.parse(m.last_verified_at) < Date.parse(c.last_verified_at)))
        )
          continue;
        const observations = (p.observations as Row[])
          .filter((o) => o.method_id === m.id)
          .map((o) => ({
            id: o.id,
            observedAt: o.observed_at,
            ...o.payload,
            ...(admin
              ? { source: o.source, availability: o.availability }
              : {}),
          }));
        const latest = observations[0];
        if (
          !admin &&
          (!latest?.linkMethodVerified ||
            latest.inspectionStatus !== "link_options")
        )
          continue;
        methods.push({
          ...version(m),
          code: m.code,
          receiveCurrency: m.receive_currency,
          availability: m.availability,
          lastVerifiedAt: m.last_verified_at,
          ...(admin
            ? {
                defaultFeeCents: m.default_fee_cents ?? null,
                defaultFundingMethod: m.default_funding_method ?? null,
              }
            : {}),
          observations: observations.map((o) =>
            admin
              ? o
              : {
                  id: o.id,
                  observedAt: o.observedAt,
                  sendAmountCents: o.sendAmountCents,
                  feeCents: o.feeCents,
                  feeCurrency: o.feeCurrency,
                  fundingMethod: o.fundingMethod,
                  senderCountry: o.senderCountry,
                  deliveryEstimate: o.deliveryEstimate,
                  taxStatus: o.taxStatus,
                  liveRequoteRequired: true,
                },
          ),
        });
      }
      if (!admin && !methods.length) continue;
      countries.push({
        ...version(c),
        countryCode: c.country_code,
        availability: c.availability,
        lastVerifiedAt: c.last_verified_at,
        methods,
        ...(admin
          ? {
              observations: (p.observations as Row[])
                .filter((o) => o.country_id === c.id && o.method_id === null)
                .map((o) => ({
                  id: o.id,
                  observedAt: o.observed_at,
                  availability: o.availability,
                  ...o.payload,
                })),
            }
          : {}),
      });
    }
    if (!admin && !countries.length) continue;
    base.providers.push({
      ...version(p),
      countries,
      ...(admin ? { accountKey: p.account_key } : {}),
    });
  }
  return base;
}

export async function updateCatalog(
  database: Database,
  accountKey: string,
  kind: string,
  id: string,
  input: unknown,
  actor: string,
) {
  const tables: Record<string, string> = {
    providers: "payout_catalog_providers",
    countries: "payout_catalog_countries",
    methods: "payout_catalog_methods",
  };
  const table = tables[kind];
  if (!table) throw new CatalogError("Unknown catalog type.");
  string(id, "catalog ID", 250);
  validateAccountKey(accountKey);
  const patch = object(
    input,
    ["revision", "name", "enabled", "defaultFeeCents", "defaultFundingMethod"],
    "Catalog update",
  );
  if (
    !Number.isSafeInteger(patch.revision) ||
    patch.revision < 1 ||
    (patch.enabled !== undefined && typeof patch.enabled !== "boolean") ||
    (patch.name === undefined &&
      patch.enabled === undefined &&
      patch.defaultFeeCents === undefined)
  )
    throw new CatalogError(
      "An expected revision and name or enabled change are required.",
    );
  if (patch.name !== undefined) string(patch.name, "display name");
  const defaultChange = patch.defaultFeeCents !== undefined;
  if (patch.defaultFundingMethod !== undefined && !defaultChange)
    throw new CatalogError("Provide the default fee with its funding method.");
  if (defaultChange) {
    if (kind !== "methods")
      throw new CatalogError("Default fees belong to payout types.");
    if (patch.defaultFeeCents === null) {
      if (patch.defaultFundingMethod !== null)
        throw new CatalogError(
          "Clear the default funding method with the fee.",
        );
    } else {
      cents(patch.defaultFeeCents, "default fee");
      if (
        !["debit_card", "credit_card", "bank_account"].includes(
          patch.defaultFundingMethod,
        )
      )
        throw new CatalogError("Select a funding method for the default fee.");
    }
  }
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const scope =
      kind === "providers"
        ? "t.account_key=$2"
        : kind === "countries"
          ? "t.provider_id IN(SELECT id FROM payout_catalog_providers WHERE account_key=$2)"
          : "t.country_id IN(SELECT c.id FROM payout_catalog_countries c JOIN payout_catalog_providers p ON p.id=c.provider_id WHERE p.account_key=$2)";
    const existing = await client.query(
      `SELECT t.* FROM ${table} t WHERE t.id=$1 AND ${scope} FOR UPDATE`,
      [id, accountKey],
    );
    const before = existing.rows[0];
    if (!before) throw new CatalogError("Catalog entry not found.", 404);
    if (before.revision !== patch.revision)
      throw new CatalogError(
        "This entry changed. Reload and review before saving.",
        409,
      );
    const updated = await client.query(
      `UPDATE ${table} SET name=$2,enabled=$3,revision=revision+1,updated_at=now()${defaultChange ? ",default_fee_cents=$4,default_funding_method=$5" : ""} WHERE id=$1 RETURNING *`,
      [
        id,
        patch.name ?? before.name,
        patch.enabled ?? before.enabled,
        ...(defaultChange
          ? [patch.defaultFeeCents, patch.defaultFundingMethod]
          : []),
      ],
    );
    await client.query(
      "INSERT INTO payout_catalog_events(actor,action,target,before_value,after_value) VALUES($1,'catalog_update',$2,$3,$4)",
      [actor, id, JSON.stringify(before), JSON.stringify(updated.rows[0])],
    );
    await client.query("COMMIT");
    return {
      id,
      name: updated.rows[0].name,
      enabled: updated.rows[0].enabled,
      revision: updated.rows[0].revision,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function estimateCatalog(catalog: { providers: Row[] }, input: unknown) {
  const request = object(
    input,
    ["methodId", "withdrawalCents", "fundingMethod"],
    "Estimate request",
  );
  string(request.methodId, "delivery method", 250);
  const withdrawalCents = cents(request.withdrawalCents, "withdrawal amount");
  if (withdrawalCents <= 0 || withdrawalCents > MAX_WITHDRAWAL_CENTS)
    throw new CatalogError(
      "Withdrawal must be above zero and no more than USD 500 including fees.",
    );
  const fundingMethod = request.fundingMethod ?? "debit_card";
  string(fundingMethod, "funding method", 40);
  const selectableMethods = catalog.providers
    .filter((p) => p.enabled)
    .flatMap((p) =>
      p.countries
        .filter((c: Row) => c.enabled && c.availability === "available")
        .flatMap((c: Row) =>
          c.methods.filter(
            (m: Row) => m.enabled && m.availability === "available",
          ),
        ),
    );
  const method = selectableMethods.find((m: Row) => m.id === request.methodId);
  if (!method)
    throw new CatalogError("This payout method is not available.", 404);
  // Never infer a fee at USD 14.01 from a fee observed at USD 15 send.
  const observations = method.observations.filter(
    (o: Row) => o.fundingMethod === fundingMethod,
  );
  const latestDate = observations[0]?.observedAt;
  const observed = observations.find(
    (o: Row) =>
      o.observedAt === latestDate &&
      o.sendAmountCents + o.feeCents === withdrawalCents &&
      o.taxStatus !== "unresolved",
  );
  return {
    methodId: method.id,
    withdrawalCents,
    fundingMethod,
    receiveCurrency: method.receiveCurrency,
    quoteRequired: !observed,
    liveRequoteRequired: true,
    breakdown: observed
      ? {
          feeCents: observed.feeCents,
          sendAmountCents: observed.sendAmountCents,
          totalEarningsDeductedCents: withdrawalCents,
          feeCurrency: "USD",
          taxCents: null,
          promotionalDiscountCents: null,
          recipientAmount: null,
          observedAt: observed.observedAt,
        }
      : null,
    message: observed
      ? "Saved estimate only. Verify the actual provider quote before preparing payment."
      : "A signed-in provider quote for this exact amount and method is required. Saved send-amount observations do not determine this withdrawal fee.",
  };
}

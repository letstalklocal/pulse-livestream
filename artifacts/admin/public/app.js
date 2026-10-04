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
  "Payout methods": '<path d="M3 12h18M12 3v18M5 5h14v14H5z"/>',
  "Payout desk": '<path d="M4 5h16v15H4zM8 9h8m-8 4h5m-5 4h3M15 16l2 2 4-5"/>',
  Moderation: '<path d="M5 21V3m0 1h14l-3 5 3 5H5"/>',
  "Audit log":
    '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h4"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.Overview}</svg>`;
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
  unmountSignIn();
  authorized = false;
  resetPayoutDesk();
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
function rows() {
  return (
    users
      .map(
        (u) =>
          `<tr><td><button class="user-button" data-user="${u.uid}"><span class="avatar rose">${esc(initials(u.name))}</span><span>${esc(u.name)}<small>UID ${u.uid}</small></span></button></td><td>${esc(country(u.countryCode))}</td><td>${badge(u.verification)}</td><td>${esc(date(u.createdAt))}</td><td><button class="row-action" data-user="${u.uid}" aria-label="View ${esc(u.name)}">↗</button></td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="5" class="empty">No accounts match your search.</td></tr>'
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
    )}</select></div><div class="table-scroll"><table><thead><tr><th>User</th><th>Country</th><th>Verification</th><th>Joined · UTC</th><th><span class="sr-only">Details</span></th></tr></thead><tbody><tr><td colspan="5" class="empty">Loading accounts…</td></tr></tbody></table></div><div class="table-footer"><span id="result-count" role="status">Loading…</span><div><button class="page-button" id="previous-page" disabled>← Previous</button><button class="page-button" id="next-page" disabled>Next →</button></div></div></section>`;
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
  return `<section class="panel catalog-panel"><div class="panel-heading"><div><h2>Payout-method catalog</h2><p>Signed-in Business account observations. Saved fees are estimates; verify the actual quote before preparing payment.</p></div><button class="page-button" id="refresh-catalog">Refresh</button></div><div class="catalog-content"><p id="catalog-status" role="status">Loading catalog…</p><div id="catalog-records"></div></div></section><section class="panel catalog-import"><div class="panel-heading"><div><h2>Import signed-in research</h2><p>Preview the JSON before importing. Account scope is controlled by the server.</p></div></div><div class="catalog-content"><label for="catalog-file">Research JSON file</label><input id="catalog-file" type="file" accept="application/json,.json"><div class="catalog-actions"><button class="page-button" id="preview-catalog-import" disabled>Preview import</button><button class="primary-button" id="commit-catalog-import" disabled>Import research</button></div><p id="catalog-import-status" role="status">No file selected. Import does not send payments.</p></div></section>`;
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
function catalogEditor(kind, record, inheritedDisabled = false) {
  return `<form class="catalog-editor" data-catalog-kind="${kind}" data-catalog-id="${esc(record.id)}" data-catalog-revision="${esc(record.revision)}"><label>Display name<input name="name" required maxlength="120" value="${esc(record.name)}"></label><label class="catalog-toggle"><input name="enabled" type="checkbox" ${record.enabled ? "checked" : ""}> Enabled</label><button class="page-button" type="submit">Save</button><span class="catalog-feedback" role="status"></span>${inheritedDisabled ? '<p class="catalog-inherited">Unavailable to creators because a parent is disabled.</p>' : ""}</form>`;
}
function catalogObservationRows(observations = []) {
  return (
    observations
      .map(
        (o) =>
          `<tr><td>${esc(catalogMoney(o.sendAmountCents))}</td><td>${esc(o.fundingMethod)}</td><td>${esc(catalogMoney(o.feeCents, o.feeCurrency))}</td><td>${esc(o.deliveryEstimate || "Not observed")}</td><td>${esc(catalogDate(o.observedAt))}</td><td>${esc(o.taxStatus || "Not resolved")}</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="6" class="empty">No fee observations.</td></tr>'
  );
}
function catalogRouteEvidence(record) {
  const observations = record.observations || [];
  if (!observations.length)
    return record.notes
      ? `<p class="catalog-notes">${esc(record.notes)}</p>`
      : "";
  return `<details class="catalog-evidence"><summary>Route research and quote errors (${observations.length} observations)</summary>${observations.map((o) => `<p class="catalog-notes"><strong>${esc(catalogDate(o.observedAt))} · ${esc(o.inspectionStatus)}</strong><br>${esc(o.notes || "No additional notes.")}${o.discountNote ? `<br>Promotion observation (separate from fees): ${esc(o.discountNote)}` : ""}${o.sourceUrls?.length ? `<br>Sources: ${o.sourceUrls.map(esc).join(" · ")}` : ""}</p>`).join("")}</details>`;
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
    target.innerHTML = "<p>No providers imported yet.</p>";
    return;
  }
  target.innerHTML = `<label class="catalog-provider">Provider<select id="catalog-provider">${providers.map((p) => `<option value="${esc(p.id)}" ${p === provider ? "selected" : ""}>${esc(p.name)}${p.enabled ? "" : " (disabled)"}</option>`).join("")}</select></label>${catalogEditor("providers", provider)}<div class="catalog-countries">${(provider.countries || []).map((c) => `<details class="catalog-country"><summary>${esc(c.name)} · ${esc(c.countryCode)} <span>${esc(c.availability)}${c.enabled ? "" : " · Disabled"}</span></summary><p>Receive currency: ${esc(c.receiveCurrency || c.methods?.[0]?.receiveCurrency || "Not observed")} · Last verified: ${esc(catalogDate(c.lastVerifiedAt))} · Inspection: ${esc(c.inspectionStatus || c.availability)}</p>${catalogRouteEvidence(c)}${catalogEditor("countries", c, !provider.enabled)}${(c.methods || []).map((m) => `<section class="catalog-method"><h3>${esc(m.name)}</h3><p>${esc(m.receiveCurrency || "Currency not observed")} · ${esc(m.availability)} · Last verified: ${esc(catalogDate(m.lastVerifiedAt))}</p>${catalogEditor("methods", m, !provider.enabled || !c.enabled)}<div class="table-scroll"><table><caption>Observed fees by send amount and funding method</caption><thead><tr><th>Amount sent · USD</th><th>Funding method</th><th>Provider fee</th><th>Delivery estimate</th><th>Observed · UTC</th><th>Taxes</th></tr></thead><tbody>${catalogObservationRows(m.observations)}</tbody></table></div></section>`).join("") || "<p>No selectable delivery methods observed. The route remains in this catalog for review.</p>"}</details>`).join("")}</div>`;
}
async function loadCatalog() {
  if (!authorized || section !== "Payout methods") return;
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
    research = catalogImport;
  const status = document.getElementById("catalog-import-status");
  document.getElementById("preview-catalog-import").disabled = true;
  document.getElementById("commit-catalog-import").disabled = true;
  catalogPreviewed = false;
  status.textContent = dryRun ? "Validating research…" : "Importing research…";
  try {
    const result = await api("/payout-catalog/import", {
      method: "POST",
      body: JSON.stringify({ research, dryRun }),
    });
    if (version !== catalogVersion || !authorized || research !== catalogImport)
      return;
    status.textContent = `${dryRun ? "Preview validated" : "Imported"}: ${result.countries} countries, ${result.methods} methods, ${result.observations} observations.${dryRun ? " Select Import research to apply." : " Re-importing the same research does not duplicate observations."}`;
    catalogPreviewed = dryRun;
    if (!dryRun) await loadCatalog();
  } catch (e) {
    if (version !== catalogVersion || research !== catalogImport) return;
    if (accessError(e)) return;
    status.textContent = e.message;
  } finally {
    if (
      authorized &&
      section === "Payout methods" &&
      research === catalogImport
    ) {
      document.getElementById("preview-catalog-import").disabled = false;
      document.getElementById("commit-catalog-import").disabled =
        !catalogPreviewed;
    }
  }
}
document.addEventListener("submit", async (event) => {
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
  if (event.target.id === "catalog-provider") {
    catalogProviderId = event.target.value;
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
  if (event.target.id === "refresh-catalog") loadCatalog();
  if (event.target.id === "preview-catalog-import") catalogImportAction(true);
  if (event.target.id === "commit-catalog-import") catalogImportAction(false);
});

function render() {
  if (!authorized) return;
  resetPayoutDesk();
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
  main.innerHTML = `<div class="page-heading"><div><div class="eyebrow">PULSE WORKSPACE</div><h1>${section}</h1><p>${section === "Overview" ? "Welcome back. Your community workspace." : section === "Users" ? "Find and review the people who make Pulse." : section === "Payout desk" ? "Review creator withdrawals and record verified provider outcomes." : "Your space for " + section.toLowerCase() + "."}</p></div><div class="date-label">${section === "Payout methods" ? "Catalog management" : section === "Payout desk" ? "Human release required" : "Read-only access"}</div></div>${section === "Overview" ? overview() : section === "Users" ? table() : section === "Account removals" ? removals() : section === "Verification" ? reviews() : section === "Payout methods" ? catalogPage() : section === "Payout desk" ? payoutDeskPage() : operations[section] ? operationsPage() : `<section class="panel coming-soon"><span class="empty-icon">${icon(section)}</span><span class="tag">COMING NEXT</span><h2>${section}</h2><p>This section is not connected yet.</p><a class="primary-button" href="#users">Open user directory →</a></section>`}`;
  if (section === "Users" || section === "Overview") loadUsers();
  if (section === "Overview") loadOverview();
  if (section === "Account removals") loadRemovals();
  if (section === "Verification") loadReviews();
  if (section === "Payout methods") loadCatalog();
  if (section === "Payout desk") loadWithdrawals();
  if (operations[section]) loadOperations();
}
async function loadUsers() {
  const version = ++requestVersion;
  users = [];
  nextCursor = null;
  const tbody = document.querySelector(".users-panel tbody");
  if (!tbody) return;
  tbody.innerHTML =
    '<tr><td colspan="5" class="empty">Loading accounts…</td></tr>';
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
    tbody.innerHTML = `<tr><td colspan="5" class="empty">${esc(e.message)} <button class="page-button" id="retry-users">Retry</button></td></tr>`;
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
        ["Country", country(u.countryCode)],
        ["Joined (UTC)", date(u.createdAt)],
        ["Verification status", v.status.replaceAll("_", " ")],
        ["Established method", v.method || "None"],
        ["ID upgrade", v.upgradeStatus.replaceAll("_", " ")],
        ["Verification environment", v.environment],
      ]
        .map(([k, val]) => `<div><dt>${k}</dt><dd>${esc(val)}</dd></div>`)
        .join("")}</dl>`;
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
    await loadScript(
      scriptOrigin + "/npm/@clerk/ui@1/dist/ui.browser.js",
    );
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
  awaiting_confirmation: "Awaiting creator confirmation",
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
  expired: "Expired / investigation required",
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
          : w.status === payoutDesk.filter)) &&
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
        return `<tr><td><button class="user-button" data-withdrawal="${esc(w.id)}"><span><strong>${esc(w.creatorName || `UID ${w.userId}`)}</strong><small>${esc(w.id)}</small></span></button></td><td>${esc(payoutRecipientName(w))}<small>${esc(w.route?.country || w.route?.countryCode)} · ${esc(w.route?.method)} · ${esc(w.route?.receiveCurrency)}</small></td><td>${esc(catalogMoney(w.grossCents))}</td><td>${w.quote ? `${esc(catalogMoney(w.quote.feeCents))} / ${esc(catalogMoney(w.quote.sendAmountCents))}` : "Actual quote needed"}${w.quote?.taxCents ? `<small>Tax ${esc(catalogMoney(w.quote.taxCents))}</small>` : ""}</td><td><span class="status ${w.status === "delivered" ? "verified" : payoutExceptions(w) ? "payout-exception" : "pending"}">${esc(payoutStatusNames[w.status] || w.status)}</span></td><td>${esc(w.checker?.status?.replaceAll("_", " ") || "Not checked")}${w.checker?.actor ? `<small>${esc(w.checker.actor)}</small>` : ""}</td><td>${esc(payoutTime(attempt?.evidence?.deadline || w.reviewDeadline))}</td><td><button class="page-button" data-withdrawal="${esc(w.id)}">Open details</button></td></tr>`;
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
    status.textContent = `${data.withdrawals.length} withdrawals loaded${data.truncated ? " · Limited to the newest 500 records" : ""}. Reconciliation remains available while preparation is paused. Repeat withdrawals ${data.policy?.repeatAllowed ? "follow the configured policy" : "await an approved policy"}.`;
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
    if (payoutDesk.detail?.status === "requested") {
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
        `Recipient amount · ${w.route.receiveCurrency}`,
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
    "Save quote for creator confirmation",
    {
      note: "Do not infer a USD 14.01 quote from the saved USD 15 fee sample. The creator must approve this exact quote in Pulse before preparation. Promotions cannot fund the withdrawal.",
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
    ["Transfer status", payoutStatusNames[w.status] || w.status],
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
  if (w.status === "awaiting_confirmation")
    actions +=
      '<p class="payout-callout">Waiting for the creator to approve the exact current quote in Pulse. Refresh after they confirm. Staff cannot approve it on their behalf.</p>';
  if (w.status === "requested")
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
        payoutInput("providerLink", "Actual first-time recipient link", {
          type: "url",
          required: attempt?.evidence?.kind === "first_time_link",
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
          note: "You make the final approve or decline decision. If approving, review and complete the provider action yourself in Remitly, then record the real issued link or transfer reference here. Saving this record does not send a payment, and it does not mark delivery verified.",
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
    !["delivered", "failed", "canceled", "returned", "unknown"].includes(
      w.status,
    )
  )
    actions += payoutForm(
      "unknown",
      "Report an uncertain or interrupted outcome",
      payoutEvidence("reason", "Reason and investigation notes"),
      "Record unknown outcome",
      {
        note: "Use this when a browser action may have completed or a receipt is missing. Reserved wallet coins stay unavailable to spend. Inspect provider history before any replacement attempt.",
      },
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
  target.innerHTML = `<section class="panel payout-detail-panel"><div class="panel-heading"><div><h2>Withdrawal ${esc(w.id)}</h2><p>Version ${esc(w.version)} · Updated ${esc(payoutTime(w.updatedAt))}</p></div><div class="payout-detail-toolbar"><button class="page-button" id="refresh-payout-detail">Refresh details</button><button class="page-button" id="close-payout-detail">Close</button></div></div><div class="payout-content"><dl class="payout-facts">${facts.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>${q ? `<section class="payout-quote"><h3>Current quote · creator ${w.approvedQuoteHash === q.hash ? "approved this exact quote" : "confirmation required"}</h3><p>Send ${esc(catalogMoney(q.sendAmountCents))} + fee ${esc(catalogMoney(q.feeCents))} + tax ${esc(catalogMoney(q.taxCents))} = ${esc(catalogMoney(q.totalEarningsDeductedCents))} total wallet deduction.</p><p>Recipient estimate: ${esc(q.receiveAmount)} ${esc(q.receiveCurrency)} · ${esc(q.fundingMethod)}. Promotion: ${esc(catalogMoney(q.promotionalDiscountCents))}, separate from fees.</p><p>Observed ${esc(payoutTime(q.observedAt))} · Expires ${esc(payoutTime(q.expiresAt))}</p><p class="payout-hash">Quote reference: ${esc(q.hash)}</p></section>` : '<p class="payout-callout">No exact signed-in provider quote recorded. Do not prepare a transfer from catalog fee estimates.</p>'}<div class="payout-links">${attempt?.evidence?.reviewUrl ? payoutLink(attempt.evidence.reviewUrl, "Review in Remitly") : ""}${w.providerLink ? payoutLink(w.providerLink, "Recipient link") : ""}${events.findLast((e) => e.evidence?.activityUrl)?.evidence?.activityUrl ? payoutLink(events.findLast((e) => e.evidence?.activityUrl).evidence.activityUrl, "Provider activity") : ""}</div>${["unknown", "expired"].includes(w.status) ? `<p class="payout-callout">${w.status === "expired" ? "Expired withdrawal" : "Unknown outcome"}: reservation retained. Replacement preparation is blocked until provider history resolves the existing attempt.</p>` : ""}${actions}<details class="payout-history"><summary>Evidence and history (${events.length} events)</summary>${events.map((e) => `<article><strong>${esc(e.action?.replaceAll("_", " "))}</strong><small>${esc(payoutTime(e.createdAt || e.created_at))}${e.actor ? ` · ${esc(e.actor)}` : ""}</small>${e.evidence ? `<pre>${esc(typeof e.evidence === "string" ? e.evidence : JSON.stringify(e.evidence, null, 2))}</pre>` : ""}</article>`).join("") || "<p>No events recorded.</p>"}</details></div></section>`;
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
    } else if (action === "unknown" || action === "decline")
      body = { reason: get("reason") };
    else if (action === "preparation") {
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

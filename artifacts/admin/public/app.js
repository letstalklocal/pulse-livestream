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
async function api(path) {
  const token = await window.Clerk?.session?.getToken();
  if (!token)
    throw Object.assign(new Error("Please sign in again."), { status: 401 });
  const r = await fetch("/api/admin-data" + path, {
    headers: { Authorization: "Bearer " + token },
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
function render() {
  if (!authorized) return;
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
  main.innerHTML = `<div class="page-heading"><div><div class="eyebrow">PULSE WORKSPACE</div><h1>${section}</h1><p>${section === "Overview" ? "Welcome back. Your community workspace." : section === "Users" ? "Find and review the people who make Pulse." : "Your space for " + section.toLowerCase() + "."}</p></div><div class="date-label">Read-only access</div></div>${section === "Overview" ? overview() : section === "Users" ? table() : section === "Account removals" ? removals() : section === "Verification" ? reviews() : operations[section] ? operationsPage() : `<section class="panel coming-soon"><span class="empty-icon">${icon(section)}</span><span class="tag">COMING NEXT</span><h2>${section}</h2><p>This section is not connected yet.</p><a class="primary-button" href="#users">Open user directory →</a></section>`}`;
  if (section === "Users" || section === "Overview") loadUsers();
  if (section === "Overview") loadOverview();
  if (section === "Account removals") loadRemovals();
  if (section === "Verification") loadReviews();
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
    await loadScript(
      config.frontendApi + "/npm/@clerk/ui@1/dist/ui.browser.js",
    );
    await loadScript(
      config.frontendApi + "/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
      { "data-clerk-publishable-key": config.publishableKey },
    );
    await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
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

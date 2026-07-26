const COOKIE_DOMAIN = "claude.ai";
const STORAGE_KEY = "accounts";

const statusEl = document.getElementById("status");
const labelInput = document.getElementById("labelInput");
const saveBtn = document.getElementById("saveBtn");
const detectBtn = document.getElementById("detectBtn");
const refreshUsageBtn = document.getElementById("refreshUsageBtn");
const listEl = document.getElementById("accountList");
const emptyStateEl = document.getElementById("emptyState");

const activeAccountValue = document.getElementById("activeAccountValue");
const savedAccountsValue = document.getElementById("savedAccountsValue");
const storageUsageValue = document.getElementById("storageUsageValue");
function showStatus(message, kind = "info") {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`;
}

function hideStatus() {
  statusEl.className = "status hidden";
}

function cookieBaseUrl(cookie) {
  const rawDomain = cookie.domain || COOKIE_DOMAIN;
  const domain = rawDomain.startsWith(".") ? rawDomain.slice(1) : rawDomain;
  const path = cookie.path || "/";
  return `https://${domain}${path}`;
}
function normalizeSameSite(value) {
  const allowed = new Set(["no_restriction", "lax", "strict", "unspecified"]);
  return allowed.has(value) ? value : "unspecified";
}

function buildCookieSetDetails(cookie) {
  if (!cookie || typeof cookie.name !== "string" || cookie.name.length === 0) {
    throw new Error("invalid cookie name");
  }
  if (typeof cookie.value !== "string") {
    throw new Error(`invalid value for cookie ${cookie.name}`);
  }

  const sameSite = normalizeSameSite(cookie.sameSite);
  const isHostPrefixed = cookie.name.startsWith("__Host-");
  const isSecurePrefixed = cookie.name.startsWith("__Secure-");
  const details = {
    url: cookieBaseUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    path: isHostPrefixed ? "/" : cookie.path || "/",
    secure: Boolean(cookie.secure) || sameSite === "no_restriction" || isHostPrefixed || isSecurePrefixed,
    sameSite,
  };

  if (!isHostPrefixed && !cookie.hostOnly && cookie.domain) details.domain = cookie.domain;
  if (!cookie.session && typeof cookie.expirationDate === "number" && cookie.expirationDate > Date.now() / 1000) {
    details.expirationDate = cookie.expirationDate;
  }

  return details;
}

async function getCurrentClaudeCookies() {
  return chrome.cookies.getAll({ domain: COOKIE_DOMAIN });
}

async function loadAccounts() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

async function saveAccounts(accounts) {
  await chrome.storage.local.set({ [STORAGE_KEY]: accounts });
}
async function getStorageBytes() {
  try {
    return await chrome.storage.local.getBytesInUse(STORAGE_KEY);
  } catch (e) {
    const accounts = await loadAccounts();
    return new Blob([JSON.stringify(accounts)]).size;
  }
}

function cookieName(cookie) {
  return typeof cookie?.name === "string" ? cookie.name : "";
}

function accountLabel(account) {
  return typeof account?.label === "string" ? account.label : "";
}

function findSessionCookie(cookies) {
  const validCookies = Array.isArray(cookies) ? cookies.filter((cookie) => cookieName(cookie)) : [];
  return (
    validCookies.find((cookie) => cookieName(cookie).toLowerCase() === "sessionkey") ||
    validCookies.find((cookie) => cookieName(cookie).toLowerCase().includes("session")) ||
    validCookies[0]
  );
}
function isImportantCookieName(name) {
  const normalized = String(name || "").toLowerCase();
  return normalized.includes("session") || normalized.includes("auth") || normalized.includes("token");
}

async function detectAccountInfo() {
  try {
    const res = await fetch("https://claude.ai/api/organizations", {
      credentials: "include",
    });
    if (!res.ok) return null;
    const orgs = await res.json();
    if (Array.isArray(orgs) && orgs.length > 0) {
      const org = orgs[0];
      return org.name || org.uuid || null;
    }
  } catch (e) {
    // best-effort only
  }
  return null;
}

async function handleDetect() {
  detectBtn.disabled = true;
  detectBtn.textContent = "...";
  try {
    const cookies = await getCurrentClaudeCookies();
    if (findSessionCookie(cookies) === undefined || cookies.length === 0) {
      showStatus("You're not logged into claude.ai in this browser right now.", "error");
      return;
    }
    const info = await detectAccountInfo();
    if (info) {
      labelInput.value = info;
      hideStatus();
    } else {
      showStatus("Couldn't auto-detect a name — type one manually.", "info");
    }
  } finally {
    detectBtn.disabled = false;
    detectBtn.textContent = "Detect";
  }
}

async function handleSave() {
  const label = labelInput.value.trim();
  if (!label) {
    showStatus("Give this login a label first.", "error");
    return;
  }

  const cookies = await getCurrentClaudeCookies();
  if (cookies.length === 0 || !findSessionCookie(cookies)) {
    showStatus("No active claude.ai login found. Log in first, then save.", "error");
    return;
  }

  const accounts = await loadAccounts();
  if (accounts.some((account) => accountLabel(account).toLowerCase() === label.toLowerCase())) {
    showStatus("An account with that label already exists.", "error");
    return;
  }

  const sessionCookie = findSessionCookie(cookies);
  accounts.push({
    id: crypto.randomUUID(),
    label,
    sessionValue: sessionCookie ? sessionCookie.value : null,
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
      hostOnly: c.hostOnly,
      session: c.session,
      expirationDate: c.expirationDate,
    })),
    savedAt: Date.now(),
  });

  await saveAccounts(accounts);
  labelInput.value = "";
  showStatus(`Saved "${label}".`, "success");
  render();
}

async function clearClaudeCookies() {
  const cookies = await getCurrentClaudeCookies();
  const results = await Promise.all(
    cookies.map(async (c) => {
      const removed = await chrome.cookies.remove({ url: cookieBaseUrl(c), name: c.name });
      return { name: c.name, ok: Boolean(removed) };
    })
  );
  return results;
}

async function applyAccountCookies(account) {
  const results = [];
  for (const cookie of account.cookies || []) {
    let details = null;
    try {
      details = buildCookieSetDetails(cookie);
      const set = await chrome.cookies.set(details);
      results.push({ name: cookie.name, ok: Boolean(set), error: set ? null : "rejected by browser" });
      if (!set && isImportantCookieName(cookie.name)) console.debug("Important cookie rejected", details);
    } catch (e) {
      results.push({ name: cookie && cookie.name ? cookie.name : "unknown", ok: false, error: e.message });
      if (isImportantCookieName(cookie && cookie.name)) {
        console.debug("Failed to set important cookie", cookie, details, e);
      } else {
        console.debug("Skipped non-essential cookie", cookie && cookie.name, e.message);
      }
    }
  }
  return results;
}

async function reloadClaudeTabs() {
  const tabs = await chrome.tabs.query({ url: "*://*.claude.ai/*" });
  if (tabs.length === 0) {
    await chrome.tabs.create({ url: "https://claude.ai/" });
    return;
  }
  for (const tab of tabs) {
    // Navigate to a clean URL rather than reloading — if the tab was sitting
    // on the /login?from=logout... redirect, a plain reload just repeats it.
    await chrome.tabs.update(tab.id, { url: "https://claude.ai/", active: true });
  }
}

async function handleSwitch(account) {
  showStatus(`Switching to "${account.label}"...`, "info");
  try {
    await clearClaudeCookies();
    const results = await applyAccountCookies(account);
    await markAccountUsed(account.id);
    await reloadClaudeTabs();

    const failedImportant = results.filter((r) => !r.ok && isImportantCookieName(r.name));
    const restored = results.filter((r) => r.ok).length;
    if (failedImportant.length > 0) {
      showStatus(
        `Switched, but important cookies failed: ${failedImportant.map((f) => f.name).join(", ")}.`,
        "error"
      );
    } else {
      showStatus(`Switched to "${account.label}". Restored ${restored} cookies.`, "success");
    }
  } catch (e) {
    console.error("Switch failed", e);
    showStatus(`Switch failed: ${e.message}`, "error");
  } finally {
    render();
  }
}

async function handleDelete(account) {
  const accounts = await loadAccounts();
  const next = accounts.filter((a) => a.id !== account.id);
  await saveAccounts(next);
  render();
}

async function handleRename(account, row) {
  const infoEl = row.querySelector(".account-info");
  infoEl.replaceChildren();
  const input = document.createElement("input");
  input.className = "rename-input";
  input.value = account.label;
  infoEl.appendChild(input);
  input.focus();
  input.select();

  const commit = async () => {
    const newLabel = input.value.trim();
    if (newLabel && newLabel !== account.label) {
      const accounts = await loadAccounts();
      const target = accounts.find((a) => a.id === account.id);
      if (target) {
        target.label = newLabel;
        await saveAccounts(accounts);
      }
    }
    render();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") render();
  });
  input.addEventListener("blur", commit);
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function formatDateTime(ts) {
  if (!ts) return "never";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCurrentAccount(accounts, currentValue) {
  if (!currentValue) return null;
  return accounts.find((account) => account.sessionValue === currentValue) || null;
}

function getOrgId(org) {
  return org && (org.uuid || org.id || org.organization_uuid || org.organization_id);
}

function normalizePercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  const pct = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(999, pct));
}

function getBucketPercent(bucket) {
  if (!bucket) return null;
  return normalizePercent(bucket.utilization_pct ?? bucket.utilization ?? bucket.percent_used);
}

function getBucketReset(bucket) {
  return bucket && (bucket.resets_at || bucket.reset_at || bucket.next_reset_at);
}

function formatPercent(value) {
  if (value === null) return "--";
  return `${Math.round(value)}%`;
}

function formatReset(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatMoney(value, currency) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  const amount = Math.abs(value) >= 1000 ? value / 100 : value;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}function setUsageCard(el, value, pct) {
  const card = el.closest(".usage-card");
  el.textContent = value;
  card.classList.remove("ok", "warn", "danger", "muted");
  if (pct === null) {
    card.classList.add("muted");
  } else if (pct >= 90) {
    card.classList.add("danger");
  } else if (pct >= 70) {
    card.classList.add("warn");
  } else {
    card.classList.add("ok");
  }
}

async function fetchJson(url, label) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`${label} failed (${res.status})`);
  return res.json();
}

async function fetchOptionalJson(url) {
  try {
    return await fetchJson(url, url);
  } catch (e) {
    return null;
  }
}

async function fetchClaudeUsage() {
  const orgs = await fetchJson("https://claude.ai/api/organizations", "organizations");
  const org = Array.isArray(orgs) ? orgs.find(getOrgId) : orgs;
  const orgId = getOrgId(org);
  if (!orgId) throw new Error("no organization id found");

  const base = `https://claude.ai/api/organizations/${orgId}`;
  const usage = await fetchJson(`${base}/usage`, "usage");

  return { org, usage };
}

async function updateUsageSummary(currentCookies) {
  if (currentCookies.length === 0 || !findSessionCookie(currentCookies)) {
    setUsageCard(activeAccountValue, "--", null);
    setUsageCard(savedAccountsValue, "--", null);
    setUsageCard(storageUsageValue, "--", null);
return;
  }

  refreshUsageBtn.disabled = true;
  try {
    const { usage } = await fetchClaudeUsage();
    const sessionPct = getBucketPercent(usage.five_hour);
    const weeklyPct = getBucketPercent(usage.seven_day);
    const reset = getBucketReset(usage.five_hour) || getBucketReset(usage.seven_day);

    setUsageCard(activeAccountValue, formatPercent(sessionPct), sessionPct);
    setUsageCard(savedAccountsValue, formatPercent(weeklyPct), weeklyPct);
    setUsageCard(storageUsageValue, formatReset(reset), null);
} catch (e) {
    setUsageCard(activeAccountValue, "--", null);
    setUsageCard(savedAccountsValue, "--", null);
    setUsageCard(storageUsageValue, "--", null);
} finally {
    refreshUsageBtn.disabled = false;
  }
}

async function markAccountUsed(accountId) {
  const accounts = await loadAccounts();
  const target = accounts.find((a) => a.id === accountId);
  if (!target) return;

  target.usage = target.usage || {};
  target.usage.switches = (target.usage.switches || 0) + 1;
  target.usage.lastSwitchedAt = Date.now();
  await saveAccounts(accounts);
}
async function render() {
  const [accounts, currentCookies] = await Promise.all([
    loadAccounts(),
    getCurrentClaudeCookies(),
  ]);
  const currentSession = findSessionCookie(currentCookies);
  const currentValue = currentSession ? currentSession.value : null;

    const currentAccount = getCurrentAccount(accounts, currentValue);

  await updateUsageSummary(currentCookies);
  listEl.replaceChildren();
  emptyStateEl.classList.toggle("hidden", accounts.length > 0);

  for (const account of accounts.filter((account) => accountLabel(account)).slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))) {
    const li = document.createElement("li");
    li.className = "account-row";

    const isCurrent = currentValue && account.sessionValue === currentValue;

    const info = document.createElement("div");
    info.className = "account-info";

    const labelRow = document.createElement("div");
    labelRow.className = "account-label";
    if (isCurrent) {
      const dot = document.createElement("span");
      dot.className = "current-dot";
      labelRow.appendChild(dot);
    }
    labelRow.appendChild(document.createTextNode(accountLabel(account)));

    const metaRow = document.createElement("div");
    metaRow.className = "account-meta";
    metaRow.textContent = `${isCurrent ? "Current - " : ""}Saved ${formatDate(account.savedAt)} - ${(account.cookies || []).length} cookies`;

    info.appendChild(labelRow);
    info.appendChild(metaRow);

    const switchBtn = document.createElement("button");
    switchBtn.className = "primary";
    switchBtn.textContent = isCurrent ? "Active" : "Switch";
    switchBtn.disabled = Boolean(isCurrent);
    switchBtn.addEventListener("click", () => handleSwitch(account));

    const renameBtn = document.createElement("button");
    renameBtn.className = "icon-btn";
    renameBtn.title = "Rename";
    renameBtn.textContent = "✎";
    renameBtn.addEventListener("click", () => handleRename(account, li));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn";
    deleteBtn.title = "Delete";
    deleteBtn.textContent = "🗑";
    deleteBtn.addEventListener("click", () => {
      if (confirm(`Delete saved account "${account.label}"?`)) {
        handleDelete(account);
      }
    });

    li.appendChild(info);
    li.appendChild(switchBtn);
    li.appendChild(renameBtn);
    li.appendChild(deleteBtn);
    listEl.appendChild(li);
  }
}

saveBtn.addEventListener("click", handleSave);
detectBtn.addEventListener("click", handleDetect);
refreshUsageBtn.addEventListener("click", render);
labelInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSave();
});

render();

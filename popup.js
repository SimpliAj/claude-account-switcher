const COOKIE_DOMAIN = "claude.ai";
const STORAGE_KEY = "accounts";

const statusEl = document.getElementById("status");
const labelInput = document.getElementById("labelInput");
const saveBtn = document.getElementById("saveBtn");
const detectBtn = document.getElementById("detectBtn");
const listEl = document.getElementById("accountList");
const emptyStateEl = document.getElementById("emptyState");

function showStatus(message, kind = "info") {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`;
}

function hideStatus() {
  statusEl.className = "status hidden";
}

function cookieBaseUrl(cookie) {
  const domain = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
  return `https://${domain}${cookie.path}`;
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

function findSessionCookie(cookies) {
  return (
    cookies.find((c) => c.name.toLowerCase() === "sessionkey") ||
    cookies.find((c) => c.name.toLowerCase().includes("session")) ||
    cookies[0]
  );
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
  if (accounts.some((a) => a.label.toLowerCase() === label.toLowerCase())) {
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
  for (const c of account.cookies) {
    const url = cookieBaseUrl(c);
    const details = {
      url,
      name: c.name,
      value: c.value,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite || "unspecified",
    };
    if (!c.hostOnly) details.domain = c.domain;
    if (!c.session && c.expirationDate) details.expirationDate = c.expirationDate;
    try {
      const set = await chrome.cookies.set(details);
      results.push({ name: c.name, ok: Boolean(set), error: set ? null : "rejected by browser" });
      if (!set) console.error("chrome.cookies.set silently rejected", details);
    } catch (e) {
      results.push({ name: c.name, ok: false, error: e.message });
      console.error("Failed to set cookie", c.name, details, e);
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
  await clearClaudeCookies();
  const results = await applyAccountCookies(account);
  await reloadClaudeTabs();

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    showStatus(
      `Switched, but ${failed.length}/${results.length} cookies failed to restore ` +
        `(${failed.map((f) => f.name).join(", ")}). Open the popup's DevTools console for details ` +
        `(right-click the extension icon → Inspect popup).`,
      "error"
    );
  } else {
    showStatus(`Switched to "${account.label}". Restored ${results.length} cookies.`, "success");
  }
  render();
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

async function render() {
  const [accounts, currentCookies] = await Promise.all([
    loadAccounts(),
    getCurrentClaudeCookies(),
  ]);
  const currentSession = findSessionCookie(currentCookies);
  const currentValue = currentSession ? currentSession.value : null;

  listEl.replaceChildren();
  emptyStateEl.classList.toggle("hidden", accounts.length > 0);

  for (const account of accounts.slice().sort((a, b) => b.savedAt - a.savedAt)) {
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
    labelRow.appendChild(document.createTextNode(account.label));

    const metaRow = document.createElement("div");
    metaRow.className = "account-meta";
    metaRow.textContent = `${isCurrent ? "Current · " : ""}Saved ${formatDate(account.savedAt)} · ${account.cookies.length} cookies`;

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
labelInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSave();
});

render();

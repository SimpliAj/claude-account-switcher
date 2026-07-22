# Claude Account Switcher

A small Chrome extension for people who juggle multiple [claude.ai](https://claude.ai) accounts. It snapshots the browser cookies for a logged-in account and lets you swap between saved accounts with one click — no manual logout/login required.

## How it works

Claude.ai (like most web apps) tracks your login via cookies on the `claude.ai` domain. This extension:

1. **Save current login** — reads all `claude.ai` cookies via the `chrome.cookies` API and stores them locally, under a label you choose.
2. **Switch** — clears the current `claude.ai` cookies, writes back the cookies saved for the chosen account, and reloads any open `claude.ai` tabs.

It's effectively an automated logout-of-one / login-as-another, without needing your password or 2FA each time.

## Install

1. Download/clone this repo.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select this folder.

## Usage

1. Log into claude.ai with one account.
2. Click the extension icon, type a label (e.g. "Work"), and click **Save current login**.
   - Optionally click **Detect** first — it tries to auto-fill the label from the account's organization name.
3. Log out and into another account, save it under a different label.
4. From then on, click the extension icon and hit **Switch** next to any saved account to jump straight to it.

## Notes & limitations

- Cookies are stored in `chrome.storage.local` — locally on your machine only, never synced. That said, it's stored **unencrypted**, so only use this on a computer you trust.
- This works by replaying session cookies. Some login methods (e.g. certain SSO/OAuth flows) tie session validity to more than just cookies and may periodically invalidate replayed sessions — if a saved account stops working, re-save it after logging in fresh.
- No data leaves your browser; there's no backend, telemetry, or external server involved.

## Permissions used

| Permission | Why |
|---|---|
| `cookies` | Read/write session cookies for `claude.ai` |
| `storage` | Persist saved account snapshots locally |
| `tabs` | Find and reload/navigate open `claude.ai` tabs after switching |
| `host_permissions` (`https://*.claude.ai/*`) | Scope cookie access and the auto-detect fetch to claude.ai only |

## License

MIT

# Privacy Policy – Claude Account Switcher

Last updated: July 22, 2026

This privacy policy applies to the browser extension **Claude Account Switcher** ("the extension"). The extension is an unofficial, independently developed tool and is not affiliated with, endorsed by, or sponsored by Anthropic PBC or claude.ai.

## 1. Data Controller

SimpliAj
Contact: [hello@simpliaj.xyz]

## 2. Purpose of the Extension

The extension lets you save multiple claude.ai login sessions locally in your browser and switch between them with one click, without having to manually log out and back in each time. This is the extension's single purpose.

## 3. What Data Is Processed

The extension processes only the following data:

- **Cookies for the domain `claude.ai`**: name, value, domain, path, expiration date, and the `Secure`, `HttpOnly`, and `SameSite` flags. These cookies contain the login session of a claude.ai account.
- **Labels you assign**: freely chosen text you enter when saving an account (e.g. "Work", "Personal") to tell saved logins apart.
- **Timestamps** of when an account was saved (used to sort the list).

The extension does not collect plaintext passwords, payment data, health data, location data, or browsing history. It does not read or monitor content on any website other than claude.ai.

## 4. How and Where Data Is Stored

All data is stored **locally in your browser only**, using the `chrome.storage.local` API. There is no backend server and no cloud sync operated by the extension. Your data never leaves your device and is never transmitted to the developer, to Anthropic, or to any other third party.

One exception: the optional "Detect" feature sends a request to `https://claude.ai/api/organizations` using your existing, already-present claude.ai browser session, to suggest an account name automatically. This request goes directly to Anthropic's own claude.ai servers — not to any server operated by the developer — and is used solely to prefill a suggested label in the input field.

## 5. Retention and Deletion

Saved accounts remain stored until you manually delete them within the extension or uninstall the extension. Uninstalling the extension also removes its local storage, per Chrome's standard behavior.

## 6. Sharing With Third Parties

Your data is never sold, shared, or transferred to any third party. It is used exclusively for the purpose described in Section 2.

## 7. Security Notice

Because `chrome.storage.local` does not encrypt its contents, saved cookie values are stored **unencrypted** on your device. Since these cookies grant access to your claude.ai account, only use this extension on devices you trust, and delete saved accounts you no longer need.

## 8. Your Rights / Controls

You can at any time:
- delete individual saved accounts using the trash icon in the extension's popup,
- remove all stored data by uninstalling the extension,
- clear the extension's local storage manually via `chrome://extensions` → the extension's details → storage.

## 9. Changes to This Policy

This privacy policy may be updated as the extension changes. The current version is always available at the URL listed in the Chrome Web Store listing.

## 10. Contact

For questions about this privacy policy: [your-email@example.com]

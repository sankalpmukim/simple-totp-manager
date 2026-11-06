# Simple TOTP Manager

A minimal, easy-to-use TOTP (Time-based One-Time Password) authenticator extension for Chrome and Firefox.

## Features

- 📱 Google Authenticator-like interface
- 🔐 Secure local storage of TOTP secrets
- 📋 Click-to-copy TOTP codes
- ⏱️ Live countdown timer for each code
- ➕ Easy account management (add/delete)
- 🎨 Clean, minimal UI
- 📤 Export/import accounts to/from CSV
- ⌨️ One-shortcut autofill: fill (and optionally submit) the 2FA code on a site's verification page

## Installation

### Development Mode

First, run the development server:

```bash
pnpm dev
# or
npm run dev
```

Then load the extension in your browser:

#### Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `build/chrome-mv3-dev` directory

> After pulling changes, restart `pnpm dev` (or `pnpm dev:firefox`) so the `-dev` build folders are regenerated, then reload the extension. A stale build folder won't have the newest features, such as the autofill shortcut.

#### Firefox

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on"
4. Select `manifest.json` from the `build/firefox-mv2-dev` directory

### Permanent Installation

Run the production build:

```bash
pnpm build
# or
npm run build
```

Then package the extension from the appropriate build directory and install manually or submit to the web stores.

## Usage

### Adding an Account

1. Click the extension icon in your browser toolbar
2. Click "+ Add Account"
3. Enter the account name (e.g., "Google", "GitHub")
4. Enter the TOTP secret (the base32 encoded key)
5. Click "Save"

### Copying TOTP Codes

1. Click on any TOTP code in the list
2. The code will be copied to your clipboard
3. The code will briefly turn green to confirm the copy

### Deleting an Account

1. Click the "×" button on the right side of any account
2. Confirm the deletion

### Export/Import Accounts

- **Export**: Click "Export" to download accounts as CSV
- **Import**: Click "Import" and select a CSV file to add accounts (duplicates are skipped)

### Autofill with a Keyboard Shortcut

Press **⌥⇧P** (Option+Shift+P on macOS, Alt+Shift+P elsewhere) on a site's 2FA page.

- **First time on a site**: a setup panel opens on the page.
  1. Pick which account the site uses (it suggests one from the site name).
  2. Click the code input. It works like the DevTools element picker: inputs are highlighted as you hover. A single input, separate digit boxes, and inputs inside shadow DOM all work. A detected field is shown dashed in green; press Enter to use it, or skip and let it auto-detect every time.
  3. Choose what happens after filling: click a submit button (pick it on the page), press Enter, let the site continue by itself, or do nothing.
- **After that**: the same shortcut fills the current code (and submits, if chosen) in one go. A small message confirms what happened and offers "Edit setup".

If the saved field can't be found, it falls back to auto-detection. If nothing is found, you can copy the code or point at the field again.

### Managing accounts and autofill

The ⚙ in the popup opens the **TOTP Manager** page. The ✎ next to an account opens that account's own page.

- **Accounts**: live codes (click to copy), add accounts (paste the base32 setup key *or* an `otpauth://` link, which also fills in the name; a code preview helps you check the secret), CSV import/export, and how many sites each account autofills.
- **Account page**: large code with a countdown, the secret (hidden until you reveal it, with a copy button), rename or change the secret, delete (which also removes its autofill sites), and that account's autofill sites.
- **Autofill sites**: edit any site by hand (✎), or **+ Add site** without the on-page picker. Set the hostname, account, code field (auto-detect, single input or separate boxes, as a CSS selector; use `>>>` to step into a shadow root) and what happens after filling. You can also pause, remove or re-pick a site, and see its last run and success rate.
- **Automatic filling (no shortcut)**: on a site with a saved code field, tick **“Fill automatically when the code field appears”** and choose a 1, 2, 3 or 5 second countdown. When the field shows up (also on single-page apps where it appears later), a toast with a filling ring says “Autofilling your *account* code in Ns”. **Esc**, **Cancel** or typing in the field yourself stops it; **Fill now** skips the wait. The code is generated only after the countdown, then filled and submitted as configured. There's at most one automatic attempt per page, and it waits while the tab is in the background. Turning it on asks your browser for access to that one site, and turning it off (or removing the site) gives the access back.
- **Shortcut check**: with the page open, press the shortcut. It confirms whether the browser delivered it.

The shortcut can be changed on `chrome://extensions/shortcuts` (Chrome) or under about:addons → ⚙ → Manage Extension Shortcuts (Firefox). Chrome does not allow ⌘⌥ combinations; Firefox does.

**Privacy**: by default the page script is injected only into the active tab, and only when you press the shortcut (`activeTab`), so the extension has no standing access to websites. Automatic filling is the exception: it runs only on the sites you turn it on for, using access you grant per site. Secrets never leave the extension; the page only receives the current 6-digit code, and only for a site you linked.

## TOTP Secret Format

The TOTP secret should be in base32 format, typically provided when setting up 2FA:

- Example: `JBSWY3DPEHPK3PXP`
- Spaces are automatically removed
- Case insensitive

## Security Note

This extension stores TOTP secrets in browser storage. While this is convenient for a simple extension, please be aware:

- Secrets are stored unencrypted in your browser's storage
- For production use, consider additional encryption layers
- Only use on trusted devices

## Technical Details

- **Framework**: Plasmo (React + TypeScript)
- **Manifest Version**: V3 (Chrome), V2 (Firefox)
- **Storage**: Browser storage via Plasmo
- **TOTP Algorithm**: HMAC-SHA1 with 30-second time step
- **Code Length**: 6 digits
- **Dependencies**: React, Plasmo, TypeScript

## File Structure

```
simple-totp-manager/
├── popup.tsx           # Main popup UI (React)
├── popup.css           # Styling
├── options.tsx/.css    # "Autofill settings" page
├── background.ts       # Shortcut handling, code generation, page-script injection
├── autofill/           # Shared types, storage helpers, browser API shim
├── injected/           # On-demand page script: detection, picker wizard, filling, toasts
├── totp.ts             # TOTP generation algorithm
├── utils.ts            # CSV import/export utilities
├── manifest.json       # Extension manifest (generated)
├── package.json        # Dependencies and scripts
├── tsconfig.json       # TypeScript configuration
├── icon.png            # Extension icon
└── README.md           # This file
```

## Browser Compatibility

- Chrome (Manifest V3)
- Firefox (Manifest V2)
- Edge (Manifest V3)

## License

MIT License - feel free to use and modify as needed.

## Contributing

This is a simple project meant for personal use. Feel free to fork and customize!

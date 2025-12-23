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

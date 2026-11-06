# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Simple TOTP Manager is a minimal browser extension that provides Google Authenticator-like functionality for generating TOTP codes directly in the browser. Built with Plasmo framework, it supports both Chrome (Manifest V3) and Firefox (Manifest V2).

## Development Setup

### Running the Extension

1. Install dependencies: `pnpm install`
2. Start development server: `pnpm dev`
3. Load the extension in your browser from the appropriate build directory:
   - Chrome: `build/chrome-mv3-dev`
   - Firefox: `build/firefox-mv2-dev`

The extension will auto-reload on code changes.

## Architecture

### Core Components

**popup.tsx** (popup.tsx:1)

- Main React component for the popup UI
- Manages account state with Plasmo's useStorage hook
- Handles TOTP code generation, clipboard copying, and account CRUD
- Uses React hooks for state management and effects
- Renders account list with live countdown timers

**totp.ts** (totp.ts:1)

- Pure TOTP implementation with TypeScript
- `base32Decode()` (totp.ts:6): Converts base32 secrets to Uint8Array
- `hmacSHA1()` (totp.ts:29): Uses Web Crypto API for HMAC-SHA1
- `generateTOTP()` (totp.ts:43): Main TOTP generation following RFC 6238
- `getRemainingTime()` (totp.ts:84): Calculates seconds remaining in current window

**utils.ts** (utils.ts:1)

- `exportToCSV()`: Exports accounts to CSV format
- `importFromCSV()`: Parses CSV and validates account data
- Account type definition

**Autofill (shortcut-driven)**

- `background.ts`: listens for the `autofill-totp` / `setup-autofill` commands. It injects the page script with `scripting.executeScript` under `activeTab` (no host permissions), generates the code (secrets never reach the page), and either sends `fill` or opens `setup`. The page script is imported via `url:./injected/autofill.ts` so Parcel bundles it as its own file. Before re-injecting, `parcelRequire*` globals are cleared, because the bundler's module cache would otherwise skip a re-run.
- `autofill/types.ts`: `SiteConfig` (one per exact hostname), locators, and message types. `autofill/storage.ts`: accounts come from the Plasmo default store (`sync`); site configs live in `local` under `totp_autofill_sites`.
- `injected/`: plain DOM code, no React. `detect.ts` scores OTP fields (single, split boxes, transparent input-otp style) and submit buttons. `locator.ts` builds selectors per shadow-root level plus an attribute fingerprint fallback. `fill.ts` fills via the native value setter and input/key/paste events, then submits. `wizard.ts` and `overlay.ts` draw the picker UI in a closed shadow root that is placed in the top layer.
- The wizard never guesses an account. With several accounts and no name match (`suggestAccount`), the user must choose before Next. A silently wrong pick fills codes from the wrong secret, and the site stays linked to that account.
- Adoption levels: account linked with auto-detect → saved field (fill only, or the site auto-submits) → fill + submit (click a saved button, or Enter).
- `options.tsx` (the "TOTP Manager" page) composes `manage/`: `accounts.tsx` (account list with live codes, add/edit form that accepts `otpauth://` links via `parseOtpauthURI` in utils.ts, account page with reveal/copy secret and delete, which cascades to that account's sites), `sites.tsx` (site cards and edit form), `shared.tsx` (hooks: `useTotpCodes`, `useAccountScope`, `useShortcuts`, `useCommandReceived`). Autofill features: "+ Add site" for manual setup (selectors typed as CSS, `>>>` between shadow-root levels; see `autofill/locatorText.ts`), `#account=<id>` scoping (the popup's ✎ per account), and a live shortcut check: the background broadcasts `commandReceived` on every press.
- Automatic filling (`SiteConfig.autoFill`): `background.ts` listens to `tabs.onUpdated`. That only reveals URLs of sites with granted access, so it arms only sites where the user turned it on. It sends `autoArm`, and `injected/auto.ts` watches for the saved field using selectors only (`resolveExact`, no fuzzy or heuristic match), shows `showCountdown` (overlay.ts), then requests the code (`getCode`), runs `runFill` and reports with `recordRun`. Per-site access lives in `autofill/permissions.ts`. Always request `http://host/*` and `https://host/*`: in Firefox `*://` also covers ws/wss, which the manifest doesn't declare, so a `*://host/*` request is refused. `permissions.request` must run synchronously inside a click/submit handler.
- The manifest declares the origins in both `optional_host_permissions` (MV3) and `optional_permissions` (Firefox MV2). Each browser ignores the other key: Chrome loads it without warnings, Firefox lint shows one warning.
- Chrome rejects `Command+Alt` shortcuts, both in the manifest and in its shortcut UI, so the default is `Alt+Shift+P`.
- Firefox needs the explicit gecko `id` (`$FIREFOX_EXT_ID` from `.env`). Without it `storage.sync` throws ("will not work with a temporary addon ID"), which breaks both accounts and autofill.

### Data Flow

1. **Initialization**: useStorage loads accounts from browser storage
2. **Live Updates**: useEffect sets 1-second interval → updateCodes regenerates all TOTP codes
3. **Add Account**: Form submission → validate → add to storage → state updates automatically
4. **Copy Code**: Click code → navigator.clipboard.writeText → visual feedback
5. **Delete Account**: Click delete → confirm → filter accounts → update storage
6. **Import/Export**: CSV parsing/generation with duplicate detection

### Storage Schema

Accounts stored via Plasmo storage (`chrome.storage.sync`, the Plasmo default area) as a JSON array:

```typescript
interface Account {
  id: number // timestamp from Date.now()
  name: string // account name
  secret: string // uppercase base32 secret
}
```

### Security Considerations

- Secrets stored **unencrypted** in browser storage (Plasmo uses localStorage)
- Input sanitization for account names
- No external network requests
- Clipboard API for secure copying

## Plasmo Framework

- **Build System**: Handles manifest generation for multiple browsers
- **Storage**: Abstraction over browser storage APIs
- **Hot Reload**: Auto-updates on code changes during development
- **TypeScript**: Full type safety with generated types

## Code Conventions

- React functional components with hooks
- TypeScript strict mode
- Async/await for crypto operations
- Prettier formatting with import sorting
- CSS modules/inline styles (popup.css)
- Error handling with try/catch in TOTP generation

## Common Modifications

When adding features:

- All TOTP logic is in totp.ts - keep it pure and testable
- Storage updates via useStorage trigger automatic re-renders
- Add new account fields by extending the Account interface
- Export/import can be extended for different formats (QR codes, etc.)
- Timer updates run every second - optimize if performance becomes an issue

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

### Data Flow

1. **Initialization**: useStorage loads accounts from browser storage
2. **Live Updates**: useEffect sets 1-second interval → updateCodes regenerates all TOTP codes
3. **Add Account**: Form submission → validate → add to storage → state updates automatically
4. **Copy Code**: Click code → navigator.clipboard.writeText → visual feedback
5. **Delete Account**: Click delete → confirm → filter accounts → update storage
6. **Import/Export**: CSV parsing/generation with duplicate detection

### Storage Schema

Accounts stored via Plasmo storage (localStorage under the hood) as JSON array:

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

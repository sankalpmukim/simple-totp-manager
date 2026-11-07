# Privacy Policy — Simple TOTP Manager

_Last updated: 2026-11-07_

Simple TOTP Manager does not collect, transmit, sell or share any personal data. It has no servers, no analytics and no tracking, and it makes no network requests.

## What the extension stores

- **Accounts**: the name and TOTP secret of each account you add.
- **Autofill sites**: for each site you set up, its hostname, the linked account, and how to find the code field and submit button.

This data is kept in your browser's extension storage. Accounts use `storage.sync`, so if you have browser sync turned on (for example Chrome or Firefox Sync), your browser syncs them between your own devices through your browser account. The developer never receives or sees this data. Secrets are stored unencrypted in that storage.

## Access to websites

- When you press the autofill shortcut, the extension runs a script in the current tab only (`activeTab`). The page receives the current 6-digit code, and only for a site you linked. Secrets never reach the page.
- Automatic filling runs only on sites where you turn it on, using access you grant to that single site. You can revoke it at any time.

## Your control

You can view, export, edit and delete all stored data from the extension's TOTP Manager page. Uninstalling the extension removes its stored data.

## Contact

Questions: open an issue at https://github.com/sankalpmukim/simple-totp-manager/issues

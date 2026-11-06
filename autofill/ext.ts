/**
 * Promise-based extension API handle that works on Chrome (MV3, `chrome.*`
 * returns promises) and Firefox (MV2, promises live on `browser.*`).
 */
export const ext: typeof chrome =
  (globalThis as unknown as { browser?: typeof chrome }).browser ?? chrome

export const isFirefox =
  typeof (globalThis as unknown as { browser?: unknown }).browser !==
    "undefined" && navigator.userAgent.includes("Firefox")

/** `action` on MV3, `browserAction` on MV2 */
export const actionApi: typeof chrome.action | undefined =
  ext.action ??
  (ext as unknown as { browserAction?: typeof chrome.action }).browserAction

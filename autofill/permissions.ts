/**
 * Per-site host access for "auto-fill when the page opens".
 *
 * The shortcut works through activeTab and needs no standing access. Filling
 * on page load does, so access is requested for one site at a time, when the
 * user turns auto-fill on for it, and removed again when they turn it off.
 */
import { ext } from "./ext"

/**
 * Match patterns for every page and port of an exact hostname. http and https
 * are listed separately: in Firefox `*://` also means ws/wss, which the
 * manifest doesn't declare, so a `*://host/*` request would be refused.
 */
export function originPatterns(host: string): string[] {
  return [`http://${host}/*`, `https://${host}/*`]
}

export async function hasHostAccess(host: string): Promise<boolean> {
  try {
    return await ext.permissions.contains({ origins: originPatterns(host) })
  } catch {
    return false
  }
}

/**
 * Must be called directly from a click or submit handler, before any await,
 * or the browser rejects the request for lacking a user gesture.
 */
export function requestHostAccess(host: string): Promise<boolean> {
  try {
    return ext.permissions
      .request({ origins: originPatterns(host) })
      .catch(() => false)
  } catch {
    return Promise.resolve(false)
  }
}

export async function removeHostAccess(host: string): Promise<void> {
  try {
    await ext.permissions.remove({ origins: originPatterns(host) })
  } catch {
    // already gone
  }
}

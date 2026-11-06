/**
 * Background script: handles the autofill keyboard shortcut.
 *
 * Flow on shortcut press:
 * 1. Inject the page script into the active tab (activeTab grant, no
 *    standing host permissions).
 * 2. If this host has a saved setup and a linked account, generate the code
 *    here (secrets never leave the extension) and send only the code.
 * 3. Otherwise open the setup wizard on the page.
 */
import pageScriptUrl from "url:./injected/autofill.ts"

import { actionApi, ext } from "./autofill/ext"
import { hasHostAccess } from "./autofill/permissions"
import {
  getAccounts,
  getSites,
  saveDraft,
  suggestAccount,
  summarizeAccounts,
  updateSite
} from "./autofill/storage"
import {
  COMMAND_AUTOFILL,
  COMMAND_SETUP,
  PAGE_SCRIPT_VERSION
} from "./autofill/types"
import type {
  BackgroundMessage,
  PageMessage,
  RunResult,
  SiteConfig,
  ToastLevel
} from "./autofill/types"
import { generateTOTP } from "./totp"

/** Bundled file name of the page script, at the extension root */
const PAGE_SCRIPT_FILE = pageScriptUrl.split(/[?#]/)[0].split("/").pop()!

interface Pong {
  ok: boolean
  version: number
  host: string
  protocol: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function sendToPage<T>(tabId: number, msg: PageMessage): Promise<T> {
  return (await ext.tabs.sendMessage(tabId, msg, { frameId: 0 })) as T
}

async function ping(tabId: number): Promise<Pong | null> {
  try {
    const pong = await sendToPage<Pong>(tabId, { type: "ping" })
    return pong?.ok && pong.version === PAGE_SCRIPT_VERSION ? pong : null
  } catch {
    return null
  }
}

/**
 * Runs in the page before (re)injection. Clears globals left by a previous
 * copy of the page script (e.g. after the extension was updated), otherwise
 * the bundler's module cache would skip running the new copy.
 */
function resetPageScriptGlobals() {
  const g = globalThis as unknown as Record<string, unknown>
  for (const key of Object.keys(g)) {
    if (key.indexOf("parcelRequire") === 0) delete g[key]
  }
  delete g.__totpAutofillReady
}

async function ensurePageScript(tabId: number): Promise<Pong | null> {
  const existing = await ping(tabId)
  if (existing) return existing
  try {
    await ext.scripting.executeScript({
      target: { tabId },
      func: resetPageScriptGlobals
    })
    await ext.scripting.executeScript({
      target: { tabId },
      files: [PAGE_SCRIPT_FILE]
    })
  } catch (e) {
    console.warn("[totp-autofill] cannot inject into this page:", e)
    return null
  }
  return ping(tabId)
}

/** Feedback for pages we cannot touch (browser pages, web stores, PDFs…) */
function flashBadge(tabId: number, text: string, color = "#d93025") {
  if (!actionApi) return
  actionApi.setBadgeBackgroundColor({ color, tabId })
  actionApi.setBadgeText({ text, tabId })
  setTimeout(() => actionApi.setBadgeText({ text: "", tabId }), 3000)
}

async function getShortcut(): Promise<string | undefined> {
  try {
    const commands = await ext.commands.getAll()
    return (
      commands.find((c) => c.name === COMMAND_AUTOFILL)?.shortcut || undefined
    )
  } catch {
    return undefined
  }
}

async function toast(tabId: number, level: ToastLevel, message: string) {
  try {
    await sendToPage(tabId, { type: "toast", level, message })
  } catch {
    flashBadge(tabId, "!")
  }
}

async function startSetup(tabId: number, host: string, reason?: string) {
  const [accounts, sites, shortcut] = await Promise.all([
    getAccounts(),
    getSites(),
    getShortcut()
  ])
  if (accounts.length === 0) {
    await toast(
      tabId,
      "info",
      "Add a TOTP account in the extension popup first, then press the shortcut again."
    )
    return
  }
  const summaries = summarizeAccounts(accounts)
  const existing = sites[host]
  await sendToPage(tabId, {
    type: "setup",
    host,
    accounts: summaries,
    suggestedAccountId: existing?.accountId ?? suggestAccount(host, summaries),
    existing,
    reason,
    shortcut
  })
}

function isSuccess(result: RunResult) {
  return result.outcome === "filled" || result.outcome === "submitted"
}

/** A code about to expire may be rejected by the time it is submitted */
async function freshCode(secret: string): Promise<string> {
  const msIntoWindow = Date.now() % 30000
  if (msIntoWindow > 28500) await sleep(30000 - msIntoWindow + 100)
  return generateTOTP(secret)
}

async function recordRun(
  host: string,
  result: RunResult,
  trigger: "shortcut" | "auto"
) {
  await updateSite(host, (s) => ({
    ...s,
    lastRun: {
      at: Date.now(),
      outcome: result.outcome,
      message: result.message,
      trigger
    },
    stats: {
      runs: (s.stats?.runs || 0) + 1,
      successes: (s.stats?.successes || 0) + (isSuccess(result) ? 1 : 0)
    }
  }))
}

async function fill(
  tabId: number,
  site: SiteConfig,
  secret: string,
  accountName: string
) {
  const code = await freshCode(secret)
  if (!/^\d+$/.test(code)) {
    await toast(
      tabId,
      "error",
      `Couldn't generate a code for ${accountName}. Check its secret.`
    )
    return
  }
  let result: RunResult
  try {
    result = await sendToPage<RunResult>(tabId, {
      type: "fill",
      site,
      code,
      accountName,
      shortcut: await getShortcut()
    })
  } catch (e) {
    result = { outcome: "error", message: String((e as Error)?.message || e) }
  }
  if (!result) return
  await recordRun(site.host, result, "shortcut")
}

async function runForTab(tabId: number, host: string) {
  const [sites, accounts] = await Promise.all([getSites(), getAccounts()])
  const site = sites[host]
  if (!site || site.needsSetup) return startSetup(tabId, host)

  const account = accounts.find((a) => a.id === site.accountId)
  if (!account) {
    return startSetup(
      tabId,
      host,
      "The account linked to this site was removed. Pick another one."
    )
  }
  if (!site.enabled) {
    return toast(
      tabId,
      "info",
      `Autofill is paused for ${host}. Turn it back on in Autofill settings.`
    )
  }
  return fill(tabId, site, account.secret, account.name)
}

async function handleCommand(command: string, tab?: chrome.tabs.Tab) {
  if (command !== COMMAND_AUTOFILL && command !== COMMAND_SETUP) return
  // Lets the "press the shortcut to test it" check in Autofill settings
  // confirm the browser delivered the keypress
  ext.runtime
    .sendMessage({ type: "commandReceived", command, at: Date.now() })
    .catch(() => undefined)

  if (!tab?.id) {
    ;[tab] = await ext.tabs.query({ active: true, currentWindow: true })
  }
  const tabId = tab?.id
  if (tabId === undefined) return
  // Our own pages (e.g. Autofill settings) can't be filled; no error badge
  if (tab?.url?.startsWith(ext.runtime.getURL(""))) return

  const pong = await ensurePageScript(tabId)
  if (!pong || !/^https?:$/.test(pong.protocol) || !pong.host) {
    flashBadge(tabId, "✕")
    return
  }
  try {
    if (command === COMMAND_SETUP) await startSetup(tabId, pong.host)
    else await runForTab(tabId, pong.host)
  } catch (e) {
    console.error("[totp-autofill]", e)
    await toast(tabId, "error", "Something went wrong. Try again.")
  }
}

ext.commands.onCommand.addListener((command, tab) => {
  void handleCommand(command, tab)
})

// ---------------------------------------------------------------------------
// Auto-fill when the page opens
//
// Only for sites where the user turned it on, which also granted host access
// for that one site. Without that grant tab.url is hidden from us and
// injection fails, so other sites are never touched.

async function maybeAutoArm(tabId: number, url?: string) {
  const host = hostOf(url)
  if (!host) return
  const site = (await getSites())[host]
  if (!site?.autoFill?.enabled || !site.enabled || site.needsSetup) return
  if (!site.field) return
  if (!(await hasHostAccess(host))) return
  const account = (await getAccounts()).find((a) => a.id === site.accountId)
  if (!account) return
  const pong = await ensurePageScript(tabId)
  if (!pong || pong.host !== host) return
  try {
    await sendToPage(tabId, {
      type: "autoArm",
      site,
      accountName: account.name,
      shortcut: await getShortcut()
    })
  } catch {
    // page navigated away meanwhile
  }
}

ext.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Full loads finish with status "complete"; single-page apps change the
  // URL of an already complete tab
  if (
    changeInfo.status === "complete" ||
    (changeInfo.url && tab.status === "complete")
  ) {
    void maybeAutoArm(tabId, tab.url)
  }
})

function hostOf(url?: string): string | null {
  try {
    const u = new URL(url || "")
    return /^https?:$/.test(u.protocol) ? u.hostname : null
  } catch {
    return null
  }
}

async function handleMessage(
  msg: BackgroundMessage,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  if (msg.type === "openOptions") {
    await ext.runtime.openOptionsPage()
    return { ok: true }
  }

  // Everything else must come from our page script in a real tab, and only
  // ever acts on the host that tab is actually showing.
  const tabId = sender.tab?.id
  const host = hostOf(sender.url ?? sender.tab?.url)
  if (tabId === undefined || !host || sender.id !== ext.runtime.id) {
    return { ok: false, error: "Not allowed here" }
  }

  switch (msg.type) {
    case "saveSite": {
      if (msg.draft.host !== host) return { ok: false, error: "Host mismatch" }
      const accounts = await getAccounts()
      if (!accounts.some((a) => a.id === msg.draft.accountId)) {
        return { ok: false, error: "That account no longer exists" }
      }
      await saveDraft(msg.draft)
      if (msg.fillNow) setTimeout(() => void runForTab(tabId, host), 50)
      return { ok: true }
    }
    case "getCode": {
      const [sites, accounts] = await Promise.all([getSites(), getAccounts()])
      const site = sites[host]
      const account = site && accounts.find((a) => a.id === site.accountId)
      if (!account)
        return { ok: false, error: "No account linked to this site" }
      const code = await freshCode(account.secret)
      if (!/^\d+$/.test(code)) {
        return {
          ok: false,
          error: `Couldn't generate a code for ${account.name}`
        }
      }
      return { ok: true, code }
    }
    case "recordRun": {
      const sites = await getSites()
      if (!sites[host]) return { ok: false, error: "Site not set up" }
      await recordRun(host, msg.result, msg.trigger)
      return { ok: true }
    }
    case "startSetup":
      await startSetup(tabId, host, msg.reason)
      return { ok: true }
  }
  return { ok: false, error: "Unknown message" }
}

ext.runtime.onMessage.addListener(
  (msg: BackgroundMessage, sender, sendResponse) => {
    handleMessage(msg, sender).then(sendResponse, (e: Error) =>
      sendResponse({ ok: false, error: String(e?.message || e) })
    )
    return true
  }
)

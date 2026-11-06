/**
 * Auto-fill when the page opens.
 *
 * Watches for the site's saved code field. When it appears (and the tab is
 * visible), shows a short countdown toast that Esc, Cancel or typing in the
 * field stops. Only after the countdown is the code requested, filled and,
 * if configured, submitted. At most one automatic attempt per page.
 */
import { DEFAULT_AUTO_FILL_DELAY, type SiteConfig } from "../autofill/types"
import { findSplitGroup, type FieldTarget } from "./detect"
import { isFillable } from "./dom"
import { resolveExact } from "./locator"
import { showCountdown, showToast, type CountdownHandle } from "./overlay"

/** Give up watching a page for the field after this long */
const WATCH_MS = 3 * 60 * 1000
const CHECK_THROTTLE_MS = 400

export interface AutoArmOptions {
  site: SiteConfig
  accountName: string
  shortcut?: string
  /** Request the code, fill, submit and report: the same path as the shortcut */
  run: (site: SiteConfig, accountName: string) => Promise<void>
}

interface Watch {
  key: string
  stop: () => void
  countdown?: CountdownHandle
}

/** Pages (by URL) that already had their one automatic attempt, or a cancel */
const handled = new Set<string>()
let watch: Watch | null = null

const pageKey = () => location.origin + location.pathname + location.search

/** Stop watching and silently drop any running countdown */
export function disarmAuto(markPage = false) {
  if (markPage) handled.add(pageKey())
  watch?.countdown?.dispose()
  watch?.stop()
  watch = null
}

function savedField(site: SiteConfig): FieldTarget | null {
  if (!site.field) return null
  const el = resolveExact(site.field.locator)
  if (!isFillable(el)) return null
  if (site.field.kind === "split") {
    const group = findSplitGroup(el)
    if (group) return { kind: "split", inputs: group }
  }
  return { kind: "single", inputs: [el] }
}

export function armAuto(opts: AutoArmOptions) {
  const { site, accountName } = opts
  const key = pageKey()
  if (handled.has(key) || watch?.key === key) return
  disarmAuto()

  const cleanups: (() => void)[] = []
  const state: Watch = {
    key,
    stop: () => cleanups.splice(0).forEach((fn) => fn())
  }
  watch = state

  let pending: ReturnType<typeof setTimeout> | undefined
  const scheduleCheck = () => {
    if (pending) return
    pending = setTimeout(() => {
      pending = undefined
      check()
    }, CHECK_THROTTLE_MS)
  }
  cleanups.push(() => clearTimeout(pending))

  const check = () => {
    if (watch !== state || state.countdown) return
    if (pageKey() !== key) return disarmAuto()
    const target = savedField(site)
    if (!target) return
    // Already has a value: the user, or a password manager, got there first
    if (target.inputs.some((i) => i.value.trim())) return disarmAuto(true)
    // Never fill in a tab the user isn't looking at
    if (document.visibilityState !== "visible") return
    startCountdown(target)
  }

  const observer = new MutationObserver(scheduleCheck)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class", "hidden", "disabled", "aria-hidden"]
  })
  cleanups.push(() => observer.disconnect())
  document.addEventListener("visibilitychange", check)
  cleanups.push(() => document.removeEventListener("visibilitychange", check))
  const giveUp = setTimeout(() => watch === state && disarmAuto(), WATCH_MS)
  cleanups.push(() => clearTimeout(giveUp))

  const startCountdown = (target: FieldTarget) => {
    // Stop watching the DOM; the countdown has its own checks
    state.stop()
    const local: (() => void)[] = []
    const cleanupLocal = () => local.splice(0).forEach((fn) => fn())
    cleanups.push(cleanupLocal)

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.preventDefault()
      e.stopPropagation()
      state.countdown?.cancel()
    }
    window.addEventListener("keydown", onKey, true)
    local.push(() => window.removeEventListener("keydown", onKey, true))

    // The user started typing the code themselves
    const onUserInput = (e: Event) => {
      if (e.isTrusted) state.countdown?.cancel()
    }
    for (const input of target.inputs) {
      input.addEventListener("input", onUserInput, true)
      local.push(() => input.removeEventListener("input", onUserInput, true))
    }

    // The field went away (navigation, re-render): drop it quietly and
    // watch again, since a new field may replace it
    const alive = setInterval(() => {
      if (target.inputs.every((i) => i.isConnected)) return
      state.countdown?.dispose()
      cleanupLocal()
      disarmAuto()
      armAuto(opts)
    }, 300)
    local.push(() => clearInterval(alive))

    const delaySec = site.autoFill?.delaySec ?? DEFAULT_AUTO_FILL_DELAY
    state.countdown = showCountdown({
      message: (s) => `Autofilling your ${accountName} code in ${s}s`,
      detail: "Press Esc to cancel",
      durationMs: delaySec * 1000,
      nowLabel: "Fill now",
      onComplete: () => {
        cleanupLocal()
        disarmAuto(true)
        void opts.run(site, accountName)
      },
      onCancel: () => {
        cleanupLocal()
        disarmAuto(true)
        showToast({
          level: "info",
          message: "Autofill cancelled",
          detail: opts.shortcut
            ? `Press ${opts.shortcut} to fill it when you're ready.`
            : "Use the autofill shortcut when you're ready.",
          duration: 3500
        })
      }
    })
  }

  check()
}

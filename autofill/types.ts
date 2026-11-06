/**
 * Shared types for the TOTP autofill feature.
 *
 * Used by the background script, the on-demand injected page script and the
 * options ("Autofill settings") page.
 */

/** Storage keys */
export const ACCOUNTS_KEY = "totp_accounts"
export const SITES_KEY = "totp_autofill_sites"

/** Command names declared in package.json -> manifest.commands */
export const COMMAND_AUTOFILL = "autofill-totp"
export const COMMAND_SETUP = "setup-autofill"

/**
 * One level of a locator. Elements living inside (open or closed) shadow
 * roots are located through a chain of steps: each step is resolved inside
 * the shadow root of the element found by the previous step.
 */
export interface LocatorStep {
  /** Candidate CSS selectors, most robust first */
  selectors: string[]
}

/** Attributes captured at setup time, used to re-find an element if every selector breaks */
export interface Fingerprint {
  tag: string
  type?: string
  id?: string
  name?: string
  autocomplete?: string
  inputMode?: string
  placeholder?: string
  ariaLabel?: string
  maxLength?: number
  /** Visible text, for buttons */
  text?: string
}

export interface ElementLocator {
  steps: LocatorStep[]
  fingerprint: Fingerprint
}

export type FieldKind = "single" | "split"

export interface FieldConfig {
  kind: FieldKind
  /** The input (single) or the first box (split) */
  locator: ElementLocator
  /** Number of boxes for split fields */
  length?: number
}

/**
 * What happens after the code is filled:
 * - none:  nothing, the user submits themselves
 * - auto:  nothing, the site submits on its own once the code is entered
 * - enter: press Enter in the field (submits the surrounding form)
 * - click: click a specific button
 */
export type SubmitMode = "none" | "auto" | "enter" | "click"

export interface SubmitConfig {
  mode: SubmitMode
  locator?: ElementLocator
}

export type RunOutcome =
  | "filled" // code filled, nothing else to do
  | "submitted" // code filled and submit performed
  | "partial" // code filled but submit step failed
  | "not-found" // code field could not be found
  | "fill-failed" // field found but the value did not stick
  | "error"

export interface RunRecord {
  at: number
  outcome: RunOutcome
  message: string
  /** How the run started; undefined means the shortcut (older records) */
  trigger?: "shortcut" | "auto"
}

export interface AutoFillConfig {
  enabled: boolean
  /** Countdown before filling, in seconds */
  delaySec: number
}

export const AUTO_FILL_DELAYS = [1, 2, 3, 5] as const
export const DEFAULT_AUTO_FILL_DELAY = 5

export interface SiteConfig {
  /** Exact hostname the config applies to, e.g. "github.com" */
  host: string
  /** Account.id of the linked TOTP account */
  accountId: number
  enabled: boolean
  /** Saved code field. Undefined means "auto-detect every time" */
  field?: FieldConfig
  submit: SubmitConfig
  /** When set, the next shortcut press opens setup instead of filling */
  needsSetup?: boolean
  /**
   * Fill without the shortcut when the saved field appears, after a short
   * cancellable countdown. Needs per-site host access granted at runtime.
   */
  autoFill?: AutoFillConfig
  createdAt: number
  updatedAt: number
  lastRun?: RunRecord
  stats: { runs: number; successes: number }
}

export type SiteMap = Record<string, SiteConfig>

export interface AccountSummary {
  id: number
  name: string
}

/** Result of a fill attempt, reported by the page script */
export interface RunResult {
  outcome: RunOutcome
  message: string
  /** True when the saved field was not found and a heuristic was used instead */
  usedFallback?: boolean
}

/** The part of a SiteConfig the setup wizard produces */
export interface SiteDraft {
  host: string
  accountId: number
  field?: FieldConfig
  submit: SubmitConfig
}

// ---------------------------------------------------------------------------
// Messages

/** background -> page */
export type PageMessage =
  | { type: "ping" }
  | {
      type: "fill"
      site: SiteConfig
      code: string
      accountName: string
      shortcut?: string
    }
  | {
      type: "setup"
      host: string
      accounts: AccountSummary[]
      suggestedAccountId?: number
      existing?: SiteConfig
      reason?: string
      shortcut?: string
    }
  | { type: "toast"; level: ToastLevel; message: string }
  | {
      type: "autoArm"
      site: SiteConfig
      accountName: string
      shortcut?: string
    }

export type ToastLevel = "success" | "info" | "error"

/** page -> background */
export type BackgroundMessage =
  | { type: "saveSite"; draft: SiteDraft; fillNow: boolean }
  | { type: "getCode" }
  | { type: "startSetup"; reason?: string }
  | { type: "openOptions" }
  | { type: "recordRun"; result: RunResult; trigger: "shortcut" | "auto" }

/** background -> extension pages (Autofill settings) */
export type ExtensionPageMessage = {
  type: "commandReceived"
  command: string
  at: number
}

export const PAGE_SCRIPT_VERSION = 1

/** Human readable summary of a locator for the UI */
export function locatorSummary(locator: ElementLocator): string {
  const last = locator.steps[locator.steps.length - 1]
  return last?.selectors[0] ?? locator.fingerprint.tag
}

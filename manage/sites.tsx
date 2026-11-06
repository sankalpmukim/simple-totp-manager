import { useEffect, useState } from "react"

import { ext } from "../autofill/ext"
import {
  locatorToText,
  normalizeHost,
  SHADOW_SEPARATOR,
  textToLocator,
  validateLocatorText
} from "../autofill/locatorText"
import {
  hasHostAccess,
  removeHostAccess,
  requestHostAccess
} from "../autofill/permissions"
import { siteLevel } from "../autofill/storage"
import {
  AUTO_FILL_DELAYS,
  DEFAULT_AUTO_FILL_DELAY,
  type AutoFillConfig,
  type FieldKind,
  type SiteConfig,
  type SubmitMode
} from "../autofill/types"
import type { Account } from "../utils"
import { OUTCOME_LABELS, PencilIcon, SUBMIT_LABELS, timeAgo } from "./shared"

// ---------------------------------------------------------------------------
// Auto-fill when the page opens

/** Whether the browser currently lets us run on this host on our own */
function useHostAccess(host: string): boolean | null {
  const [access, setAccess] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    const check = () =>
      void hasHostAccess(host).then((a) => live && setAccess(a))
    check()
    // The pinned @types/chrome lacks removeListener on these events
    type Ev = {
      addListener: (fn: () => void) => void
      removeListener: (fn: () => void) => void
    }
    const events = [
      ext.permissions.onAdded,
      ext.permissions.onRemoved
    ] as unknown as Ev[]
    events.forEach((ev) => ev.addListener(check))
    return () => {
      live = false
      events.forEach((ev) => ev.removeListener(check))
    }
  }, [host])
  return access
}

function DelaySelect({
  value,
  onChange,
  id
}: {
  value: number
  onChange: (delaySec: number) => void
  id?: string
}) {
  return (
    <select
      id={id}
      className="inline-select"
      aria-label="Countdown before filling"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}>
      {AUTO_FILL_DELAYS.map((d) => (
        <option key={d} value={d}>
          {d} second{d === 1 ? "" : "s"}
        </option>
      ))}
    </select>
  )
}

/** Toggle + delay on a site card. Turning it on asks the browser for access. */
function AutoFillControl({
  site,
  onChange
}: {
  site: SiteConfig
  onChange: (autoFill: AutoFillConfig) => void
}) {
  const access = useHostAccess(site.host)
  const [error, setError] = useState("")
  const enabled = !!site.autoFill?.enabled
  const delaySec = site.autoFill?.delaySec ?? DEFAULT_AUTO_FILL_DELAY

  if (!site.field) {
    return (
      <span className="muted">
        Off. Needs a saved code field first (edit the site, or pick it on the
        page).
      </span>
    )
  }

  // Called straight from the change event: the request needs the gesture
  const turnOn = () => {
    setError("")
    void requestHostAccess(site.host).then((granted) =>
      granted
        ? onChange({ enabled: true, delaySec })
        : setError(`Access to ${site.host} wasn't allowed, so this stays off.`)
    )
  }
  const turnOff = () => {
    setError("")
    onChange({ enabled: false, delaySec })
    void removeHostAccess(site.host)
  }

  return (
    <span className="stack">
      <label className="check-row">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => (e.target.checked ? turnOn() : turnOff())}
        />
        Fill automatically when the code field appears
      </label>
      {enabled ? (
        <span className="hint-inline inline-row">
          After a countdown of{" "}
          <DelaySelect
            value={delaySec}
            onChange={(d) => onChange({ enabled: true, delaySec: d })}
          />{" "}
          that Esc cancels.
        </span>
      ) : (
        <span className="hint-inline">
          No shortcut needed. Your browser asks once to allow access to{" "}
          {site.host}.
        </span>
      )}
      {enabled && access === false && (
        <span className="hint-inline bad-text">
          The browser no longer allows access to {site.host}, so this can't run.{" "}
          <button className="link" onClick={turnOn}>
            Allow again
          </button>
        </span>
      )}
      {!site.enabled && enabled && (
        <span className="hint-inline">Paused with the rest of this site.</span>
      )}
      {error && <span className="hint-inline bad-text">{error}</span>}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Edit / add form

interface FormProps {
  initial: SiteConfig | null
  accounts: Account[]
  defaultAccountId: number | null
  takenHosts: string[]
  onSave: (site: SiteConfig, previousHost?: string) => void
  onCancel: () => void
}

type FieldMode = "auto" | FieldKind

export function SiteForm({
  initial,
  accounts,
  defaultAccountId,
  takenHosts,
  onSave,
  onCancel
}: FormProps) {
  const [host, setHost] = useState(initial?.host ?? "")
  const [accountId, setAccountId] = useState<string>(() => {
    const id = initial?.accountId ?? defaultAccountId ?? accounts[0]?.id
    return accounts.some((a) => a.id === id) ? String(id) : ""
  })
  const [fieldMode, setFieldMode] = useState<FieldMode>(
    initial?.field?.kind ?? "auto"
  )
  const [fieldSelector, setFieldSelector] = useState(
    locatorToText(initial?.field?.locator)
  )
  const [boxes, setBoxes] = useState(String(initial?.field?.length ?? ""))
  const [submitMode, setSubmitMode] = useState<SubmitMode>(
    initial?.submit.mode ?? "none"
  )
  const [buttonSelector, setButtonSelector] = useState(
    locatorToText(initial?.submit.locator)
  )
  const [autoOn, setAutoOn] = useState(!!initial?.autoFill?.enabled)
  const [autoDelay, setAutoDelay] = useState(
    initial?.autoFill?.delaySec ?? DEFAULT_AUTO_FILL_DELAY
  )
  const [error, setError] = useState("")

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const cleanHost = normalizeHost(host)
    if (!cleanHost) return setError("Enter a site, like github.com")
    if (cleanHost !== initial?.host && takenHosts.includes(cleanHost)) {
      return setError(
        `${cleanHost} is already set up. Edit that entry instead.`
      )
    }
    if (!accountId) return setError("Choose an account")
    if (fieldMode !== "auto") {
      const problem = validateLocatorText(fieldSelector)
      if (problem) return setError(`Code field: ${problem}`)
    }
    if (buttonSelector.trim()) {
      const problem = validateLocatorText(buttonSelector)
      if (problem) return setError(`Submit button: ${problem}`)
    }
    const boxCount = Number(boxes)
    const now = Date.now()
    const site: SiteConfig = {
      enabled: true,
      createdAt: now,
      stats: { runs: 0, successes: 0 },
      ...initial,
      host: cleanHost,
      accountId: Number(accountId),
      field:
        fieldMode === "auto"
          ? undefined
          : {
              kind: fieldMode,
              locator: textToLocator(fieldSelector, initial?.field?.locator),
              length:
                fieldMode === "split" && boxCount > 0 ? boxCount : undefined
            },
      submit: {
        mode: submitMode,
        locator: buttonSelector.trim()
          ? textToLocator(buttonSelector, initial?.submit.locator)
          : undefined
      },
      autoFill: {
        enabled: autoOn && fieldMode !== "auto",
        delaySec: autoDelay
      },
      needsSetup: false,
      updatedAt: now
    }

    const hadAccess = initial?.autoFill?.enabled ? initial.host : null
    if (hadAccess && (!site.autoFill!.enabled || hadAccess !== cleanHost)) {
      void removeHostAccess(hadAccess)
    }
    if (site.autoFill!.enabled) {
      // Requested within the submit event: the browser needs the gesture
      void requestHostAccess(cleanHost).then((granted) => {
        if (granted) return onSave(site, initial?.host)
        setAutoOn(false)
        setError(
          `Access to ${cleanHost} wasn't allowed, so automatic filling is off. Save again to keep the other changes.`
        )
      })
      return
    }
    onSave(site, initial?.host)
  }

  return (
    <form className="site editing" onSubmit={save}>
      <div className="site-head">
        <h3>{initial ? `Edit ${initial.host}` : "Add a site"}</h3>
      </div>

      <div className="grid form-grid">
        <label className="key" htmlFor="f-host">
          Site
        </label>
        <span>
          <input
            id="f-host"
            className="text"
            placeholder="github.com or a full URL"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            autoFocus={!initial}
          />
          <span className="hint-inline">
            Exact hostname. login.example.com and example.com are different
            sites.
          </span>
        </span>

        <label className="key" htmlFor="f-account">
          Account
        </label>
        <span>
          <select
            id="f-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}>
            {!accountId && <option value="">Choose an account</option>}
            {accounts.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.name}
              </option>
            ))}
          </select>
        </span>

        <label className="key" htmlFor="f-field-mode">
          Code field
        </label>
        <span className="stack">
          <select
            id="f-field-mode"
            value={fieldMode}
            onChange={(e) => setFieldMode(e.target.value as FieldMode)}>
            <option value="auto">Auto-detect each time</option>
            <option value="single">Single input</option>
            <option value="split">Separate digit boxes</option>
          </select>
          {fieldMode !== "auto" && (
            <>
              <input
                className="text mono"
                aria-label="Code field CSS selector"
                placeholder={
                  fieldMode === "split"
                    ? 'First box, e.g. input[aria-label="Digit 1"]'
                    : 'e.g. input[name="otp"]'
                }
                value={fieldSelector}
                onChange={(e) => setFieldSelector(e.target.value)}
              />
              {fieldMode === "split" && (
                <input
                  className="text narrow"
                  type="number"
                  min={1}
                  max={10}
                  aria-label="Number of boxes"
                  placeholder="Boxes (optional)"
                  value={boxes}
                  onChange={(e) => setBoxes(e.target.value)}
                />
              )}
              <span className="hint-inline">
                CSS selector
                {fieldMode === "split" ? " for the first box" : ""}. Use{" "}
                <code>{SHADOW_SEPARATOR}</code> to step into a shadow root, e.g.{" "}
                <code>my-widget {SHADOW_SEPARATOR} input</code>. If it stops
                matching, the field is auto-detected.
              </span>
            </>
          )}
        </span>

        <label className="key" htmlFor="f-submit">
          After filling
        </label>
        <span className="stack">
          <select
            id="f-submit"
            value={submitMode}
            onChange={(e) => setSubmitMode(e.target.value as SubmitMode)}>
            {(Object.keys(SUBMIT_LABELS) as SubmitMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {SUBMIT_LABELS[mode]}
              </option>
            ))}
          </select>
          {submitMode === "click" && (
            <>
              <input
                className="text mono"
                aria-label="Submit button CSS selector"
                placeholder='Blank finds it automatically, e.g. button[type="submit"]'
                value={buttonSelector}
                onChange={(e) => setButtonSelector(e.target.value)}
              />
            </>
          )}
        </span>

        <label className="key" htmlFor="f-auto">
          On page load
        </label>
        <span className="stack">
          <label className="check-row">
            <input
              id="f-auto"
              type="checkbox"
              checked={autoOn && fieldMode !== "auto"}
              disabled={fieldMode === "auto"}
              onChange={(e) => setAutoOn(e.target.checked)}
            />
            Fill automatically when the code field appears
          </label>
          {fieldMode === "auto" ? (
            <span className="hint-inline">
              Needs a saved code field, so it never fills the wrong input.
            </span>
          ) : autoOn ? (
            <span className="hint-inline inline-row">
              After a countdown of{" "}
              <DelaySelect value={autoDelay} onChange={setAutoDelay} /> that Esc
              cancels. Saving asks your browser to allow access to this site.
            </span>
          ) : (
            <span className="hint-inline">
              No shortcut needed: a countdown appears, then it fills (and
              submits, if set above).
            </span>
          )}
        </span>
      </div>

      {error && <p className="warning">{error}</p>}

      <div className="site-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary">
          Save
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Site card (view mode)

export function SiteCard({
  site,
  accounts,
  onToggle,
  onAutoFill,
  onEdit,
  onRepick,
  onDelete
}: {
  site: SiteConfig
  accounts: Account[]
  onToggle: (enabled: boolean) => void
  onAutoFill: (autoFill: AutoFillConfig) => void
  onEdit: () => void
  onRepick: () => void
  onDelete: () => void
}) {
  const level = siteLevel(site)
  const account = accounts.find((a) => a.id === site.accountId)

  let fieldText = "Auto-detect each time"
  if (site.field) {
    fieldText =
      site.field.kind === "split"
        ? `${site.field.length ?? "Separate"} separate boxes`
        : "Single input"
  }

  const run = site.lastRun
  const runOk = run && (run.outcome === "filled" || run.outcome === "submitted")
  const rate =
    site.stats?.runs > 0
      ? Math.round((site.stats.successes / site.stats.runs) * 100)
      : null

  return (
    <div className={`site${site.enabled ? "" : " paused"}`}>
      <div className="site-head">
        <div className="site-title">
          <span className="host">{site.host}</span>
          <span className={`level level-${level.level}`}>{level.label}</span>
          {site.needsSetup && (
            <span className="level warn">Re-pick pending</span>
          )}
        </div>
        <div className="site-tools">
          <button
            className="icon-btn"
            title={`Edit ${site.host}`}
            aria-label={`Edit ${site.host}`}
            onClick={onEdit}>
            <PencilIcon />
          </button>
          <label className="switch" title={site.enabled ? "On" : "Paused"}>
            <input
              type="checkbox"
              checked={site.enabled}
              onChange={(e) => onToggle(e.target.checked)}
            />
            <span className="slider" />
            <span className="switch-label">
              {site.enabled ? "On" : "Paused"}
            </span>
          </label>
        </div>
      </div>

      <div className="grid">
        <span className="key">Account</span>
        <span>
          {account ? (
            account.name
          ) : (
            <span className="bad-text">Removed account. Edit to pick one</span>
          )}
        </span>

        <span className="key">Code field</span>
        <span>
          {fieldText}
          {site.field && (
            <code className="selector">
              {locatorToText(site.field.locator)}
            </code>
          )}
        </span>

        <span className="key">After filling</span>
        <span>
          {SUBMIT_LABELS[site.submit.mode]}
          {site.submit.mode === "click" && (
            <span className="hint-inline">
              {site.submit.locator ? (
                <>
                  Button{" "}
                  <code className="selector">
                    {locatorToText(site.submit.locator)}
                  </code>
                </>
              ) : (
                "No button saved, so it looks for one each time"
              )}
            </span>
          )}
        </span>

        <span className="key">On page load</span>
        <AutoFillControl site={site} onChange={onAutoFill} />

        <span className="key">Last run</span>
        <span>
          {run ? (
            <>
              <span
                className={`dot ${runOk ? "ok" : run.outcome === "partial" ? "warn" : "bad"}`}
              />
              {OUTCOME_LABELS[run.outcome]}
              {run.trigger === "auto" ? " automatically" : ""} ·{" "}
              {timeAgo(run.at)}
              <div className="muted small">{run.message}</div>
            </>
          ) : (
            <span className="muted">Never used</span>
          )}
          {rate !== null && (
            <div className="muted small">
              {site.stats.runs} run{site.stats.runs === 1 ? "" : "s"} · {rate}%
              successful
            </div>
          )}
        </span>
      </div>

      <div className="site-actions">
        <button
          className="btn"
          disabled={site.needsSetup}
          title="The next shortcut press on this site opens the on-page picker again"
          onClick={onRepick}>
          Re-pick on page
        </button>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm(`Remove autofill for ${site.host}?`)) onDelete()
          }}>
          Remove
        </button>
      </div>
    </div>
  )
}

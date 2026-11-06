import { useState } from "react"

import {
  locatorToText,
  normalizeHost,
  SHADOW_SEPARATOR,
  textToLocator,
  validateLocatorText
} from "../autofill/locatorText"
import { siteLevel } from "../autofill/storage"
import type { FieldKind, SiteConfig, SubmitMode } from "../autofill/types"
import type { Account } from "../utils"
import { OUTCOME_LABELS, PencilIcon, SUBMIT_LABELS, timeAgo } from "./shared"

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
      needsSetup: false,
      updatedAt: now
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
  onEdit,
  onRepick,
  onDelete
}: {
  site: SiteConfig
  accounts: Account[]
  onToggle: (enabled: boolean) => void
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

        <span className="key">Last run</span>
        <span>
          {run ? (
            <>
              <span
                className={`dot ${runOk ? "ok" : run.outcome === "partial" ? "warn" : "bad"}`}
              />
              {OUTCOME_LABELS[run.outcome]} · {timeAgo(run.at)}
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

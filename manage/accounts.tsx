import { useEffect, useState } from "react"

import { generateTOTP } from "../totp"
import {
  normalizeSecret,
  parseOtpauthURI,
  validateSecret,
  type Account
} from "../utils"
import {
  BackIcon,
  CopyIcon,
  EyeIcon,
  formatCode,
  PencilIcon,
  useCopied
} from "./shared"

// ---------------------------------------------------------------------------
// Add / edit form

export function AccountForm({
  initial,
  takenNames,
  onSave,
  onCancel
}: {
  initial?: Account
  takenNames: string[]
  onSave: (account: Account) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [secret, setSecret] = useState("")
  const [fromLink, setFromLink] = useState<string[] | null>(null)
  const [error, setError] = useState("")
  const [preview, setPreview] = useState("")

  // Pasting an otpauth:// link fills in the secret and the name
  const onSecretChange = (value: string) => {
    const parsed = parseOtpauthURI(value)
    if (parsed) {
      setSecret(parsed.secret)
      if (!name.trim() && parsed.name) setName(parsed.name)
      setFromLink(parsed.warnings)
    } else {
      setSecret(value)
      setFromLink(null)
    }
    setError("")
  }

  // Show the code the secret produces, to compare with the site or another app
  useEffect(() => {
    let cancelled = false
    if (!secret.trim() || validateSecret(secret)) {
      setPreview("")
      return
    }
    void generateTOTP(normalizeSecret(secret)).then(
      (code) => !cancelled && setPreview(code)
    )
    return () => {
      cancelled = true
    }
  }, [secret])

  const duplicate =
    name.trim() &&
    takenNames.some(
      (n) =>
        n.toLowerCase() === name.trim().toLowerCase() &&
        n.toLowerCase() !== initial?.name.toLowerCase()
    )

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) return setError("Enter a name, like “GitHub”")
    const keepSecret = !!initial && !secret.trim()
    if (!keepSecret) {
      const problem = validateSecret(secret)
      if (problem) return setError(problem)
    }
    onSave({
      id: initial?.id ?? Date.now(),
      name: cleanName,
      secret: keepSecret ? initial!.secret : normalizeSecret(secret)
    })
  }

  return (
    <form className="site editing account-form" onSubmit={save}>
      <div className="site-head">
        <h3>{initial ? `Edit ${initial.name}` : "Add an account"}</h3>
      </div>
      <div className="grid form-grid">
        <label className="key" htmlFor="a-name">
          Name
        </label>
        <span className="stack">
          <input
            id="a-name"
            className="text"
            placeholder="e.g. GitHub"
            value={name}
            autoFocus={!initial}
            onChange={(e) => {
              setName(e.target.value)
              setError("")
            }}
          />
          {duplicate && (
            <span className="hint-inline">
              Another account has this name. A different name makes them easier
              to tell apart.
            </span>
          )}
        </span>

        <label className="key" htmlFor="a-secret">
          {initial ? "New secret" : "Secret"}
        </label>
        <span className="stack">
          <input
            id="a-secret"
            className="text mono"
            autoComplete="off"
            spellCheck={false}
            placeholder={
              initial
                ? "Leave blank to keep the current secret"
                : "Base32 secret or otpauth:// link"
            }
            value={secret}
            onChange={(e) => onSecretChange(e.target.value)}
          />
          {fromLink && (
            <span className="hint-inline">
              Read the secret{name ? " and name" : ""} from the otpauth link.
            </span>
          )}
          {fromLink?.map((w) => (
            <span key={w} className="hint-inline bad-text">
              {w}. Codes may not match.
            </span>
          ))}
          {!fromLink && (
            <span className="hint-inline">
              The setup key shown next to the QR code, or the otpauth:// link it
              contains. Spaces are ignored.
            </span>
          )}
          {initial && secret.trim() && (
            <span className="hint-inline bad-text">
              Changing the secret changes every code for this account.
            </span>
          )}
        </span>

        {preview && (
          <>
            <span className="key">Current code</span>
            <span className="preview-code">{formatCode(preview)}</span>
          </>
        )}
      </div>

      {error && <p className="warning">{error}</p>}

      <div className="site-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary">
          {initial ? "Save" : "Add account"}
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Shared bits

function Timer({ remaining }: { remaining: number }) {
  return (
    <div className="timer" title={`${remaining}s left`}>
      <div
        className={`timer-bar${remaining <= 5 ? " low" : ""}`}
        style={{ width: `${(remaining / 30) * 100}%` }}
      />
    </div>
  )
}

function CodeButton({
  code,
  copied,
  onCopy,
  large = false
}: {
  code?: string
  copied: boolean
  onCopy: () => void
  large?: boolean
}) {
  const ready = !!code && /^\d+$/.test(code)
  return (
    <button
      className={`code-btn${large ? " large" : ""}${copied ? " copied" : ""}`}
      disabled={!ready}
      title={ready ? "Copy code" : "Invalid secret"}
      onClick={onCopy}>
      {copied ? "Copied" : ready ? formatCode(code) : "------"}
    </button>
  )
}

// ---------------------------------------------------------------------------
// All accounts

export function AccountsPanel({
  accounts,
  siteCounts,
  codes,
  remaining,
  adding,
  onStartAdd,
  onAdd,
  onCancelAdd,
  onOpen,
  onImport,
  onExport
}: {
  accounts: Account[]
  siteCounts: Record<number, number>
  codes: Record<number, string>
  remaining: number
  adding: boolean
  onStartAdd: () => void
  onAdd: (account: Account) => void
  onCancelAdd: () => void
  onOpen: (id: number) => void
  onImport: () => void
  onExport: () => void
}) {
  const [copied, copy] = useCopied()

  return (
    <section>
      <div className="list-head">
        <h2>
          Accounts <span className="count">{accounts.length}</span>
        </h2>
        <div className="list-tools">
          <button className="link" onClick={onImport}>
            Import CSV
          </button>
          <button
            className="link"
            disabled={accounts.length === 0}
            onClick={onExport}>
            Export CSV
          </button>
          <button
            className="btn primary"
            disabled={adding}
            onClick={onStartAdd}>
            + Add account
          </button>
        </div>
      </div>

      {adding && (
        <AccountForm
          takenNames={accounts.map((a) => a.name)}
          onSave={onAdd}
          onCancel={onCancelAdd}
        />
      )}

      {accounts.length === 0 && !adding ? (
        <div className="empty">
          <p>No accounts yet.</p>
          <p className="muted">
            Add one with the setup key from a site's 2FA settings, or import a
            CSV.
          </p>
        </div>
      ) : (
        <div className="accounts">
          {accounts.map((account) => {
            const count = siteCounts[account.id] || 0
            return (
              <div key={account.id} className="account-row">
                <button
                  className="account-main"
                  onClick={() => onOpen(account.id)}
                  title={`Manage ${account.name}`}>
                  <span className="account-title">{account.name}</span>
                  <span className={`chip${count ? " on" : ""}`}>
                    {count
                      ? `Autofill on ${count} site${count === 1 ? "" : "s"}`
                      : "No autofill"}
                  </span>
                </button>
                <div className="account-code">
                  <CodeButton
                    code={codes[account.id]}
                    copied={copied === `code-${account.id}`}
                    onCopy={() =>
                      copy(`code-${account.id}`, codes[account.id] || "")
                    }
                  />
                  <Timer remaining={remaining} />
                </div>
                <button
                  className="icon-btn"
                  title={`Manage ${account.name}`}
                  aria-label={`Manage ${account.name}`}
                  onClick={() => onOpen(account.id)}>
                  <PencilIcon />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// One account

export function AccountDetail({
  account,
  accounts,
  code,
  remaining,
  siteHosts,
  onBack,
  onSave,
  onDelete
}: {
  account: Account
  accounts: Account[]
  code?: string
  remaining: number
  siteHosts: string[]
  onBack: () => void
  onSave: (account: Account) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [copied, copy] = useCopied()

  // Hide the secret again when switching accounts
  useEffect(() => {
    setReveal(false)
    setEditing(false)
  }, [account.id])

  const grouped = account.secret.replace(/(.{4})/g, "$1 ").trim()

  const confirmDelete = () => {
    const sites = siteHosts.length
      ? `\n\nAutofill for ${siteHosts.join(", ")} will be removed too.`
      : ""
    if (
      confirm(
        `Delete ${account.name}?\n\nYou won't be able to get codes for it here anymore. Export your accounts first if you might need it.${sites}`
      )
    ) {
      onDelete()
    }
  }

  return (
    <section className="account-detail">
      <button className="link back" onClick={onBack}>
        <BackIcon /> All accounts
      </button>

      {editing ? (
        <AccountForm
          initial={account}
          takenNames={accounts.map((a) => a.name)}
          onSave={(updated) => {
            onSave(updated)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="panel">
          <div className="detail-head">
            <h2 className="detail-name">{account.name}</h2>
            <button className="btn" onClick={() => setEditing(true)}>
              <PencilIcon /> Edit
            </button>
          </div>

          <div className="detail-code">
            <CodeButton
              large
              code={code}
              copied={copied === "code"}
              onCopy={() => copy("code", code || "")}
            />
            <Timer remaining={remaining} />
            <span className="muted small">
              Click the code to copy it · {remaining}s left
            </span>
          </div>

          <div className="grid">
            <span className="key">Secret</span>
            <span className="secret-row">
              <code className={`secret${reveal ? "" : " hidden"}`}>
                {reveal ? grouped : "•••• •••• •••• ••••"}
              </code>
              <button
                className="icon-btn"
                title={reveal ? "Hide secret" : "Show secret"}
                aria-label={reveal ? "Hide secret" : "Show secret"}
                onClick={() => setReveal(!reveal)}>
                <EyeIcon off={reveal} />
              </button>
              <button
                className="icon-btn"
                title="Copy secret"
                aria-label="Copy secret"
                onClick={() => copy("secret", account.secret)}>
                <CopyIcon />
              </button>
              {copied === "secret" && (
                <span className="muted small">Copied</span>
              )}
            </span>
          </div>

          <div className="site-actions">
            <button className="btn danger" onClick={confirmDelete}>
              Delete account
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

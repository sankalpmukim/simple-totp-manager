import { useEffect, useMemo, useRef, useState } from "react"

import { useStorage } from "@plasmohq/storage/hook"

import { siteStorage } from "./autofill/storage"
import {
  ACCOUNTS_KEY,
  COMMAND_AUTOFILL,
  COMMAND_SETUP,
  SITES_KEY
} from "./autofill/types"
import type { SiteConfig, SiteMap } from "./autofill/types"
import { AccountDetail, AccountsPanel } from "./manage/accounts"
import {
  openShortcutSettings,
  Shortcut,
  timeAgo,
  useAccountScope,
  useCommandReceived,
  useShortcuts,
  useTotpCodes
} from "./manage/shared"
import { SiteCard, SiteForm } from "./manage/sites"
import { exportToCSV, importFromCSV, type Account } from "./utils"

import "./options.css"

type Notice = { level: "ok" | "error"; text: string } | null

function ShortcutPanel({
  shortcuts,
  commandAt
}: {
  shortcuts: Record<string, string>
  commandAt: number | null
}) {
  const mainShortcut = shortcuts[COMMAND_AUTOFILL]
  return (
    <section className="panel">
      <div className="row">
        <div>
          <h2>Keyboard shortcut</h2>
          <p className="muted">
            Press it on a site's 2FA page. On a new site it opens a picker so
            you can point at the code field once.
          </p>
        </div>
        <div className="shortcut">
          <Shortcut value={mainShortcut} />
          <button className="btn" onClick={openShortcutSettings}>
            Change
          </button>
        </div>
      </div>
      {!mainShortcut ? (
        <p className="warning">
          No shortcut is assigned, often because another extension already uses
          it. Pick one with “Change”.
        </p>
      ) : (
        <p
          className={`check ${commandAt ? "ok" : ""}`}
          role="status"
          aria-live="polite">
          {commandAt ? (
            <>
              ✓ The browser delivered the shortcut ({timeAgo(commandAt)}). It
              works.
            </>
          ) : (
            <>
              Test it: press <Shortcut value={mainShortcut} /> while this page
              is open.
            </>
          )}
        </p>
      )}
      <p className="muted small">
        Edit an existing site's setup on the page:{" "}
        <Shortcut value={shortcuts[COMMAND_SETUP]} />
        {!shortcuts[COMMAND_SETUP] && " (optional, assign one with “Change”)"},
        or use “Edit setup” in the message that appears after filling.
      </p>
    </section>
  )
}

function LevelsPanel() {
  return (
    <section className="panel levels">
      <h2>What autofill does on each site</h2>
      <ol>
        <li>
          <span className="level level-1">Linked</span> The account is linked
          and the code field is found automatically.
        </li>
        <li>
          <span className="level level-2">Fill</span> The code field is saved.
          The code is filled and you, or the site, submit it.
        </li>
        <li>
          <span className="level level-3">Fill + submit</span> It also clicks
          the submit button or presses Enter for you.
        </li>
      </ol>
    </section>
  )
}

function OptionsPage() {
  const [accounts, setAccounts, { isLoading: accountsLoading }] = useStorage<
    Account[]
  >(ACCOUNTS_KEY, [])
  const [sites, setSites] = useStorage<SiteMap>(
    { key: SITES_KEY, instance: siteStorage },
    {}
  )
  const shortcuts = useShortcuts()
  const commandAt = useCommandReceived()
  const [scope, setScope] = useAccountScope()
  const [filter, setFilter] = useState("")
  const [editing, setEditing] = useState<string | null>(null) // host or "new"
  const [addingAccount, setAddingAccount] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const accountList = accounts || []
  const { codes, remaining } = useTotpCodes(accountList)
  const scopedAccount =
    scope === null ? undefined : accountList.find((a) => a.id === scope)
  const missingAccount = scope !== null && !accountsLoading && !scopedAccount

  const all = Object.values(sites || {})
  const siteCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const s of all) counts[s.accountId] = (counts[s.accountId] || 0) + 1
    return counts
  }, [sites])
  const list = useMemo(
    () =>
      all
        .filter((s) => !scopedAccount || s.accountId === scopedAccount.id)
        .filter((s) => s.host.includes(filter.trim().toLowerCase()))
        .sort(
          (a, b) =>
            (b.lastRun?.at ?? b.updatedAt) - (a.lastRun?.at ?? a.updatedAt)
        ),
    [sites, filter, scopedAccount]
  )

  useEffect(() => {
    document.title = scopedAccount
      ? `${scopedAccount.name} · TOTP Manager`
      : "TOTP Manager"
    setEditing(null)
    window.scrollTo(0, 0)
  }, [scopedAccount?.id, scopedAccount?.name])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  // --- accounts --------------------------------------------------------------

  const addAccount = (account: Account) => {
    setAccounts((prev) => [...(prev || []), account])
    setAddingAccount(false)
    setNotice({ level: "ok", text: `Added ${account.name}` })
  }
  const updateAccount = (account: Account) => {
    setAccounts((prev) =>
      (prev || []).map((a) => (a.id === account.id ? account : a))
    )
    setNotice({ level: "ok", text: `Saved ${account.name}` })
  }
  const deleteAccount = (account: Account) => {
    setAccounts((prev) => (prev || []).filter((a) => a.id !== account.id))
    setSites((prev) =>
      Object.fromEntries(
        Object.entries(prev || {}).filter(([, s]) => s.accountId !== account.id)
      )
    )
    setScope(null)
    setNotice({ level: "ok", text: `Deleted ${account.name}` })
  }

  const importFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    void file.text().then((text) => {
      try {
        const imported = importFromCSV(text)
        const existing = new Set(accountList.map((a) => a.name.toLowerCase()))
        const fresh = imported.filter(
          (a) => !existing.has(a.name.toLowerCase())
        )
        if (imported.length === 0) {
          setNotice({ level: "error", text: "No accounts found in that CSV" })
        } else if (fresh.length === 0) {
          setNotice({
            level: "error",
            text: "Every account in that CSV already exists"
          })
        } else {
          setAccounts((prev) => [...(prev || []), ...fresh])
          const skipped = imported.length - fresh.length
          setNotice({
            level: "ok",
            text: `Imported ${fresh.length} account${fresh.length === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} with names that already exist` : ""}`
          })
        }
      } catch (err) {
        setNotice({ level: "error", text: (err as Error).message })
      }
    })
  }

  // --- sites -----------------------------------------------------------------

  const saveSite = (site: SiteConfig, previousHost?: string) => {
    setSites((prev) => {
      const next = { ...(prev || {}) }
      if (previousHost && previousHost !== site.host) delete next[previousHost]
      next[site.host] = site
      return next
    })
    setEditing(null)
  }
  const patchSite = (host: string, patch: Partial<SiteConfig>) =>
    setSites((prev) => {
      const current = prev?.[host]
      if (!current) return prev || {}
      return {
        ...prev,
        [host]: { ...current, ...patch, updatedAt: Date.now() }
      }
    })
  const deleteSite = (host: string) =>
    setSites((prev) => {
      const next = { ...(prev || {}) }
      delete next[host]
      return next
    })

  const mainShortcut = shortcuts[COMMAND_AUTOFILL]
  const formProps = {
    accounts: accountList,
    defaultAccountId: scopedAccount?.id ?? null,
    takenHosts: all.map((s) => s.host),
    onSave: saveSite,
    onCancel: () => setEditing(null)
  }

  const sitesSection = (
    <section>
      <div className="list-head">
        <h2>
          Autofill sites <span className="count">{list.length}</span>
        </h2>
        <div className="list-tools">
          {all.length > 3 && !scopedAccount && (
            <input
              className="search"
              placeholder="Filter by site"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          )}
          <button
            className="btn primary"
            disabled={editing === "new" || accountList.length === 0}
            title={
              accountList.length === 0 ? "Add an account first" : undefined
            }
            onClick={() => setEditing("new")}>
            + Add site
          </button>
        </div>
      </div>

      {editing === "new" && <SiteForm initial={null} {...formProps} />}

      {list.length === 0 && editing !== "new" ? (
        <div className="empty">
          <p>
            {scopedAccount
              ? `${scopedAccount.name} isn't used for autofill yet.`
              : "No sites set up yet."}
          </p>
          <p className="muted">
            Go to the site's 2FA page and press{" "}
            <Shortcut value={mainShortcut} />, or use “+ Add site” to enter it
            by hand.
          </p>
        </div>
      ) : (
        list.map((site) =>
          editing === site.host ? (
            <SiteForm key={site.host} initial={site} {...formProps} />
          ) : (
            <SiteCard
              key={site.host}
              site={site}
              accounts={accountList}
              onToggle={(enabled) => patchSite(site.host, { enabled })}
              onEdit={() => setEditing(site.host)}
              onRepick={() => patchSite(site.host, { needsSetup: true })}
              onDelete={() => deleteSite(site.host)}
            />
          )
        )
      )}
    </section>
  )

  return (
    <div className="page">
      <header className="top">
        <h1>TOTP Manager</h1>
        <p>Accounts, secrets and autofill.</p>
      </header>

      <main>
        {notice && (
          <p
            className={`notice ${notice.level}`}
            role={notice.level === "error" ? "alert" : "status"}>
            {notice.text}
            <button
              className="icon-btn"
              aria-label="Dismiss"
              onClick={() => setNotice(null)}>
              ×
            </button>
          </p>
        )}
        {missingAccount && (
          <p className="warning">
            That account no longer exists. Showing all accounts.
          </p>
        )}

        {scopedAccount ? (
          <>
            <AccountDetail
              account={scopedAccount}
              accounts={accountList}
              code={codes[scopedAccount.id]}
              remaining={remaining}
              siteHosts={list.map((s) => s.host)}
              onBack={() => setScope(null)}
              onSave={updateAccount}
              onDelete={() => deleteAccount(scopedAccount)}
            />
            {sitesSection}
            <ShortcutPanel shortcuts={shortcuts} commandAt={commandAt} />
          </>
        ) : (
          <>
            <AccountsPanel
              accounts={accountList}
              siteCounts={siteCounts}
              codes={codes}
              remaining={remaining}
              adding={addingAccount}
              onStartAdd={() => setAddingAccount(true)}
              onAdd={addAccount}
              onCancelAdd={() => setAddingAccount(false)}
              onOpen={(id) => setScope(id)}
              onImport={() => fileInput.current?.click()}
              onExport={() => exportToCSV(accountList)}
            />
            <h2 className="group-title">Autofill</h2>
            <ShortcutPanel shortcuts={shortcuts} commandAt={commandAt} />
            <LevelsPanel />
            {sitesSection}
          </>
        )}

        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={importFile}
        />

        <p className="privacy muted small">
          Secrets are stored unencrypted in the browser's extension storage (and
          synced with your browser profile if sync is on). Websites never see
          them, only the current code. Autofill only runs on the tab you're on,
          when you press the shortcut.
        </p>
      </main>
    </div>
  )
}

export default OptionsPage

import { useEffect, useRef, useState } from "react"

import { ext, isFirefox } from "../autofill/ext"
import type {
  ExtensionPageMessage,
  RunOutcome,
  SubmitMode
} from "../autofill/types"
import { generateTOTP, getRemainingTime } from "../totp"
import type { Account } from "../utils"

export const SUBMIT_LABELS: Record<SubmitMode, string> = {
  click: "Click the submit button",
  enter: "Press Enter",
  auto: "Nothing, the site continues by itself",
  none: "Nothing, I submit myself"
}

export const OUTCOME_LABELS: Record<RunOutcome, string> = {
  filled: "Filled",
  submitted: "Filled and submitted",
  partial: "Filled, submit failed",
  "not-found": "Field not found",
  "fill-failed": "Page rejected the code",
  error: "Error"
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? "" : "s"} ago`
}

export function useShortcuts() {
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({})
  useEffect(() => {
    const load = () =>
      ext.commands
        .getAll()
        .then((cmds) =>
          setShortcuts(
            Object.fromEntries(
              cmds.map((c) => [c.name || "", c.shortcut || ""])
            )
          )
        )
        .catch(() => undefined)
    load()
    // Pick up changes made on the browser's shortcut page
    window.addEventListener("focus", load)
    return () => window.removeEventListener("focus", load)
  }, [])
  return shortcuts
}

/** Time the background last reported a shortcut press, for the live check */
export function useCommandReceived() {
  const [at, setAt] = useState<number | null>(null)
  useEffect(() => {
    const listener = (msg: ExtensionPageMessage) => {
      if (msg?.type === "commandReceived") setAt(msg.at)
    }
    ext.runtime.onMessage.addListener(listener)
    return () => ext.runtime.onMessage.removeListener(listener)
  }, [])
  return at
}

/** `#account=<id>` scopes the page to one account (the popup's pencil) */
export function useAccountScope(): [
  number | null,
  (id: number | null) => void
] {
  const read = () => {
    const match = /account=([\d.]+)/.exec(location.hash)
    return match ? Number(match[1]) : null
  }
  const [scope, setScope] = useState<number | null>(read)
  useEffect(() => {
    const onHash = () => setScope(read())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])
  const update = (id: number | null) => {
    location.hash = id === null ? "" : `account=${id}`
    setScope(id)
  }
  return [scope, update]
}

export function openShortcutSettings() {
  const commands = ext.commands as typeof ext.commands & {
    openShortcutSettings?: () => Promise<void>
  }
  if (commands.openShortcutSettings) {
    void commands.openShortcutSettings()
    return
  }
  if (isFirefox) {
    alert(
      "Open about:addons, click the gear icon and choose “Manage Extension Shortcuts”."
    )
    return
  }
  void ext.tabs.create({ url: "chrome://extensions/shortcuts" })
}

export function Shortcut({ value }: { value?: string }) {
  if (!value) return <span className="muted">Not set</span>
  return <kbd className="kbd">{value}</kbd>
}

export function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"
      />
    </svg>
  )
}

function Icon({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d={d} />
    </svg>
  )
}

export const CopyIcon = () => (
  <Icon d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z" />
)

export const EyeIcon = ({ off = false }: { off?: boolean }) => (
  <Icon
    d={
      off
        ? "M12 7a5 5 0 0 1 5 5c0 .65-.13 1.26-.36 1.83l2.92 2.92A11.8 11.8 0 0 0 22.99 12 11.83 11.83 0 0 0 12 4.5c-1.4 0-2.74.25-3.98.7l2.16 2.16A4.85 4.85 0 0 1 12 7ZM2 4.27l2.28 2.28.46.46A11.8 11.8 0 0 0 1 12a11.83 11.83 0 0 0 15.38 6.68l.42.42L19.73 22 21 20.73 3.27 3 2 4.27ZM7.53 9.8l1.55 1.55A2.8 2.8 0 0 0 9 12a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55A5 5 0 0 1 7.53 9.8Zm4.31-.78 3.15 3.15.02-.16a3 3 0 0 0-3-3l-.17.01Z"
        : "M12 4.5A11.83 11.83 0 0 0 1 12a11.82 11.82 0 0 0 22 0 11.83 11.83 0 0 0-11-7.5ZM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
    }
  />
)

export const BackIcon = () => (
  <Icon d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2Z" />
)

/** "123456" -> "123 456" for readability */
export function formatCode(code: string): string {
  return /^\d{6}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code
}

/** Live codes for every account plus the seconds left in the window */
export function useTotpCodes(accounts: Account[]) {
  const [codes, setCodes] = useState<Record<number, string>>({})
  const [remaining, setRemaining] = useState(getRemainingTime())
  const accountsRef = useRef(accounts)
  accountsRef.current = accounts

  useEffect(() => {
    let cancelled = false
    let lastWindow = -1
    const update = async (force = false) => {
      setRemaining(getRemainingTime())
      const window = Math.floor(Date.now() / 30000)
      if (!force && window === lastWindow) return
      lastWindow = window
      const next: Record<number, string> = {}
      for (const account of accountsRef.current) {
        next[account.id] = await generateTOTP(account.secret)
      }
      if (!cancelled) setCodes(next)
    }
    void update(true)
    const timer = setInterval(() => void update(), 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [accounts])

  return { codes, remaining }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Copy with a short "Copied" state for the button that triggered it */
export function useCopied(): [
  string | null,
  (key: string, text: string) => void
] {
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const copy = (key: string, text: string) => {
    void copyText(text).then((ok) => {
      if (!ok) return
      setCopied(key)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(null), 1200)
    })
  }
  return [copied, copy]
}

/**
 * Page script for TOTP autofill.
 *
 * Injected on demand by the background script, only when the user presses the
 * autofill shortcut (activeTab), so the extension needs no access to sites
 * otherwise. It never sees TOTP secrets, only the current code.
 */
import { ext } from "../autofill/ext"
import { PAGE_SCRIPT_VERSION } from "../autofill/types"
import type {
  BackgroundMessage,
  PageMessage,
  RunResult
} from "../autofill/types"
import { runFill } from "./fill"
import { showToast } from "./overlay"
import { closeWizard, openWizard } from "./wizard"

const READY_FLAG = "__totpAutofillReady"

function send<T = { ok: boolean; error?: string }>(
  msg: BackgroundMessage
): Promise<T | undefined> {
  return ext.runtime.sendMessage(msg).catch(() => undefined) as Promise<
    T | undefined
  >
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement("textarea")
    area.value = text
    area.style.cssText = "position:fixed;top:-100px;opacity:0"
    document.documentElement.append(area)
    area.select()
    const ok = document.execCommand("copy")
    area.remove()
    return ok
  }
}

async function copyCode() {
  const res = await send<{ ok: boolean; code?: string; error?: string }>({
    type: "getCode"
  })
  if (res?.code && (await copyText(res.code))) {
    showToast({
      level: "success",
      message: "Code copied",
      detail: "Paste it with ⌘V / Ctrl+V",
      duration: 3000
    })
  } else {
    showToast({
      level: "error",
      message: res?.error || "Couldn't copy the code"
    })
  }
}

const editAction = {
  label: "Edit setup",
  onClick: () => void send({ type: "startSetup" })
}

async function handleFill(
  msg: Extract<PageMessage, { type: "fill" }>
): Promise<RunResult> {
  closeWizard()
  const { target: _target, ...result } = await runFill(msg.site, msg.code)
  const fallbackNote = result.usedFallback
    ? "The saved field wasn't found, so it was auto-detected."
    : undefined

  switch (result.outcome) {
    case "submitted":
      showToast({
        level: "success",
        message: "Code filled and submitted",
        detail: fallbackNote ?? msg.accountName,
        actions: result.usedFallback ? [editAction] : []
      })
      break
    case "filled":
      showToast({
        level: "success",
        message: "Code filled",
        detail:
          fallbackNote ??
          (msg.site.submit.mode === "auto"
            ? `${msg.accountName} · the site should continue on its own`
            : `${msg.accountName} · submit when you're ready`),
        actions: [editAction]
      })
      break
    case "partial":
      showToast({
        level: "info",
        message: "Code filled, but submitting didn't work",
        detail: result.message,
        actions: [editAction],
        duration: 8000
      })
      break
    default:
      showToast({
        level: "error",
        message:
          result.outcome === "not-found"
            ? "Couldn't find the code field"
            : "The page didn't accept the code",
        detail:
          result.outcome === "not-found"
            ? "Is the 2FA prompt open? You can copy the code or point at the field."
            : "Copy the code and paste it yourself, or pick the field again.",
        actions: [
          { label: "Copy code", onClick: copyCode },
          {
            label: "Set up field",
            onClick: () => void send({ type: "startSetup" })
          }
        ],
        duration: 10000
      })
  }
  return result
}

function handleSetup(msg: Extract<PageMessage, { type: "setup" }>) {
  openWizard({
    host: msg.host,
    accounts: msg.accounts,
    suggestedAccountId: msg.suggestedAccountId,
    existing: msg.existing,
    reason: msg.reason,
    shortcut: msg.shortcut,
    onSave: async (draft, fillNow) => {
      const res = await send({ type: "saveSite", draft, fillNow })
      if (!res?.ok) {
        showToast({
          level: "error",
          message: res?.error || "Couldn't save the setup"
        })
        return
      }
      if (!fillNow) {
        showToast({
          level: "success",
          message: "Autofill saved",
          detail: msg.shortcut
            ? `Press ${msg.shortcut} on this page to fill your code.`
            : "Use the autofill shortcut on this page to fill your code."
        })
      }
    }
  })
}

function onMessage(
  msg: PageMessage,
  _sender: unknown,
  sendResponse: (response: unknown) => void
): boolean {
  switch (msg?.type) {
    case "ping":
      sendResponse({
        ok: true,
        version: PAGE_SCRIPT_VERSION,
        host: location.hostname,
        protocol: location.protocol
      })
      return false
    case "fill":
      handleFill(msg).then(sendResponse, (e: Error) =>
        sendResponse({ outcome: "error", message: String(e?.message || e) })
      )
      return true
    case "setup":
      handleSetup(msg)
      sendResponse({ ok: true })
      return false
    case "toast":
      showToast({ level: msg.level, message: msg.message, duration: 6000 })
      sendResponse({ ok: true })
      return false
  }
  return false
}

const g = globalThis as unknown as Record<string, unknown>
if (!g[READY_FLAG]) {
  g[READY_FLAG] = true
  ext.runtime.onMessage.addListener(onMessage)
}

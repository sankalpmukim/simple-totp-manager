/**
 * The in-page overlay: a closed shadow root (isolated from page CSS and JS)
 * hosting highlight boxes, the setup wizard and toasts.
 */
import type { ToastLevel } from "../autofill/types"
import { OVERLAY_TAG } from "./dom"
import { OVERLAY_CSS } from "./styles"

type Child = Node | string | null | undefined | false
type Props = Record<string, unknown> & {
  class?: string
  on?: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>
}

/** Tiny hyperscript helper */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (key === "on") {
        for (const [ev, fn] of Object.entries(value as Props["on"] & object))
          el.addEventListener(ev, fn as EventListener)
      } else if (key === "class") {
        el.className = String(value)
      } else if (value === true) {
        el.setAttribute(key, "")
      } else if (value !== false && value !== null && value !== undefined) {
        if (key in el && key !== "list") {
          ;(el as unknown as Record<string, unknown>)[key] = value
        } else {
          el.setAttribute(key, String(value))
        }
      }
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    el.append(child)
  }
  return el
}

let host: HTMLElement | null = null
let shadow: ShadowRoot | null = null
let rootEl: HTMLElement | null = null
let toastsEl: HTMLElement | null = null

function applyStyles(sr: ShadowRoot) {
  // Constructable stylesheets are not subject to the page's CSP
  try {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(OVERLAY_CSS)
    sr.adoptedStyleSheets = [sheet]
    return
  } catch {
    // fall back to a <style> element
  }
  const style = document.createElement("style")
  style.textContent = OVERLAY_CSS
  sr.append(style)
}

function setImportant(el: HTMLElement, styles: Record<string, string>) {
  for (const [k, v] of Object.entries(styles))
    el.style.setProperty(k, v, "important")
}

/** Keep the overlay above page dialogs by (re)entering the top layer */
function raise() {
  if (!host) return
  const popoverHost = host as HTMLElement & {
    showPopover?: () => void
    hidePopover?: () => void
  }
  if (!popoverHost.showPopover) return
  try {
    if (host.matches(":popover-open")) popoverHost.hidePopover?.()
    popoverHost.showPopover()
  } catch {
    // popover not supported in this context
  }
}

export function getOverlayRoot(): HTMLElement {
  if (rootEl && host?.isConnected) return rootEl
  document.querySelectorAll(OVERLAY_TAG).forEach((el) => el.remove())
  host = document.createElement(OVERLAY_TAG)
  setImportant(host, {
    all: "initial",
    position: "fixed",
    inset: "0 auto auto 0",
    width: "0",
    height: "0",
    margin: "0",
    padding: "0",
    border: "0",
    overflow: "visible",
    background: "transparent",
    "z-index": "2147483647",
    display: "block"
  })
  try {
    host.setAttribute("popover", "manual")
  } catch {
    // ignore
  }
  shadow = host.attachShadow({ mode: "closed" })
  applyStyles(shadow)
  rootEl = h("div", { class: "root" })
  toastsEl = h("div", { class: "toasts" })
  rootEl.append(toastsEl)
  shadow.append(rootEl)
  document.documentElement.append(host)
  raise()
  return rootEl
}

export function overlayHost(): HTMLElement | null {
  return host
}

/** Remove the overlay entirely once nothing is showing */
export function maybeTeardown() {
  if (!rootEl || !toastsEl) return
  const hasOther = Array.from(rootEl.children).some((c) => c !== toastsEl)
  if (!hasOther && toastsEl.childElementCount === 0) {
    host?.remove()
    host = shadow = rootEl = toastsEl = null
  }
}

export function bringToFront() {
  raise()
}

// ---------------------------------------------------------------------------
// Toasts

export interface ToastAction {
  label: string
  onClick: () => void | Promise<void>
}

export interface ToastOptions {
  level: ToastLevel
  message: string
  detail?: string
  actions?: ToastAction[]
  /** ms; 0 keeps it until dismissed */
  duration?: number
}

const SYMBOL: Record<ToastLevel, string> = {
  success: "✓",
  info: "i",
  error: "!"
}

export function showToast(opts: ToastOptions): () => void {
  getOverlayRoot()
  const container = toastsEl!
  // One toast at a time keeps it calm
  container.replaceChildren()
  let timer: ReturnType<typeof setTimeout> | undefined
  const dismiss = () => {
    if (timer) clearTimeout(timer)
    toast.remove()
    maybeTeardown()
  }
  const toast = h(
    "div",
    { class: `toast ${opts.level}`, role: "status" },
    h("span", { class: "sym" }, SYMBOL[opts.level]),
    h("span", { class: "msg" }, opts.message),
    h(
      "button",
      { class: "icon-btn", title: "Dismiss", on: { click: dismiss } },
      "×"
    ),
    opts.detail ? h("span", { class: "detail" }, opts.detail) : null,
    opts.actions?.length
      ? h(
          "div",
          { class: "actions" },
          ...opts.actions.map((a) =>
            h(
              "button",
              {
                class: "btn small",
                on: {
                  click: async () => {
                    dismiss()
                    await a.onClick()
                  }
                }
              },
              a.label
            )
          )
        )
      : null
  )
  container.append(toast)
  raise()
  const duration = opts.duration ?? 4500
  if (duration > 0) {
    timer = setTimeout(dismiss, duration)
    toast.addEventListener("mouseenter", () => timer && clearTimeout(timer))
    toast.addEventListener("mouseleave", () => {
      timer = setTimeout(dismiss, 2500)
    })
  }
  return dismiss
}

// ---------------------------------------------------------------------------
// Highlight boxes

export type BoxVariant = "hover" | "hover-bad" | "suggest" | "field" | "button"

export interface BoxSpec {
  rect: DOMRect
  variant: BoxVariant
  part?: boolean
}

export interface TagSpec {
  rect: DOMRect
  html: Node[]
}

export class BoxLayer {
  private boxes: HTMLElement[] = []
  private tag: HTMLElement

  constructor(private parent: HTMLElement) {
    this.tag = h("div", { class: "tag" })
    this.tag.style.display = "none"
    parent.append(this.tag)
  }

  draw(specs: BoxSpec[], tag?: TagSpec | null) {
    while (this.boxes.length < specs.length) {
      const box = h("div", { class: "box" })
      this.parent.append(box)
      this.boxes.push(box)
    }
    this.boxes.forEach((box, i) => {
      const spec = specs[i]
      if (!spec) {
        box.style.display = "none"
        return
      }
      const pad = spec.part ? 0 : 3
      box.className = `box ${spec.variant}${spec.part ? " part" : ""}`
      box.style.display = "block"
      box.style.top = `${spec.rect.top - pad}px`
      box.style.left = `${spec.rect.left - pad}px`
      box.style.width = `${spec.rect.width + pad * 2}px`
      box.style.height = `${spec.rect.height + pad * 2}px`
    })
    if (tag) {
      this.tag.replaceChildren(...tag.html)
      this.tag.style.display = "block"
      const below = tag.rect.top < 34
      const top = below ? tag.rect.bottom + 8 : tag.rect.top - 30
      this.tag.style.top = `${Math.max(4, Math.min(top, innerHeight - 28))}px`
      this.tag.style.left = `${Math.max(4, Math.min(tag.rect.left, innerWidth - 260))}px`
    } else {
      this.tag.style.display = "none"
    }
  }

  destroy() {
    this.boxes.forEach((b) => b.remove())
    this.tag.remove()
  }
}

export function unionRect(rects: DOMRect[]): DOMRect {
  const left = Math.min(...rects.map((r) => r.left))
  const top = Math.min(...rects.map((r) => r.top))
  const right = Math.max(...rects.map((r) => r.right))
  const bottom = Math.max(...rects.map((r) => r.bottom))
  return new DOMRect(left, top, right - left, bottom - top)
}

/**
 * DOM helpers for the injected page script: shadow-root aware traversal,
 * visibility checks and small async utilities.
 */

export const OVERLAY_TAG = "totp-autofill-overlay"

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

export const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

type ChromeDom = {
  dom?: { openOrClosedShadowRoot?: (el: HTMLElement) => ShadowRoot | null }
}

/** Shadow root of an element, including closed ones where the browser allows it */
export function getShadowRoot(el: Element): ShadowRoot | null {
  try {
    const chromeDom = (globalThis as unknown as { chrome?: ChromeDom }).chrome
      ?.dom
    if (chromeDom?.openOrClosedShadowRoot && el instanceof HTMLElement) {
      const root = chromeDom.openOrClosedShadowRoot(el)
      if (root) return root
    }
  } catch {
    // not available
  }
  // Firefox exposes closed roots to extensions via this property
  const ff = (el as unknown as { openOrClosedShadowRoot?: ShadowRoot | null })
    .openOrClosedShadowRoot
  if (ff) return ff
  return el.shadowRoot
}

export function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && "host" in node
}

function isOwnOverlay(el: Element) {
  return el.localName === OVERLAY_TAG
}

/** querySelectorAll that also looks inside shadow roots */
export function deepQueryAll<T extends Element = Element>(
  selector: string,
  root: Document | ShadowRoot | Element = document
): T[] {
  const out: T[] = []
  const visit = (scope: Document | ShadowRoot | Element) => {
    // An element passed as root may itself be a shadow host
    if (scope === root && scope instanceof Element) {
      const own = getShadowRoot(scope)
      if (own && !isOwnOverlay(scope)) visit(own)
    }
    scope.querySelectorAll<T>(selector).forEach((el) => {
      if (!isOwnOverlay(el)) out.push(el)
    })
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT)
    let node = walker.nextNode() as Element | null
    while (node) {
      if (!isOwnOverlay(node)) {
        const sr = getShadowRoot(node)
        if (sr) visit(sr)
      }
      node = walker.nextNode() as Element | null
    }
  }
  visit(root)
  return out
}

/** Element at a point, descending into shadow roots. Skips our own overlay. */
export function deepElementFromPoint(x: number, y: number): Element | null {
  const stack = document.elementsFromPoint(x, y)
  let el = stack.find((e) => !isOwnOverlay(e)) || null
  for (let i = 0; el && i < 20; i++) {
    const sr = getShadowRoot(el)
    if (!sr) break
    // ShadowRoot.elementsFromPoint also lists elements outside the root, so
    // only accept ones that actually live inside it.
    const inner = sr
      .elementsFromPoint(x, y)
      .find((e) => e !== el && e.getRootNode() === sr)
    if (!inner) break
    el = inner
  }
  return el
}

/** Parent element, crossing shadow boundaries */
export function parentDeep(el: Element): Element | null {
  if (el.parentElement) return el.parentElement
  const root = el.getRootNode()
  return isShadowRoot(root) ? root.host : null
}

export function isVisible(el: Element): boolean {
  if (!el.isConnected) return false
  const rect = el.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return false
  const style = getComputedStyle(el)
  if (style.visibility === "hidden" || style.display === "none") return false
  const check = (
    el as Element & {
      checkVisibility?: (opts?: Record<string, boolean>) => boolean
    }
  ).checkVisibility
  // Deliberately not checking opacity: some OTP widgets use a transparent
  // input layered over decorative boxes.
  if (check && !check.call(el, { visibilityProperty: true })) return false
  return true
}

const TEXT_LIKE_TYPES = new Set(["", "text", "tel", "number", "password"])

export function isInput(el: Element | null): el is HTMLInputElement {
  return !!el && el.localName === "input"
}

/** Inputs a TOTP code could be typed into */
export function isFillable(el: Element | null): el is HTMLInputElement {
  if (!isInput(el)) return false
  const type = (el.getAttribute("type") || "").toLowerCase()
  return TEXT_LIKE_TYPES.has(type) && !el.disabled && !el.readOnly
}

export function textOf(el: Element): string {
  if (isInput(el)) return el.value || el.getAttribute("aria-label") || ""
  return ((el as HTMLElement).innerText || el.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Label text associated with an input (labels, aria-labelledby) */
export function labelTextOf(el: HTMLInputElement): string {
  const parts: string[] = []
  try {
    el.labels?.forEach((l) => parts.push(l.textContent || ""))
  } catch {
    // labels can throw on some exotic inputs
  }
  const labelledBy = el.getAttribute("aria-labelledby")
  if (labelledBy) {
    const root = el.getRootNode() as Document | ShadowRoot
    for (const id of labelledBy.split(/\s+/)) {
      const target = root.getElementById?.(id) ?? document.getElementById(id)
      if (target) parts.push(target.textContent || "")
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 200)
}

/** Sort elements in visual reading order (top-to-bottom, left-to-right) */
export function readingOrder<T extends Element>(els: T[]): T[] {
  return [...els].sort((a, b) => {
    const ra = a.getBoundingClientRect()
    const rb = b.getBoundingClientRect()
    if (Math.abs(ra.top - rb.top) > Math.min(ra.height, rb.height) / 2)
      return ra.top - rb.top
    const rtl = getComputedStyle(a).direction === "rtl"
    return rtl ? rb.left - ra.left : ra.left - rb.left
  })
}

/** Short DevTools-like description: input#otp.form-control */
export function describeElement(el: Element): string {
  let out = el.localName
  if (el.id) out += `#${el.id}`
  else {
    const attr = ["name", "aria-label", "autocomplete"].find((a) =>
      el.getAttribute(a)
    )
    if (attr) out += `[${attr}="${el.getAttribute(attr)}"]`
  }
  const classes = Array.from(el.classList).slice(0, 2)
  if (classes.length) out += "." + classes.join(".")
  return out.length > 48 ? out.slice(0, 47) + "…" : out
}

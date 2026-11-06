/**
 * Heuristics for finding TOTP code fields and submit buttons.
 *
 * Handles the three common shapes of code inputs:
 * - a single text/tel/number/password input
 * - "split" inputs: one small box per digit (usually maxlength=1)
 * - a transparent single input layered over decorative boxes (input-otp style)
 */
import {
  deepQueryAll,
  isFillable,
  isVisible,
  labelTextOf,
  parentDeep,
  readingOrder,
  textOf
} from "./dom"

export type FieldTarget =
  | { kind: "single"; inputs: [HTMLInputElement] }
  | { kind: "split"; inputs: HTMLInputElement[] }

export interface FieldCandidate {
  target: FieldTarget
  score: number
}

// These run against normalize()d text: camelCase, "-" and "_" become spaces
const OTP_RE =
  /one ?time|\b(otp|totp|2fa|tfa|mfa)\b|two ?factor|multi ?factor|verif|authenticat|auth ?code|security ?code|passcode|\btoken\b|app ?code/i
const CODE_RE = /code|\bpin\b|digit/i
const NEGATIVE_RE =
  /user|e ?mail|login ?id|search|phone|mobile|zip|postal|card|cvv|cvc|captcha|coupon|promo|discount|referr|invite|country|city|address|first ?name|last ?name|full ?name|nickname/i

function normalize(text: string): string {
  return text.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ")
}
const PAGE_CONTEXT_RE =
  /authenticator|verification code|two-factor|multi-factor|2-step|two-step|one-time (pass)?code|security code|6-digit|authentication code|\b(2fa|mfa)\b/i

const NEGATIVE_AUTOCOMPLETE = new Set([
  "username",
  "email",
  "current-password",
  "new-password",
  "tel",
  "name",
  "given-name",
  "family-name",
  "cc-number",
  "cc-csc",
  "postal-code"
])

interface Context {
  otpPage: boolean
  visibleCount: number
}

function pageContext(visibleCount: number): Context {
  let text = document.title
  try {
    text += " " + (document.body?.innerText || "").slice(0, 4000)
  } catch {
    // ignore
  }
  return { otpPage: PAGE_CONTEXT_RE.test(text), visibleCount }
}

function attrText(el: HTMLInputElement): string {
  return [
    el.name,
    el.id,
    el.placeholder,
    el.getAttribute("aria-label"),
    el.title,
    el.getAttribute("data-testid"),
    el.getAttribute("formcontrolname"),
    labelTextOf(el)
  ]
    .filter(Boolean)
    .map((t) => normalize(String(t)))
    .join(" ")
}

/** A box that holds a single character of a split code */
export function isSplitBox(el: HTMLInputElement): boolean {
  if (el.maxLength === 1 || el.maxLength === 2) return true
  if (el.maxLength > 2) return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.width <= 64
}

/**
 * Given one box, find all boxes of the same split field, in order.
 * Looks up to 4 ancestors for the smallest container holding 4–10 boxes.
 */
export function findSplitGroup(
  el: HTMLInputElement
): HTMLInputElement[] | null {
  if (!isSplitBox(el)) return null
  const height = el.getBoundingClientRect().height
  let anc = parentDeep(el)
  for (let depth = 0; anc && depth < 5; depth++, anc = parentDeep(anc)) {
    const boxes = deepQueryAll<HTMLInputElement>("input", anc).filter(
      (i) =>
        isFillable(i) &&
        isVisible(i) &&
        isSplitBox(i) &&
        Math.abs(i.getBoundingClientRect().height - height) < 8
    )
    if (boxes.length >= 4 && boxes.length <= 10 && boxes.includes(el)) {
      return readingOrder(boxes)
    }
    if (boxes.length > 10) return null
  }
  return null
}

function scoreSingle(el: HTMLInputElement, ctx: Context): number {
  let score = 0
  const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase()
  const attrs = attrText(el)
  const type = (el.getAttribute("type") || "text").toLowerCase()

  if (autocomplete.includes("one-time-code")) score += 100
  else if (NEGATIVE_AUTOCOMPLETE.has(autocomplete)) score -= 60

  if (OTP_RE.test(attrs)) score += 50
  else if (CODE_RE.test(attrs)) score += 25
  if (OTP_RE.test(normalize(el.className || ""))) score += 20
  if (NEGATIVE_RE.test(attrs) && !OTP_RE.test(attrs)) score -= 60

  const inputMode = (el.inputMode || "").toLowerCase()
  if (inputMode === "numeric" || inputMode === "decimal") score += 15
  if (type === "tel" || type === "number") score += 10
  if (/\\d|0-9/.test(el.pattern || "")) score += 10
  if (type === "password") score -= 15

  const max = el.maxLength
  if (max === 6 || max === 8) score += 25
  else if (max >= 4 && max <= 10) score += 10

  if (el.getRootNode() instanceof Document && document.activeElement === el)
    score += 15
  // Placeholders like "123456" or "••••••"
  if (/^\s*([0-9]|[-_•·*xX#○●]){4,8}\s*$/.test(el.placeholder || ""))
    score += 20

  if (ctx.otpPage) score += 15
  if (ctx.visibleCount === 1) score += ctx.otpPage ? 20 : 10
  return score
}

/** All plausible code fields on the page, best first */
export function detectFieldCandidates(): FieldCandidate[] {
  const inputs = deepQueryAll<HTMLInputElement>("input").filter(
    (i) => isFillable(i) && isVisible(i)
  )
  const ctx = pageContext(inputs.length)
  const used = new Set<HTMLInputElement>()
  const out: FieldCandidate[] = []

  for (const input of inputs) {
    if (used.has(input) || !isSplitBox(input)) continue
    const group = findSplitGroup(input)
    if (!group) continue
    group.forEach((g) => used.add(g))
    let score = 70
    if (
      group.some((g) => OTP_RE.test(attrText(g) + " " + normalize(g.className)))
    )
      score += 30
    if (
      group.some((g) =>
        (g.getAttribute("autocomplete") || "").includes("one-time-code")
      )
    )
      score += 30
    if (group.length === 6 || group.length === 8) score += 10
    if (ctx.otpPage) score += 15
    out.push({ target: { kind: "split", inputs: group }, score })
  }

  for (const input of inputs) {
    if (used.has(input)) continue
    out.push({
      target: { kind: "single", inputs: [input] },
      score: scoreSingle(input, ctx)
    })
  }

  return out.filter((c) => c.score >= 35).sort((a, b) => b.score - a.score)
}

/** Best guess, or null if nothing looks confidently like a code field */
export function detectField(minScore = 50): FieldTarget | null {
  const best = detectFieldCandidates()[0]
  return best && best.score >= minScore ? best.target : null
}

/** Turn whatever element the user pointed at into a code field target */
export function fieldTargetFrom(el: Element | null): FieldTarget | null {
  if (!el) return null
  if (isFillable(el)) {
    const group = findSplitGroup(el)
    return group
      ? { kind: "split", inputs: group }
      : { kind: "single", inputs: [el] }
  }
  // Clicked a wrapper or a decorative box: look inside, then a few levels up
  let scope: Element | null = el
  for (let depth = 0; scope && depth < 4; depth++, scope = parentDeep(scope)) {
    const inner = deepQueryAll<HTMLInputElement>("input", scope).filter(
      (i) => isFillable(i) && isVisible(i)
    )
    if (inner.length === 0) continue
    if (inner.length === 1) return fieldTargetFrom(inner[0])
    const group = findSplitGroup(inner[0])
    if (group && inner.every((i) => group.includes(i)))
      return { kind: "split", inputs: group }
    return null
  }
  return null
}

// ---------------------------------------------------------------------------
// Submit buttons

export const BUTTONISH =
  'button, input[type="submit"], input[type="button"], input[type="image"], [role="button"]'

const SUBMIT_TEXT_RE =
  /verify|submit|continue|confirm|sign ?in|log ?in|next|done|authenticate|proceed|ok\b|validate|enter|send/i
const NOT_SUBMIT_TEXT_RE =
  /cancel|back|resend|send again|new code|another|try|help|recovery|backup|sms|text me|call|remember|trust|forgot|lost|different|switch/i

function isDisabled(el: Element) {
  return (
    (el as HTMLButtonElement).disabled === true ||
    el.getAttribute("aria-disabled") === "true"
  )
}

export function isButtonDisabled(el: Element) {
  return isDisabled(el)
}

/** Snap an arbitrary element to the button-like element it belongs to */
export function buttonFrom(el: Element | null): Element | null {
  if (!el) return null
  return el.closest(`${BUTTONISH}, a`) || el
}

/** Find the most likely submit button for a code field */
export function detectSubmitButton(field: Element): Element | null {
  const form = (field as HTMLInputElement).form || field.closest("form")
  let candidates: Element[] = []

  if (form) {
    candidates = deepQueryAll(BUTTONISH, form)
    if (form.id) {
      candidates.push(
        ...Array.from(
          document.querySelectorAll(`[form="${CSS.escape(form.id)}"]`)
        )
      )
    }
  }
  if (candidates.length === 0) {
    let anc = parentDeep(field)
    for (let depth = 0; anc && depth < 7; depth++, anc = parentDeep(anc)) {
      const found = deepQueryAll(BUTTONISH, anc)
      if (found.length) {
        candidates = found
        break
      }
    }
  }

  let best: { el: Element; score: number } | null = null
  for (const el of candidates) {
    if (!isVisible(el)) continue
    const text = textOf(el)
    let score = 0
    const type = (el.getAttribute("type") || "").toLowerCase()
    if (type === "submit" || (el.localName === "button" && !type && form))
      score += 30
    if (SUBMIT_TEXT_RE.test(text)) score += 40
    if (NOT_SUBMIT_TEXT_RE.test(text)) score -= 80
    if (el.localName === "a") score -= 20
    if (score > 0 && (!best || score > best.score)) best = { el, score }
  }
  return best?.el ?? null
}

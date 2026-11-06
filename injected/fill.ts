/**
 * Filling codes into inputs in a way frameworks (React, Vue, Angular, Svelte,
 * plain DOM) pick up, and performing the submit step.
 */
import type { RunResult, SiteConfig } from "../autofill/types"
import {
  detectField,
  detectSubmitButton,
  findSplitGroup,
  isButtonDisabled,
  type FieldTarget
} from "./detect"
import { isFillable, nextFrame, sleep } from "./dom"
import { resolveLocator } from "./locator"

const valueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value"
)!.set!

/** Set the value through the native setter so framework value trackers notice */
function setValue(el: HTMLInputElement, value: string) {
  valueSetter.call(el, value)
}

function keyCodeName(key: string) {
  if (/^\d$/.test(key)) return `Digit${key}`
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`
  return key
}

function fireKey(el: Element, type: string, key: string): KeyboardEvent {
  const event = new KeyboardEvent(type, {
    key,
    code: keyCodeName(key),
    bubbles: true,
    cancelable: true,
    composed: true
  })
  el.dispatchEvent(event)
  return event
}

function fireInput(el: Element, data: string | null, inputType = "insertText") {
  el.dispatchEvent(
    new InputEvent("input", {
      data,
      inputType,
      bubbles: true,
      composed: true
    })
  )
}

function fireChange(el: Element) {
  el.dispatchEvent(new Event("change", { bubbles: true }))
}

function firePaste(el: Element, text: string): boolean {
  try {
    const data = new DataTransfer()
    data.setData("text/plain", text)
    const event = new ClipboardEvent("paste", {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
      composed: true
    })
    el.dispatchEvent(event)
    return true
  } catch {
    return false
  }
}

function focus(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  if (rect.bottom < 0 || rect.top > innerHeight) {
    el.scrollIntoView({ block: "center" })
  }
  el.focus({ preventScroll: true })
}

/** Ignore formatting characters some masked inputs add (spaces, dashes) */
const clean = (value: string) => value.replace(/[\s-]/g, "")

/** Type one value in with the event sequence a real keypress would make */
function typeInto(el: HTMLInputElement, text: string) {
  for (const ch of text) {
    const down = fireKey(el, "keydown", ch)
    fireKey(el, "keypress", ch)
    if (!down.defaultPrevented) {
      setValue(el, el.value + ch)
      fireInput(el, ch)
    }
    fireKey(el, "keyup", ch)
  }
}

async function fillSingle(
  el: HTMLInputElement,
  code: string
): Promise<string | null> {
  focus(el)

  // 1. Set the whole value at once (works for most frameworks)
  setValue(el, code)
  fireInput(el, code, "insertFromPaste")
  fireKey(el, "keyup", code[code.length - 1])
  fireChange(el)
  await nextFrame()
  if (clean(el.value) === code) return "set value"

  // 2. Simulate typing character by character (masked inputs)
  setValue(el, "")
  fireInput(el, null, "deleteContentBackward")
  typeInto(el, code)
  fireChange(el)
  await nextFrame()
  if (clean(el.value) === code) return "typed"

  // 3. Synthetic paste event (widgets that only accept paste)
  setValue(el, "")
  firePaste(el, code)
  await sleep(60)
  if (clean(el.value) === code) return "paste"
  return null
}

function splitValue(boxes: HTMLInputElement[]) {
  return boxes.map((b) => clean(b.value)).join("")
}

/** Boxes can be re-rendered while typing; re-collect them from the first one */
function currentBoxes(boxes: HTMLInputElement[]): HTMLInputElement[] {
  if (boxes.every((b) => b.isConnected)) return boxes
  const first = boxes.find((b) => b.isConnected)
  return (first && findSplitGroup(first)) || boxes
}

async function fillSplit(
  initial: HTMLInputElement[],
  code: string
): Promise<string | null> {
  const chars = code.split("")

  // 1. One character per box, like a person typing (focus-advancing widgets)
  let boxes = initial
  for (let i = 0; i < Math.min(boxes.length, chars.length); i++) {
    boxes = currentBoxes(boxes)
    const box = boxes[i]
    focus(box)
    const down = fireKey(box, "keydown", chars[i])
    fireKey(box, "keypress", chars[i])
    if (!down.defaultPrevented || clean(box.value) !== chars[i]) {
      setValue(box, chars[i])
      fireInput(box, chars[i])
    }
    fireKey(box, "keyup", chars[i])
    fireChange(box)
    await sleep(15)
  }
  await nextFrame()
  boxes = currentBoxes(boxes)
  if (splitValue(boxes) === code) return "typed into boxes"

  // 2. Paste the whole code into the first box (widgets that distribute paste)
  focus(boxes[0])
  firePaste(boxes[0], code)
  await sleep(80)
  boxes = currentBoxes(boxes)
  if (splitValue(boxes) === code) return "pasted into boxes"

  // 3. Put the full code in the first box (widgets that split long input)
  setValue(boxes[0], code)
  fireInput(boxes[0], code, "insertFromPaste")
  await sleep(80)
  boxes = currentBoxes(boxes)
  if (splitValue(boxes) === code) return "distributed"
  return null
}

function fromField(site: SiteConfig): {
  target: FieldTarget | null
  fuzzy: boolean
} {
  if (!site.field) return { target: null, fuzzy: false }
  const resolved = resolveLocator(site.field.locator)
  if (!resolved || !isFillable(resolved.el))
    return { target: null, fuzzy: false }
  const el = resolved.el
  if (site.field.kind === "split") {
    const group = findSplitGroup(el)
    if (group)
      return { target: { kind: "split", inputs: group }, fuzzy: resolved.fuzzy }
  }
  return { target: { kind: "single", inputs: [el] }, fuzzy: resolved.fuzzy }
}

/** Locate the code field, waiting briefly for pages that render it late */
async function locateField(
  site: SiteConfig
): Promise<{ target: FieldTarget; fallback: boolean } | null> {
  const deadline = Date.now() + 1500
  while (true) {
    const saved = fromField(site)
    if (saved.target) return { target: saved.target, fallback: saved.fuzzy }
    const detected = detectField(site.field ? 60 : 50)
    if (detected) return { target: detected, fallback: !!site.field }
    if (Date.now() > deadline) return null
    await sleep(150)
  }
}

async function waitEnabled(el: Element, ms: number) {
  const deadline = Date.now() + ms
  while (isButtonDisabled(el) && Date.now() < deadline) await sleep(100)
  return !isButtonDisabled(el)
}

async function submit(
  site: SiteConfig,
  target: FieldTarget
): Promise<{ ok: boolean; message: string }> {
  const lastInput = target.inputs[target.inputs.length - 1]
  // Let frameworks re-render and enable their submit buttons
  await sleep(200)

  if (site.submit.mode === "enter") {
    focus(lastInput)
    const down = fireKey(lastInput, "keydown", "Enter")
    fireKey(lastInput, "keypress", "Enter")
    fireKey(lastInput, "keyup", "Enter")
    const startUrl = location.href
    await sleep(250)
    const form = lastInput.form
    if (
      !down.defaultPrevented &&
      form &&
      lastInput.isConnected &&
      location.href === startUrl
    ) {
      try {
        form.requestSubmit()
      } catch {
        form.submit()
      }
    }
    return { ok: true, message: "pressed Enter" }
  }

  if (site.submit.mode === "click") {
    let button: Element | null = null
    let guessed = false
    if (site.submit.locator)
      button = resolveLocator(site.submit.locator)?.el ?? null
    if (!button) {
      button = detectSubmitButton(lastInput)
      guessed = true
    }
    if (!button) return { ok: false, message: "submit button not found" }
    if (!(await waitEnabled(button, 2000))) {
      return { ok: false, message: "submit button stayed disabled" }
    }
    ;(button as HTMLElement).click()
    return {
      ok: true,
      message: guessed ? "clicked a detected submit button" : "clicked submit"
    }
  }
  return { ok: true, message: "" }
}

export async function runFill(
  site: SiteConfig,
  code: string
): Promise<RunResult & { target?: FieldTarget }> {
  const located = await locateField(site)
  if (!located) {
    return { outcome: "not-found", message: "Couldn't find the code field" }
  }
  const { target, fallback } = located
  const method =
    target.kind === "split"
      ? await fillSplit(target.inputs, code)
      : await fillSingle(target.inputs[0], code)

  if (!method) {
    return {
      outcome: "fill-failed",
      message: "Found the field but the page rejected the code",
      usedFallback: fallback,
      target
    }
  }
  const where =
    target.kind === "split" ? `${target.inputs.length} boxes` : "the field"
  const note = fallback ? " (saved field missing, auto-detected)" : ""

  if (site.submit.mode === "click" || site.submit.mode === "enter") {
    const result = await submit(site, target)
    if (!result.ok) {
      return {
        outcome: "partial",
        message: `Filled ${where}, but ${result.message}${note}`,
        usedFallback: fallback,
        target
      }
    }
    return {
      outcome: "submitted",
      message: `Filled ${where} and ${result.message}${note}`,
      usedFallback: fallback,
      target
    }
  }
  return {
    outcome: "filled",
    message: `Filled ${where} (${method})${note}`,
    usedFallback: fallback,
    target
  }
}

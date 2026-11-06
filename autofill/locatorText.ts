/**
 * Text form of element locators for manual editing in Autofill settings.
 *
 * A locator is written as CSS selectors separated by " >>> " to step into
 * shadow roots, e.g. `mfa-box >>> input[name="code"]`.
 */
import type { ElementLocator } from "./types"

export const SHADOW_SEPARATOR = ">>>"

export function locatorToText(locator?: ElementLocator): string {
  if (!locator) return ""
  return locator.steps
    .map((step) => step.selectors[0] ?? "")
    .join(` ${SHADOW_SEPARATOR} `)
}

/** Returns an error message, or null when every segment is valid CSS */
export function validateLocatorText(text: string): string | null {
  const segments = text.split(SHADOW_SEPARATOR).map((s) => s.trim())
  if (segments.some((s) => !s)) return "Selector is empty"
  for (const segment of segments) {
    try {
      document.createDocumentFragment().querySelector(segment)
    } catch {
      return `Not a valid CSS selector: ${segment}`
    }
  }
  return null
}

/**
 * Build a locator from typed text. If the text still matches `previous`, the
 * previous locator is kept so its fallback selectors and fingerprint survive.
 */
export function textToLocator(
  text: string,
  previous?: ElementLocator
): ElementLocator {
  const trimmed = text.trim()
  if (previous && locatorToText(previous) === trimmed) return previous
  const segments = trimmed.split(SHADOW_SEPARATOR).map((s) => s.trim())
  const last = segments[segments.length - 1]
  const tag = /^[a-z][a-z0-9-]*/i.exec(last)?.[0]?.toLowerCase() || "*"
  return {
    steps: segments.map((s) => ({ selectors: [s] })),
    // Only the tag is known, which is never enough for a fuzzy match, so a
    // hand-written selector either matches or falls back to auto-detection.
    fingerprint: { tag }
  }
}

/** Accepts a hostname or a full URL and returns the bare hostname */
export function normalizeHost(input: string): string | null {
  const value = input.trim().toLowerCase()
  if (!value) return null
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`)
    return url.hostname || null
  } catch {
    return null
  }
}

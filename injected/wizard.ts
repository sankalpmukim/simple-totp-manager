/**
 * Setup wizard: link an account to the site, point at the code field with a
 * DevTools-style element picker, and choose what happens after filling.
 */
import type {
  AccountSummary,
  SiteConfig,
  SiteDraft,
  SubmitMode
} from "../autofill/types"
import {
  buttonFrom,
  detectFieldCandidates,
  detectSubmitButton,
  fieldTargetFrom,
  type FieldTarget
} from "./detect"
import { deepElementFromPoint, describeElement } from "./dom"
import { buildLocator, resolveLocator } from "./locator"
import {
  BoxLayer,
  bringToFront,
  getOverlayRoot,
  h,
  maybeTeardown,
  overlayHost,
  unionRect,
  type BoxSpec,
  type BoxVariant,
  type TagSpec
} from "./overlay"

export interface WizardOptions {
  host: string
  accounts: AccountSummary[]
  suggestedAccountId?: number
  existing?: SiteConfig
  reason?: string
  shortcut?: string
  onSave: (draft: SiteDraft, fillNow: boolean) => Promise<void>
}

type Step = "account" | "field" | "submit"
type Picking = null | "field" | "button"

const STEP_LABELS: Record<Step, string> = {
  account: "1 · Account",
  field: "2 · Code field",
  submit: "3 · After filling"
}

const SUBMIT_OPTIONS: { mode: SubmitMode; label: string; desc: string }[] = [
  {
    mode: "click",
    label: "Click a submit button",
    desc: "Fill the code, then click the button you pick."
  },
  {
    mode: "enter",
    label: "Press Enter",
    desc: "Fill the code, then submit the form with Enter."
  },
  {
    mode: "auto",
    label: "The site continues by itself",
    desc: "Many sites submit as soon as the last digit is entered."
  },
  {
    mode: "none",
    label: "Nothing, I'll submit myself",
    desc: "Only fill the code."
  }
]

let active: Wizard | null = null

export function openWizard(opts: WizardOptions) {
  active?.close()
  active = new Wizard(opts)
}

export function closeWizard() {
  active?.close()
}

function describeField(target: FieldTarget): { title: string; sub: string } {
  if (target.kind === "split") {
    return {
      title: `${target.inputs.length} separate boxes`,
      sub: describeElement(target.inputs[0]) + " …"
    }
  }
  const input = target.inputs[0]
  const type = input.getAttribute("type") || "text"
  return { title: `Single ${type} input`, sub: describeElement(input) }
}

function sameTarget(a: FieldTarget | null, b: FieldTarget | null) {
  return !!a && !!b && a.inputs[0] === b.inputs[0]
}

class Wizard {
  private step: Step = "account"
  private accountId: number
  private field: FieldTarget | null = null
  private fieldAuto = false
  private submitMode: SubmitMode | null = null
  private button: Element | null = null
  private picking: Picking = null
  private hoverEl: Element | null = null
  private hoverField: FieldTarget | null = null
  private suggestedField: FieldTarget | null = null
  private suggestedButton: Element | null = null
  private notice = ""
  private saving = false
  private closed = false
  private raf = 0

  private glass: HTMLElement
  private panel: HTMLElement
  private layerEl: HTMLElement
  private layer: BoxLayer

  constructor(private opts: WizardOptions) {
    const root = getOverlayRoot()
    this.glass = h("div", { class: "glass" })
    this.layerEl = h("div")
    this.panel = h("div", {
      class: "panel",
      role: "dialog",
      "aria-label": "Set up TOTP autofill"
    })
    root.append(this.glass, this.layerEl, this.panel)
    this.layer = new BoxLayer(this.layerEl)

    const { existing, accounts, suggestedAccountId } = opts
    const known = (id?: number) =>
      id !== undefined && accounts.some((a) => a.id === id)
    this.accountId = known(existing?.accountId)
      ? existing!.accountId
      : known(suggestedAccountId)
        ? suggestedAccountId!
        : accounts[0].id

    if (existing?.field) {
      const resolved = resolveLocator(existing.field.locator)
      this.field = resolved ? fieldTargetFrom(resolved.el) : null
    } else if (existing && !existing.needsSetup) {
      this.fieldAuto = true
    }
    if (existing) {
      this.submitMode = existing.submit.mode
      if (existing.submit.locator) {
        this.button = resolveLocator(existing.submit.locator)?.el ?? null
      }
    }

    this.glass.addEventListener("pointermove", this.onMove)
    this.glass.addEventListener("pointerdown", this.onPointerDown)
    this.glass.addEventListener("click", this.onClick)
    window.addEventListener("keydown", this.onKey, true)

    this.render()
    this.loop()
    bringToFront()
    requestAnimationFrame(() =>
      this.panel.querySelector<HTMLElement>("select, button.primary")?.focus()
    )
  }

  close() {
    if (this.closed) return
    this.closed = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener("keydown", this.onKey, true)
    this.layer.destroy()
    this.glass.remove()
    this.layerEl.remove()
    this.panel.remove()
    if (active === this) active = null
    maybeTeardown()
  }

  // --- navigation ---------------------------------------------------------

  private goTo(step: Step) {
    this.step = step
    this.notice = ""
    this.hoverEl = null
    this.hoverField = null
    if (step === "field") {
      this.picking = "field"
      const best = detectFieldCandidates()[0]
      this.suggestedField = best && best.score >= 50 ? best.target : null
    } else if (step === "submit") {
      const anchor = (this.field ?? this.suggestedField)?.inputs.slice(-1)[0]
      this.suggestedButton = anchor ? detectSubmitButton(anchor) : null
      if (this.submitMode === null) {
        this.submitMode = this.suggestedButton ? "click" : "none"
        if (this.suggestedButton) this.button = this.suggestedButton
      }
      this.picking =
        this.submitMode === "click" && !this.button ? "button" : null
    } else {
      this.picking = null
    }
    this.render()
  }

  private chooseField(target: FieldTarget) {
    this.field = target
    this.fieldAuto = false
    this.goTo("submit")
  }

  private chooseButton(el: Element) {
    this.button = el
    this.picking = null
    this.notice = ""
    this.render()
  }

  private setMode(mode: SubmitMode) {
    this.submitMode = mode
    this.notice = ""
    if (mode === "click") {
      if (!this.button && this.suggestedButton)
        this.button = this.suggestedButton
      this.picking = this.button ? null : "button"
    } else {
      this.picking = null
    }
    this.render()
  }

  private async save(fillNow: boolean) {
    if (this.saving) return
    this.saving = true
    this.render()
    const field =
      !this.fieldAuto && this.field
        ? {
            kind: this.field.kind,
            locator: buildLocator(this.field.inputs[0]),
            length:
              this.field.kind === "split" ? this.field.inputs.length : undefined
          }
        : undefined
    const mode = this.submitMode ?? "none"
    const draft: SiteDraft = {
      host: this.opts.host,
      accountId: this.accountId,
      field,
      submit: {
        mode,
        locator:
          mode === "click" && this.button && this.button.isConnected
            ? buildLocator(this.button)
            : undefined
      }
    }
    try {
      this.close()
      await this.opts.onSave(draft, fillNow)
    } catch {
      // the background shows its own error toast
    }
  }

  // --- picker events --------------------------------------------------------

  private onPointerDown = (e: PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  private onMove = (e: PointerEvent) => {
    const el = deepElementFromPoint(e.clientX, e.clientY)
    if (el === this.hoverEl) return
    this.hoverEl = el
    this.hoverField = this.picking === "field" ? fieldTargetFrom(el) : null
  }

  private onClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const el = deepElementFromPoint(e.clientX, e.clientY)
    if (this.picking === "field") {
      const target = fieldTargetFrom(el)
      if (target) this.chooseField(target)
      else {
        this.notice =
          "That isn't a text input. Click the box you'd type the code into."
        this.render()
      }
    } else if (this.picking === "button") {
      const button = buttonFrom(el)
      if (button) this.chooseButton(button)
    }
  }

  private onKey = (e: KeyboardEvent) => {
    const host = overlayHost()
    const fromOverlay = !!host && e.composedPath().includes(host)
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      if (this.picking === "button") {
        this.picking = null
        if (!this.button) this.submitMode = "none"
        this.render()
      } else {
        this.close()
      }
      return
    }
    if (e.key !== "Enter" || fromOverlay) return
    if (this.picking === "field" && this.suggestedField) {
      e.preventDefault()
      e.stopPropagation()
      this.chooseField(this.suggestedField)
    } else if (this.picking === "button" && this.suggestedButton) {
      e.preventDefault()
      e.stopPropagation()
      this.chooseButton(this.suggestedButton)
    }
  }

  // --- highlight loop -------------------------------------------------------

  private loop = () => {
    if (this.closed) return
    this.drawBoxes()
    this.raf = requestAnimationFrame(this.loop)
  }

  private fieldBoxes(target: FieldTarget, variant: BoxVariant): BoxSpec[] {
    const rects = target.inputs
      .filter((i) => i.isConnected)
      .map((i) => i.getBoundingClientRect())
    if (!rects.length) return []
    if (rects.length === 1) return [{ rect: rects[0], variant }]
    return [
      { rect: unionRect(rects), variant },
      ...rects.map((rect) => ({ rect, variant, part: true }))
    ]
  }

  private drawBoxes() {
    const specs: BoxSpec[] = []
    let tag: TagSpec | null = null
    const hoverRects: DOMRect[] = []

    if (this.picking === "field") {
      if (
        this.suggestedField &&
        !sameTarget(this.suggestedField, this.hoverField)
      )
        specs.push(...this.fieldBoxes(this.suggestedField, "suggest"))
      if (this.hoverField) {
        const boxes = this.fieldBoxes(this.hoverField, "hover")
        specs.push(...boxes)
        if (boxes[0]) {
          hoverRects.push(boxes[0].rect)
          const r = boxes[0].rect
          tag = {
            rect: r,
            html: [
              h("span", null, describeElement(this.hoverField.inputs[0])),
              h(
                "span",
                { class: "dim" },
                ` ${Math.round(r.width)}×${Math.round(r.height)}`
              ),
              this.hoverField.kind === "split"
                ? h(
                    "span",
                    { class: "ok" },
                    ` · ${this.hoverField.inputs.length} boxes`
                  )
                : null
            ].filter(Boolean) as Node[]
          }
        }
      } else if (this.hoverEl) {
        const r = this.hoverEl.getBoundingClientRect()
        specs.push({ rect: r, variant: "hover-bad" })
        tag = {
          rect: r,
          html: [
            h("span", null, describeElement(this.hoverEl)),
            h("span", { class: "dim" }, " · not an input")
          ]
        }
      }
    } else if (this.field && this.step === "submit") {
      specs.push(...this.fieldBoxes(this.field, "field"))
    }

    if (this.picking === "button") {
      if (
        this.suggestedButton &&
        this.suggestedButton !== buttonFrom(this.hoverEl)
      )
        specs.push({
          rect: this.suggestedButton.getBoundingClientRect(),
          variant: "suggest"
        })
      const hb = buttonFrom(this.hoverEl)
      if (hb) {
        const r = hb.getBoundingClientRect()
        hoverRects.push(r)
        specs.push({ rect: r, variant: "hover" })
        tag = {
          rect: r,
          html: [
            h("span", null, describeElement(hb)),
            h(
              "span",
              { class: "dim" },
              ` ${Math.round(r.width)}×${Math.round(r.height)}`
            )
          ]
        }
      }
    } else if (
      this.step === "submit" &&
      this.submitMode === "click" &&
      this.button?.isConnected
    ) {
      specs.push({
        rect: this.button.getBoundingClientRect(),
        variant: "button"
      })
    }

    this.layer.draw(specs, tag)
    this.avoidOverlap([
      ...hoverRects,
      ...specs.filter((s) => !s.part).map((s) => s.rect)
    ])
  }

  /** Move the panel to another corner if it covers what the user is looking at */
  private avoidOverlap(rects: DOMRect[]) {
    const panel = this.panel.getBoundingClientRect()
    const relevant = rects.filter((r) => r.height < innerHeight * 0.5)
    const hits = (p: DOMRect) =>
      relevant.some(
        (r) =>
          r.left < p.right &&
          r.right > p.left &&
          r.top < p.bottom &&
          r.bottom > p.top
      )
    if (!hits(panel)) return
    const { width: w, height: ht } = panel
    const m = 16
    const xs = [(innerWidth - w) / 2, innerWidth - w - m, m]
    const ys: ("top" | "bottom")[] = ["top", "bottom"]
    for (const x of xs) {
      for (const y of ys) {
        const top = y === "top" ? m : innerHeight - ht - m
        if (hits(new DOMRect(x, top, w, ht))) continue
        // Anchor to the chosen edge so the panel stays on screen as it grows
        Object.assign(this.panel.style, {
          left: `${Math.max(0, x)}px`,
          top: y === "top" ? `${m}px` : "auto",
          bottom: y === "bottom" ? `${m}px` : "auto",
          transform: "none"
        })
        return
      }
    }
  }

  // --- rendering -------------------------------------------------------------

  private render() {
    if (this.closed) return
    this.glass.classList.toggle("on", this.picking !== null)
    const steps: Step[] = ["account", "field", "submit"]
    const index = steps.indexOf(this.step)

    this.panel.replaceChildren(
      h(
        "div",
        { class: "head" },
        h(
          "span",
          { class: "title" },
          this.opts.existing ? "Edit autofill" : "Set up autofill"
        ),
        h("span", { class: "chip", title: this.opts.host }, this.opts.host),
        h(
          "button",
          {
            class: "icon-btn",
            title: "Close (Esc)",
            on: { click: () => this.close() }
          },
          "×"
        )
      ),
      h(
        "div",
        { class: "steps" },
        ...steps.map((s, i) =>
          h(
            "span",
            { class: i === index ? "on" : i < index ? "done" : "" },
            STEP_LABELS[s]
          )
        )
      ),
      h(
        "div",
        { class: "body" },
        this.opts.reason && index === 0
          ? h("div", { class: "reason" }, this.opts.reason)
          : null,
        ...this.renderStep()
      ),
      this.renderFoot()
    )
  }

  private renderStep(): (Node | null)[] {
    if (this.step === "account") {
      const select = h(
        "select",
        {
          on: {
            change: (e) => {
              this.accountId = Number((e.target as HTMLSelectElement).value)
            },
            keydown: (e) => {
              if ((e as KeyboardEvent).key === "Enter") this.goTo("field")
            }
          }
        },
        ...this.opts.accounts.map((a) =>
          h(
            "option",
            { value: String(a.id), selected: a.id === this.accountId },
            a.name
          )
        )
      )
      const suggested =
        !this.opts.existing && this.opts.suggestedAccountId === this.accountId
      return [
        h("div", { class: "q" }, "Which account is this site for?"),
        select,
        suggested
          ? h("div", { class: "hint" }, "Suggested from the site name.")
          : null
      ]
    }

    if (this.step === "field") {
      const nodes: (Node | null)[] = [
        h("div", { class: "q" }, "Click the code input on the page"),
        h(
          "div",
          { class: "picking" },
          h("span", { class: "pulse" }),
          "Picking… single inputs and digit boxes both work"
        )
      ]
      if (this.notice) nodes.push(h("div", { class: "reason" }, this.notice))
      const current = this.field
      if (current) {
        const d = describeField(current)
        nodes.push(
          this.card("Currently saved", d.title, d.sub, "Keep", () =>
            this.chooseField(current)
          )
        )
      }
      if (this.suggestedField && !sameTarget(this.suggestedField, current)) {
        const d = describeField(this.suggestedField)
        const s = this.suggestedField
        nodes.push(
          this.card(
            "Detected",
            d.title,
            d.sub,
            "Use this",
            () => this.chooseField(s),
            true
          )
        )
      }
      nodes.push(
        h(
          "div",
          { class: "hint" },
          this.suggestedField ? h("kbd", null, "Enter") : null,
          this.suggestedField ? " uses the detected field · " : "",
          h("kbd", null, "Esc"),
          " cancels"
        )
      )
      return nodes
    }

    // submit step
    const nodes: (Node | null)[] = []
    if (this.fieldAuto || !this.field) {
      nodes.push(
        this.card("Code field", "Auto-detect each time", "", "Pick", () =>
          this.goTo("field")
        )
      )
    } else {
      const d = describeField(this.field)
      nodes.push(
        this.card(
          "Code field",
          d.title,
          d.sub,
          "Change",
          () => this.goTo("field"),
          true
        )
      )
    }
    nodes.push(h("div", { class: "q" }, "After filling the code…"))
    nodes.push(
      h(
        "div",
        { class: "options" },
        ...SUBMIT_OPTIONS.map((opt) => {
          const on = this.submitMode === opt.mode
          let extra: Node | null = null
          if (on && opt.mode === "click") {
            if (this.picking === "button") {
              extra = h(
                "div",
                { class: "extra" },
                h(
                  "div",
                  { class: "picking" },
                  h("span", { class: "pulse" }),
                  "Click the submit button on the page"
                ),
                this.suggestedButton
                  ? h(
                      "div",
                      { class: "hint" },
                      "Detected one (dashed) · ",
                      h("kbd", null, "Enter"),
                      " to use it"
                    )
                  : h(
                      "div",
                      { class: "hint" },
                      h(
                        "button",
                        {
                          class: "link",
                          on: {
                            click: (e) => {
                              e.stopPropagation()
                              this.picking = null
                              this.render()
                            }
                          }
                        },
                        "Skip: look for a button each time"
                      )
                    )
              )
            } else {
              const label = this.button
                ? `“${(this.button.textContent || describeElement(this.button)).trim().slice(0, 40)}”`
                : "Find a button each time"
              extra = h(
                "div",
                { class: "extra hint" },
                `Button: ${label} · `,
                h(
                  "button",
                  {
                    class: "link",
                    on: {
                      click: (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        this.picking = "button"
                        this.render()
                      }
                    }
                  },
                  "Pick again"
                )
              )
            }
          }
          return h(
            "label",
            { class: `option${on ? " on" : ""}` },
            h("input", {
              type: "radio",
              name: "submit-mode",
              checked: on,
              on: { change: () => this.setMode(opt.mode) }
            }),
            h("span", { class: "label" }, opt.label),
            h("span", { class: "desc" }, opt.desc),
            extra
          )
        })
      )
    )
    return nodes
  }

  private card(
    kicker: string,
    title: string,
    sub: string,
    action: string,
    onAction: () => void,
    green = false
  ) {
    return h(
      "div",
      { class: `card${green ? " green" : ""}` },
      green ? h("span", { class: "dot" }) : null,
      h(
        "div",
        { class: "grow" },
        h("div", { class: "hint" }, kicker),
        h("div", { style: "font-weight:500" }, title),
        sub ? h("div", { class: "sub" }, sub) : null
      ),
      h("button", { class: "btn small", on: { click: onAction } }, action)
    )
  }

  private renderFoot() {
    const btn = (
      label: string,
      onClick: () => void,
      primary = false,
      disabled = false
    ) =>
      h(
        "button",
        {
          class: `btn${primary ? " primary" : ""}`,
          disabled,
          on: { click: onClick }
        },
        label
      )
    if (this.step === "account") {
      return h(
        "div",
        { class: "foot" },
        btn("Cancel", () => this.close()),
        btn("Next", () => this.goTo("field"), true)
      )
    }
    if (this.step === "field") {
      return h(
        "div",
        { class: "foot" },
        btn("Back", () => this.goTo("account")),
        h("span", { class: "spacer" }),
        btn("Skip: auto-detect", () => {
          this.fieldAuto = true
          this.field = null
          this.goTo("submit")
        })
      )
    }
    return h(
      "div",
      { class: "foot" },
      btn("Back", () => this.goTo("field")),
      h("span", { class: "spacer" }),
      btn("Save", () => this.save(false), false, this.saving),
      btn("Save & fill now", () => this.save(true), true, this.saving)
    )
  }
}

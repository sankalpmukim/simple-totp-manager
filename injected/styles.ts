/** Styles for the in-page overlay. Lives inside a closed shadow root. */
export const OVERLAY_CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.root {
  --blue: #4285f4; --blue-dark: #3367d6; --green: #1e8e3e; --orange: #e37400;
  --red: #d93025; --text: #202124; --muted: #5f6368; --line: #dadce0;
  --soft: #f1f3f4;
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, sans-serif;
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

/* --- element picker ---------------------------------------------------- */
.glass {
  position: fixed; inset: 0; cursor: crosshair; display: none;
  background: transparent; z-index: 1;
}
.glass.on { display: block; }
.box {
  position: fixed; pointer-events: none; z-index: 2; border-radius: 3px;
  transition: top .06s, left .06s, width .06s, height .06s;
}
.box.hover { background: rgba(66,133,244,.18); outline: 2px solid var(--blue); }
.box.hover-bad { background: rgba(95,99,104,.12); outline: 1px dashed var(--muted); }
.box.suggest { outline: 2px dashed var(--green); background: rgba(30,142,62,.08); }
.box.field { outline: 2px solid var(--green); background: rgba(30,142,62,.12); }
.box.button { outline: 2px solid var(--orange); background: rgba(227,116,0,.12); }
.box.part { outline-width: 1px; background: transparent; }
.tag {
  position: fixed; pointer-events: none; z-index: 3; white-space: nowrap;
  background: #202124; color: #fff; border-radius: 4px; padding: 3px 7px;
  font: 11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
  box-shadow: 0 2px 6px rgba(0,0,0,.25);
}
.tag .dim { color: #9aa0a6; }
.tag .ok { color: #81c995; }

/* --- wizard panel -------------------------------------------------------- */
.panel {
  position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
  width: min(400px, calc(100vw - 24px)); z-index: 10;
  max-height: calc(100vh - 32px); overflow-y: auto;
  background: #fff; border-radius: 12px;
  box-shadow: 0 12px 36px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.12);
  overflow: hidden;
}
.head {
  display: flex; align-items: center; gap: 8px; padding: 12px 14px;
  background: var(--blue); color: #fff;
}
.head .title { font-weight: 600; font-size: 14px; flex: 1; }
.chip {
  background: rgba(255,255,255,.2); border-radius: 10px; padding: 1px 8px;
  font-size: 11px; max-width: 160px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
}
.icon-btn {
  all: unset; cursor: pointer; width: 24px; height: 24px; border-radius: 6px;
  display: grid; place-items: center; font-size: 16px; line-height: 1;
}
.icon-btn:hover { background: rgba(255,255,255,.2); }
.steps { display: flex; gap: 4px; padding: 10px 14px 0; }
.steps span {
  flex: 1; font-size: 11px; color: var(--muted); padding-bottom: 6px;
  border-bottom: 2px solid var(--line);
}
.steps span.on { color: var(--blue); border-color: var(--blue); font-weight: 600; }
.steps span.done { color: var(--green); border-color: var(--green); }
.body { padding: 12px 14px 4px; display: grid; gap: 10px; }
.q { font-weight: 600; font-size: 14px; }
.hint { color: var(--muted); font-size: 12px; }
.reason {
  background: #fef7e0; color: #7a4f01; border-radius: 6px; padding: 6px 9px;
  font-size: 12px;
}
select {
  width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px;
  font: inherit; color: inherit; background: #fff;
}
select:focus { outline: 2px solid var(--blue); outline-offset: -1px; }
.card {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px;
  border: 1px solid var(--line); border-radius: 8px; background: #fff;
}
.card.green { border-color: #a8dab5; background: #e6f4ea; }
.card .grow { flex: 1; min-width: 0; }
.card .sub { color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); flex: none; }
.picking {
  display: flex; align-items: center; gap: 8px; color: var(--blue); font-weight: 500;
}
.pulse {
  width: 10px; height: 10px; border-radius: 50%; background: var(--blue);
  animation: pulse 1.2s infinite;
}
@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(66,133,244,.6) } 100% { box-shadow: 0 0 0 10px rgba(66,133,244,0) } }
.options { display: grid; gap: 6px; }
.option {
  display: grid; grid-template-columns: 18px 1fr; gap: 2px 8px; padding: 8px 10px;
  border: 1px solid var(--line); border-radius: 8px; cursor: pointer; align-items: start;
}
.option:hover { background: var(--soft); }
.option.on { border-color: var(--blue); background: #e8f0fe; }
.option input { margin-top: 2px; accent-color: var(--blue); }
.option .label { font-weight: 500; }
.option .desc { grid-column: 2; color: var(--muted); font-size: 12px; }
.option .extra { grid-column: 2; margin-top: 4px; }
.foot {
  display: flex; gap: 8px; justify-content: flex-end; align-items: center;
  padding: 10px 14px 14px;
}
.foot .spacer { flex: 1; }
button.btn {
  all: unset; cursor: pointer; padding: 7px 12px; border-radius: 6px; font-weight: 500;
  font-size: 13px; color: var(--blue); text-align: center;
}
button.btn:hover { background: #e8f0fe; }
button.btn.primary { background: var(--blue); color: #fff; }
button.btn.primary:hover { background: var(--blue-dark); }
button.btn.small { padding: 3px 8px; font-size: 12px; }
button.btn:disabled { opacity: .5; cursor: default; }
button.btn:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.link { all: unset; cursor: pointer; color: var(--blue); font-size: 12px; }
.link:hover { text-decoration: underline; }
kbd {
  font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--soft);
  border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; padding: 0 4px;
}

/* --- toasts --------------------------------------------------------------- */
.toasts {
  position: fixed; right: 16px; bottom: 16px; z-index: 20; display: grid; gap: 8px;
  width: min(340px, calc(100vw - 32px));
}
.toast {
  display: grid; grid-template-columns: 22px 1fr auto; gap: 2px 8px; align-items: start;
  background: #202124; color: #fff; border-radius: 10px; padding: 10px 10px 10px 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,.25); animation: rise .18s ease-out;
}
@keyframes rise { from { transform: translateY(8px); opacity: 0 } to { transform: none; opacity: 1 } }
.toast .sym {
  width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;
  font-size: 12px; font-weight: 700; margin-top: 1px;
}
.toast.success .sym { background: #34a853; }
.toast.info .sym { background: var(--blue); }
.toast.error .sym { background: #ea4335; }
.toast .msg { font-weight: 500; }
.toast .detail { grid-column: 2; color: #bdc1c6; font-size: 12px; }
.toast .actions { grid-column: 2 / 4; display: flex; gap: 4px; margin-top: 6px; }
.toast button.btn { color: #8ab4f8; padding: 4px 8px; }
.toast button.btn:hover { background: rgba(138,180,248,.12); }
.toast .icon-btn { color: #9aa0a6; }
.toast .icon-btn:hover { background: rgba(255,255,255,.1); }
`

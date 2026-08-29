# MODAL-01 — URL retract on close (owner 2026-08-29)

A modal, drawer, side-panel, or wizard whose open state can be derived from the URL **must fully retract that URL on close** — path, sub-tab, and query param.

Closing must be **idempotent**: after `onClose`, re-running the open logic against the current URL must produce CLOSED.

1. **One opener per modal.** Never `useState(<url-derived>)` and an effect. Effect is source of truth; `useState(false)` is the seed.
2. **Never guard a URL-driven open with a bare `useRef`.** A ref resets on remount. The URL is the state; retract the URL.
3. **Close retracts every signal**, not only a query param.

Guard: `scripts/verify-modal-close-retracts-url.mjs` (wired via existing even step 4200). Skip #15546.

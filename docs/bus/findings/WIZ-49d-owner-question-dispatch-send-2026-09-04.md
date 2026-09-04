# WIZ-49d — OWNER QUESTION (send-to-driver): rate confirmation vs dispatch sheet

**Status: FILED — send NOT built. Awaiting owner ruling.** Items a–c shipped (split Save, Print, in-modal confirmation).

## The question
When a load is dispatched and we "send to the driver", what document goes to the driver?

- **Rate confirmation** — carries the **customer rate** (the broker↔carrier agreement, with the billed amount).
- **Dispatch sheet** — same lane / stops / instructions **with revenue omitted** — the driver-facing copy.

You said "rate con." A rate con shows the driver the billed rate.

## §7 research (fresh, 2026-09-04 — not from memory)
The industry consistently ships **two separate documents** and sends the **dispatch sheet (no rate)** to the driver:

- **Axele** — ships a "Driver Dispatch Sheet" (PDF, "shares load details, minus revenue … Revenue is omitted for scenarios where the driver should not be privy to the contracted rate") separately from a "Driver Dispatch Rate Confirmation" (includes revenue). Source: worktruckonline.com Axele TMS update.
- **Alvys** — separates the rate confirmation from a templated dispatch sheet within the load record; the dispatch sheet shares operational details without financial data. Source: alvys.com/features/tms-dispatch-software.
- **EZ Loader (two-part rate confirmation)** — "send a dispatch sheet with lane details but no rate"; "Hide Details and Reference #s"; auto-send the dispatch sheet after the rate con is signed. Source: ez-loader-tms helpscout 6.3.
- **STARS / Sammons dispatch workflow** — "the dispatch sheet is cleaner because it doesn't contain all the legalese, signature area, etc. Just the important information the driver needs." Source: heavyhaul.net/first-load.

So the reference products default to **dispatch sheet → driver** (rate hidden), and reserve the rate confirmation for the broker/dispatcher.

## What we already have
`GET /api/v1/dispatch/loads/:id/dispatch-sheet.html` exists and is what Load Detail's "Print dispatch sheet" already uses — **it is the revenue-omitted driver document.** WIZ-49b wired the Book/Edit footer **Print** to this exact path.

## Decision needed (pick one)
1. **Dispatch sheet to the driver** (industry default; rate hidden) — we wire "Save and send" and the on-dispatch send to the existing `dispatch-sheet.html` path.
2. **Rate confirmation to the driver** (driver sees the billed rate) — we wire it to the rate-con document instead.
3. **Both, operator picks per send.**

## Also verify (unproven — never dispatched live)
The ON SAVE panel promises "Send driver dispatch message" and "Driver instructions → mobile + dispatch PDF." Whether either **actually fires** is unproven (no live dispatch yet). Once you rule on the document, this seat will (a) prove the send path live and (b) wire "Save and send" in the footer split control (currently a visible, disabled affordance with this reason).

**Until you rule: "Save and send" stays disabled with this reason. No send is built.**

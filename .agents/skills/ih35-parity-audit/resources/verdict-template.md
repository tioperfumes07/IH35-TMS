# Parity audit — per-module verdict template

One block per module. Fill both layers; assign exactly one verdict; turn every GAP into a dispatch-ready block.

---

## Module: `<name>` (route: `<path>`)

**Reference:** <McLeod / QuickBooks / Alvys — the relevant one for this domain>

### Layer 1 — Live defect audit (what I exercised)
- Flow(s) exercised: <e.g. create → assign → invoice>, authed as <role>.
- Defects found: <500s / phantom columns / silent 400 / masked-empty / broken flow — each with the exact
  request + response, or "none">.
- Proof: <endpoint response / health sha / DB row — not a screenshot claim>.

### Layer 2 — Fresh parity research
- Reference capabilities (researched fresh, not from memory): <bullet the domain features the reference ships>.
- Feature-by-feature comparison: <ours vs reference, per capability>.

### VERDICT: `MEETS` | `GAP → BLOCK` | `SURPASSES`
- **If MEETS:** the specific capability at parity → <cite it>.
- **If SURPASSES:** the edge beyond the reference → <cite it (exact-cents, confidence, audit trail, etc.)>.
- **If GAP:** the missing capability → <name it>, and the block:
  ```
  block_id:   <PHASE-TASK, e.g. P4-T3.2>
  scope:      <what to build, additive-only>
  files:      <paths to create/touch>
  tier:       non-financial | financial (design-doc + owner/CPA gate)
  ```

### Notes
- Sampling: <if this was a partial sweep, say exactly what was NOT covered — no silent caps>.

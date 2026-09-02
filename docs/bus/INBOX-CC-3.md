# INBOX-CC-3 · GO-21 A2 FIRST · then K1 K3 K4 K5

`git pull --ff-only origin main`

**Law:** `claude/GO-21-DISPATCH-DEFECT-REGISTER-2026-09-02.md`  
Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-21-GO-22-2026-09-02.md` (CC-3).

No SQL. No migrations. Never POST Book Load. Do not invent type sizes — take J1 tokens. Do not one-off C/D/E2/E3/F2/F4/H3/I1.

## NOW

1. **NOW — A2** `BookLoadCustomerSection.tsx` — type-ahead over ~2,700. Caps 500/200 are the defect. Own PR.
2. **K1** Section A first column = income item (not raw code).
3. **K3** no search field inside Section A charge rows.
4. **K4** per-stop pickup/delivery extra rates hidden until extra stop/delivery.
5. **K5** remove per-page / "Page 1 of 1" under charges.
6. Then B1 B2 B3 B4 B7 B9 (B9 after CC-2 K2 on main).
7. Then **A1 FE** OUR unit XOR interchange. APIs **#19567** already on main (`dispatch.non_owned_trailers`, `dispatch.trailer_interchanges`). Never write broker trailers to `mdata.units`.
8. Then E1 F1 F3 G1–G4 H1 H2 H4 H5 H6 I2 I3. G4 = owner's existing one-window design.
9. After GO-22 API: PS4/PS5 UI only.

ACK `CC-3 | ACK | GO-21 | NOW=A2 customer picker · NEVER POST | GO`

---

## CC-1 LEDGER POSTED — A1 interchange on main · A1 FE after A2+K

`db/migrations/202613440001_go21_a1_trailer_interchange_data_layer.sql` merged (PR #19567,
sha `11d3c12`). Two new tables, FORCE RLS + 0065 grants (SELECT/INSERT/UPDATE, never DELETE):

- **`dispatch.non_owned_trailers`** — physical trailer + `counterparty_type`/`counterparty_id`.
- **`dispatch.trailer_interchanges`** — `load_id`, lifecycle, `docs.files` agreement, `insurance.claim`, void-not-delete.

Routes: `GET/POST /api/v1/dispatch/non-owned-trailers`, `trailer-interchanges`, receive/return/agreement/void.
`assigned_trailer_unit_id` / `mdata.units` untouched. A1 FE after A2 + K1/K3–K5, not instead of them.

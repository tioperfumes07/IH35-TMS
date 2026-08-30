# QBO Transportation file = USMCA books · Faro + AlwaysTrack match (owner 2026-08-30)

**ANSWERED = CLOSED.** Owner chat 2026-08-30.

The TMS was not ready when USMCA started operating. **Transportation stopped.** In QuickBooks, the **Transportation company file was renamed to USMCA.** That file is how we read historical A/R. It is **not** a second operating company to campaign, and it is **not** “ignore QBO.”

Neon still stores the mirror on TMS opco **TRANSP** (`91e0bf0a-133f-4ce8-a734-2586cfa66d96`, legal name still `IH 35 Transportation LLC` in `org.companies`). That is clone keying. **For August USMCA tie-out, treat `mdata.qbo_ar_invoices` on that company as the USMCA QBO books.** Do not enable USMCA QBO sync. Do not TMS→QBO write-back.

AlwaysTrack still has one company dropdown: **IH35 Transportation, LLC.** Same reason: AT was never split. Entity for money is **which Faro schedule bought the invoice**, then QBO/AT remainder.

## How to reconcile (mandatory join order)

1. **Faro purchased invoices** (USMCA Faro schedule) **to AlwaysTrack loads** on **PO / W.O.**, never customer+amount.
2. Where AT has **no load** (outage / non-payment days, ~**2026-08-10** onward): match Faro to **QBO 3-digit docs** `001`–`013` on that same TRANSP-keyed mirror. Those docs use Faro invoice numbers as `DocNumber` and line text `Load Number - 00x`, Work Order often **blank**.
3. **Everything else must still be matched:** AT loads not on Faro, QBO `13xxx` invoices not on Faro, bank direct-pays (e.g. IM Specialized). Name each: factored / unfactored / direct-pay / still open. Do not drop them.

## Proven live (2026-08-30, lucia bypass, same table)

August TRANSP QBO A/R: **21** AT-style (`13xxx`) + **15** Faro-style (3-digit, including duplicate `006` rows). Series **001–013** starts **08/10**. **007 ITS** exists as QBO **$250** the same day Faro bought **$350** PO `68747` — match the **document**, then explain the **$100 / PO**. **016 / 019 / 028 / 036** are **not** in that 3-digit QBO window; they go back to AT (or a later QBO pull).

## Does not change

- No TMS→QBO write-back.
- No TRANSP/TRK product campaign. No new USMCA QBO realm.
- Customer **copy** TRANSP→USMCA still must **not** copy `qbo_customer_id` (those IDs belong to this one QBO file).
- Faro cash is USMCA factoring. Intercompany $7,241 is Faro reserve-to-reserve, not this QBO rename.

Companion: `docs/lockdown/OWNER-RULING-USMCA-FIRST-FULL-READY-2026-08-16.md` (TRANSP stopped 08/10; USMCA began 08/07). This file is the **QBO rename + match recipe**.

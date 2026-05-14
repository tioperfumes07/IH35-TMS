# Common flow FAQ — IH35 (office + driver)

Quick answers for **drivers**, **dispatchers**, and **Owners**. For deeper walkthroughs see the persona guides in this folder.

**How to use this page**

- Search (**Ctrl+F / Cmd+F**) for keywords: *Plaid*, *QBO*, *POD*, *Owner*, *role*.
- If an answer conflicts with your **written company policy**, policy wins—treat this as software behavior defaults, not legal advice.
- For screenshots and click-path detail, open `driver-quickstart.md`, `dispatcher-quickstart.md`, or `owner-admin-quickstart.md`.

---

1. **How do I log into the office app?**  
   Visit `https://app.ih35dispatch.com/login` → **Sign in with Google** using your company email. If you loop or get 403, cookies may be blocked or your user row / role missing—contact an Owner. In enterprise Chrome policies, ensure **`accounts.google.com`** is not blocked.

2. **How do drivers log in?**  
   Drivers use `https://driver.ih35dispatch.com` → **Email** → one-time **6-digit code**. No password. Code email delayed? Check spam and verify dispatch saved the correct lowercase email. Driver phone numbers are **not** the primary login in this flow—email must match identity linkage.

3. **I switched operating companies and my loads vanished—why?**  
   Most lists filter by **operating company**. Re-select TRK / TRANSP / correct org from the company picker. Data still exists; scope changed. Export attempts must also specify org or you’ll get partial CSVs.

4. **Why can’t I edit a load?**  
   You may lack role (`Dispatcher` vs read-only), load is **invoiced/closed**, or a workflow lock applies. Read the inline error; escalate with load ID. Avoid creating duplicate loads to “work around” locks—that forks history.

5. **Where do I upload BOL/POD?**  
   Drivers: inside **load → Stops → Upload BOL/POD** after **Mark Arrived**. Office staff generally should **not** duplicate uploads unless correcting a failed attempt—note the reason. Duplicates confuse OCR / audit timelines later.

6. **Settlement totals look wrong—what’s the fastest fix?**  
   Driver: open settlement → **Dispute** with specifics. Dispatcher: verify **POD timestamps** + **assignment** correctness *before* nagging accounting. Owner: check **uncategorized bank lines** didn’t starve cash timing. Parallel spreadsheets rarely help—fix source rows.

7. **Plaid says “needs reauth”—do I ignore?**  
   No. Bank feeds stall; categorization and cash application degrade. Fix via Plaid Link **re-authentication** path your Owner published. Weekend drift is common if passwords rotate at the bank portal.

8. **QuickBooks isn’t updating—does IH35 know?**  
   Check **QBO sync / outbox** views (accounting module). Stuck queue items often mean token expiry or COA mapping mismatch—not “mystical cloud delay.” Export the failing payload reference for engineering if recurring.

9. **Can two people share one Owner login?**  
   **Never.** It breaks audit trails and triggers last-Owner lock edge cases. Provision separate Google identities with `Owner` role. Shared inboxes as Google users are still individual identities—prefer real humans.

10. **How do scheduled report emails choose timezone?**  
    Each schedule stores a **timezone** (default `America/Chicago`). If recipients fly coasts, confirm they read PDF timestamps in context. **DST** transitions twice yearly—expect one-run skew warnings occasionally.

11. **What’s the difference between “booked” and “dispatched”?**  
    **Booked** = commercial plan captured. **Dispatched** = driver notified / movement implied. Policies vary; don’t use terms interchangeably in customer emails. Billing triggers may depend on delivered/invoiced, not dispatched.

12. **Why does the driver app want my location?**  
    Geofencing arrival / compliance cues. Deny location → some **Mark Arrived** actions fail. Prefer **Allow while using**. Battery saver mode can pause background geolocation on Android.

13. **Can I run IH35 fully on Safari iPhone for office work?**  
    Possible for light tasks; Owners should validate complex accounting grids. Use desktop for heavy month-end. Driver PWA targets mobile WebKit. Pinch-zoom tables may mis-tap tiny icons—landscape helps.

14. **Where do bank transactions come from if not Plaid?**  
    CSV upload paths (if enabled) or manual entry—consult your Accountant. Still categorize into GL for truth. Manual entry without date discipline wrecks reconciliation.

15. **How do I add a new trailer asset quickly?**  
    Maintenance or admin roles add **equipment** rows with `equipment_number`, **type** (e.g., `DryVan`, `Reefer`), VIN rules per validations. Typos break assignments. Confirm **owner company** linkage matches leasing reality.

16. **Customer credit hold—can dispatch override?**  
    Only if Owner policy grants explicit override with reason note. Silent overrides create uncollectible AR. Log customer acknowledgment if moving under duress.

17. **What does “categorize transaction” mean?**  
    Map a bank line to a **chart of accounts** bucket and optional dimensions—feeds QBO via outbox when configured. Rules can auto-suggest, but humans confirm edge cases.

18. **Is IH35 the legal system of record for contracts?**  
    No—executed carrier agreements live outside unless you upload contracts to docs module. IH35 operationalizes them. Court-submittable originals remain with counsel.

19. **How do I report a security concern (lost phone, suspected breach)?**  
    Tell an **Owner immediately**; they’ll rotate tokens, review sessions, and engage hosting vendors. Do not paste secrets into chat. Remote wipe company devices per MDM policy if applicable.

20. **Who updates these FAQs when UI labels change?**  
    Operations + Owner sponsor a **monthly doc sweep** tied to release notes—stale FAQs erode trust faster than stale data. Tag the responsible role in your HR handbook so it doesn’t orphan.

**Still stuck?**  
Open an internal ticket with **role**, **operating company**, **URL path**, **timestamp**, and **screenshot (PII redacted)**—engineers reproduce faster with those five facts than with “it’s broken.”

## Related internal docs

- [`docs/dr-runbook.md`](../dr-runbook.md) — outage playback.
- [`docs/testing/iphone-safari-smoke.md`](../testing/iphone-safari-smoke.md) — mobile smoke harness.
- [`docs/seed-real-data-guide.md`](../seed-real-data-guide.md) — how to seed staging safely.

These cross-links rotate as your knowledge base grows; bookmark the **docs/user-guides/README.md** landing page for new hires.

---

_Last updated: 2026-05-14_

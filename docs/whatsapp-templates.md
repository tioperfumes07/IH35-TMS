# WhatsApp Business templates (IH35 Dispatch — pre-built drafts)

These copies live in `apps/backend/src/whatsapp/templates/` as the canonical source of truth for wording + variable lists. **Submit them manually** in Meta Business Manager → WhatsApp Manager → Message templates (Standing Order: agents never submit on your behalf).

## Mapping `{placeholder}` → Meta `{{n}}`

WhatsApp approved templates use positional parameters (`{{1}}`, `{{2}}`, …). When you paste the body into Meta’s form:

1. Replace each `{variable}` in order with `{{1}}`, `{{2}}`, … matching the **Variables** column below.
2. Keep currency symbols literal (`$`) exactly as shown — Meta reviewers treat samples as examples.

## Template catalog

| Internal key | File | Suggested Meta template name | Body (paste) | Variables (order) |
| --- | --- | --- | --- | --- |
| Load assignment | `load-assignment.ts` | `ih35_load_assignment_v1` | `{driver_name}, you have a new load. Pickup {origin} → delivery {dest}. Rate ${rate}. Tap to accept: {link}` | `driver_name`, `origin`, `dest`, `rate`, `link` |
| Settlement ready | `settlement-ready.ts` | `ih35_settlement_ready_v1` | `Settlement {settlement_no} ready. Net pay ${net}. View: {link}` | `settlement_no`, `net`, `link` |
| Payment received | `payment-received.ts` | `ih35_payment_received_v1` | `Payment ${amount} received from {customer} on {date}. Posted to {bank_account}.` | `amount`, `customer`, `date`, `bank_account` |
| Dispatch sheet | `dispatch-sheet.ts` | `ih35_dispatch_sheet_v1` | `Dispatch sheet for load {load_no} ready. Driver: {driver}. View: {link}` | `load_no`, `driver`, `link` |
| Abandoned load | `abandoned-load.ts` | `ih35_abandoned_load_v1` | `URGENT: load {load_no} abandoned by {driver_name}. Reassignment in progress.` | `load_no`, `driver_name` |

### Sample previews (for Meta “example” fields)

- **Load assignment:** `Jane Doe, you have a new load. Pickup Austin, TX → delivery Dallas, TX. Rate $1,250.00. Tap to accept: https://dispatch.example.com/accept/abc123`
- **Settlement ready:** `Settlement STL-2026-0042 ready. Net pay $3,482.15. View: https://dispatch.example.com/driver/settlements/stl-42`
- **Payment received:** `Payment $4,200.00 received from ACME Logistics on 2026-05-14. Posted to Operating Checking ••••1234.`
- **Dispatch sheet:** `Dispatch sheet for load LD-908812 ready. Driver: Maria Lopez. View: https://dispatch.example.com/dispatch/sheets/908812`
- **Abandoned load:** `URGENT: load LD-771221 abandoned by Jane Doe. Reassignment in progress.`

## Meta submission checklist

1. Create / pick your **WhatsApp Business Account** + production phone number.
2. Navigate **Business settings → WhatsApp accounts → Message templates → Create template**.
3. Choose category that matches your intended usage (many transactional ops fit **UTILITY**; marketing blasts need **MARKETING** and stricter review).
4. Paste the **Body** column (after swapping `{vars}` → `{{n}}`).
5. Provide sample values for each variable — use the previews above.
6. Submit for approval; typical turnaround is minutes–days depending on account standing.
7. After approval, note the template **name** Meta assigns — wire it into runtime send code in a follow-up PR (this Block ships drafts only).

## Engineering registry

TypeScript exports + ordering metadata: `apps/backend/src/whatsapp/templates/index.ts`.

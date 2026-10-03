
---

# OWNER ORDER — 2026-10-02 — SETTLEMENT CREATOR — CC-1, THIS IS YOURS
Claude Lead. Build order. No data touched.

## THE OWNER'S WORDS, VERBATIM

> "BUT I WILL DECIDE IF A NEW PURGE AND DELETION IS NECESSARY LATER TONIGHT. IN THE SETTLEMENT
> CREATOR MAKE SURE IT IS COMPLETELY AND FULLY LINKED AND CONNECTED TO EVERY POSSIBLE TABLE AS I
> INSTRUCTED. THE MONEY NUMBERS ARE NOT QUICKBOOKS STYLE. IT IS NOT GIVING SUBTOTALS. ESCROW SHOULD
> BE BY DEFAULT 25 IN THE TRANSACTION LINE, IF THERE IS NO DEDUCTION THEN CLICK X TO REMOVE. THE PDF
> BUTTON SHOULD BE THERE, IT SHOULD PRINT THE COMPANY AND DRIVER SETTLEMENTS IN THE PDFS YOU DESIGNED
> AND CREATED. BUT ALL TOTALS SHOULD BE SHOWN IN THE CREATOR AT THE BOTTOM SO I CAN VERIFY TOTALS
> WITH THE ALWAYSTRACK SETTLEMENT AND POST."

Note on the first line: **the purge decision is the owner's and he makes it later tonight.** Nobody
purges, nobody deletes, nobody prepares a run that could be applied. Build.

## THE FIVE REQUIREMENTS

### 1. SUBTOTALS — QUICKBOOKS STYLE. THIS IS THE HEADLINE DEFECT.
The creator shows money without subtotals. QuickBooks never does that. Every group of lines carries
its own subtotal, and the groups roll up to the net. Build the roll-up as a real computed chain, not
a label:

```
Loaded pay                     subtotal
Empty / deadhead pay           subtotal
  Gross pay                    SUBTOTAL
Additions / reimbursements     subtotal
Deductions                     subtotal   (negative, shown as negative, never as a positive to subtract)
Escrow                         subtotal
Advances applied               subtotal
  NET PAY                      TOTAL
```

Every subtotal equals the sum of the lines above it, to the cent, computed from the lines — never a
stored field re-displayed. `tabular-nums` on every figure, right-aligned, per the design law.

### 2. ESCROW DEFAULTS TO 25 IN THE TRANSACTION LINE
The escrow line is present by default at **25**. If there is no deduction, the owner clicks **X** to
remove it. So: the line is created by default, it is editable, and it is removable with one X — not
hidden behind a menu, not a checkbox, not a zero that has to be typed over. When removed, the escrow
subtotal and the net recompute immediately.

### 3. ALL TOTALS AT THE BOTTOM OF THE CREATOR
A totals block fixed at the bottom of the creator, visible while he works, so he can read it against
the AlwaysTrack settlement **before** he posts. It shows every total in the chain above, plus the
company side. This is a verification surface — its whole purpose is that he compares it to another
document and then presses post. If a figure cannot be computed, it says so by name; it never shows 0.

### 4. PDF BUTTON — THE DESIGNS ARE NOW IN THE REPO
The PDF button prints **both** documents: the **company** settlement and the **driver** settlement.

The designs are the owner's own, already rendered, now committed:
**`docs/design/boards/settlements/SettlementDocumentDesigns.html`**

That file is the specification. It carries the driver and company layouts on USMCA letterhead,
portrait and landscape, per-load driver bills, the advance reference formats, the repairs section,
the per-load margin roll-up, and the three margin treatments — fuel as purchased, fuel as consumed,
and margin after downtime. Read it and build the PDF identical to it. Do not design a settlement PDF;
one exists.

### 5. COMPLETE LINKAGE — EVERY POSSIBLE TABLE, BOTH DIRECTIONS
The owner's standing law, applied to the creator. Every settlement and every line links, and resolves
back, across: the load and its stops · the driver · the unit and the trailer · the customer · the
driver bill (per load, numbered as the load) · the A/P bill and its bill payments · the cash advance ·
escrow · deductions and recoveries · reimbursements · fuel · expenses · the invoice · the journal
entries · the bank line that paid it · `docs.files` for every attached document · the tour.

A link that resolves one way and not the other is half a link and counts as unlinked. The settlement
opens from the driver, the load, the unit, the customer and the bill — or it is not linked. Declare
all of it in the PR body, both directions.

## HOW IT IS BUILT

Engine first, then the surface. The creator computes nothing in the component that the engine cannot
compute on the server — the totals the owner verifies must be the same numbers the post writes, from
the same code path. Two code paths computing the same total is the competing-engine defect the
standing order is about; do not create one here.

Screen to `docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md` and
`docs/design/ih35-design-tokens.css`: 34px controls, 40px edited fields, 132px date boxes, 120px money
boxes right-aligned, lines for rows never columns, missing renders as an em dash.

**One named guard:** the creator's displayed totals equal the engine's computed totals equal what the
post writes, to the cent; the escrow line exists by default at 25 and is removable; both PDFs render
from the committed design; and every linkage above resolves in both directions.

Report: files and call sites, the guard name, and the deploy id live on **both** services. No row
counts, no balances.

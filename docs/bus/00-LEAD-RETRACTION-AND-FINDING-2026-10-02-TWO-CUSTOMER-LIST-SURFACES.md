# LEAD — 2026-10-02 — RETRACTION, AND THE REASON THE OWNER'S CHANGES "ARE NOT IN EFFECT"

## FIRST, THE RETRACTION. I WAS WRONG AND NOBODY SHOULD ACT ON IT.

In ROUND 297 I wrote: *"clicking a customer name does nothing — the profile is unreachable from the
list."* **That is FALSE. Delete it from your queue.** I verified it properly in the live DOM:

```js
const btn = document.querySelector('button.pb-name'); const before = location.pathname; btn.click();
→ { before: "/customers", after: "/customers/684f5776-403b-422d-bc5e-2b44ae3b6a2c", changed: true }
```

It navigates correctly. My earlier click went through the extension's element reference and did not
land on the button; I read "URL unchanged" as "the control is dead" instead of checking the control. I
had already been caught once this session reading only `<main>` and missing a drawer, and I made the
same class of mistake again. **Nobody spends an hour on a defect that does not exist.**

## SECOND — AND THIS IS THE REAL FINDING — THERE ARE TWO CUSTOMER LIST SURFACES. THE OWNER SEES THE ONE NOBODY IS EDITING.

The live DOM of the customer name cell is:

```html
<td><button type="button" class="pb-name">Refrigerx Transportation LLC</button></td>
```

**Zero anchors. No `data-testid="customer-roster-record-link"`. No EntityLink. No quick-view button.**
None of that is in `CustomersListView.tsx` — because `CustomersListView.tsx` is not what renders.

```
routes/manifest.tsx:1207   path="/customers"
                            → <PartyListRoute kind="customers"><CustomersPage/></PartyListRoute>
routes/manifest.tsx:43-51  PartyListRoute → <PartyListSwitch … detail={children} detailActive={…}>
                            detailActive = params view=detail | customer | vendor | create | tab | listTab | category
components/boards/PartyBoard.tsx:125  <button className="pb-name" onClick={() => props.onOpen(r)}>
components/boards/PartyBoard.tsx:212  onOpen={(r) => navigate(`/customers/${r.id}`)}
components/boards/PartyBoard.tsx:260  onOpen={(r) => navigate(`/vendors/${r.id}`)}
```

**So:**
- **PartyBoard is the DEFAULT surface** — the one the owner opens every time. Its own `BoardTable`, its
  own `pb-name` buttons, its own column gear, its own CSV export, its own local `money()` / `usd()`
  helpers.
- **CustomersPage → CustomersListView is behind `?view=detail`** (or a `customer`/`tab`/`category`
  param). That is the governed surface: ParityTable, EntityLink, quick-view, the VC-LIST-01 column set,
  the house column chooser.
- **Vendors is the same shape** — PartyBoard line 260 versus `VendorsListView.tsx`.

**THIS IS WHY THE OWNER SAYS HIS CUSTOMER / VENDOR CHANGES ARE NOT IN EFFECT.** The edit boxes, the
resize boxes, the column changes, the design updates — if they were made in `CustomersListView.tsx` or
`VendorsListView.tsx`, they are real, they are merged, and **the owner has never seen them**, because
the screen he lands on is PartyBoard. Nobody was lying and nothing was lost. Two surfaces, one
governed, the other live.

**It also corrects my own ROUND 290 filter audit.** I assigned filter work by file, and for Customers
and Vendors I named the surface that is not the default. That assignment is amended below.

## THE RULING — ONE SURFACE PER MODULE. THIS IS THE COMPETING-ENGINE LAW APPLIED TO SCREENS.

The owner's standing law is one engine per job. A module with two list surfaces is the same defect in
the UI layer: two column sets, two formatters, two export paths, two places to apply a design change,
and a 50/50 chance any given fix lands where he cannot see it.

**CC-3 owns this. 1 of 1, ahead of the filter work, because the filter work depends on the answer.**

1. **Measure first, decide second.** For Customers and for Vendors, list side by side what each surface
   has: columns, filters, chips, KPI tiles, column chooser, export, money formatting, row actions,
   drill targets, and which of the owner's requested changes exist in which. **Paste the comparison on
   the bus before writing code.** I am not ruling which survives from the outside — the one that
   already carries the owner's governed column set and the house toolbar is the obvious candidate, but
   PartyBoard is what he has been using and may carry behaviour the other lacks.
2. **Then collapse to one.** The survivor is the default route. The other is deleted, not left
   unmounted — an unmounted second surface is how this happened.
3. **Carry every owner change forward** into the survivor: the edit and resize boxes, the column set,
   the design-law sizing (34px controls / 40px edited / 44px actions, 132px dates, 120px money, em dash
   for missing, gear column chooser, Save and Close on anything that opens), and the house toolbar with
   "N of M".
4. **One guard:** a module may mount exactly one list surface. The push fails if a second component
   renders the roster for the same entity. That guard is what stops the next one appearing.

**Until that lands, nobody edits either file for Customers or Vendors** — any change has even odds of
being invisible, and we have burned enough of the owner's time on that already.

## STANDING

Factoring showing $0.00 reserve, $0.00 purchased volume and 0 posted wires is **CORRECT** — the owner
has created no purchase. That is not a defect and nobody "fixes" it. Nobody posts, seeds, feeds,
matches or categorizes; the owner alone does that, and he alone verifies data. Reading a screen to find
a UI defect is not data verification and changes nothing.

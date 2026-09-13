#!/usr/bin/env python3
"""Full Faro reconciliation: match every USMCA factoring advance to Faro's canonical export.

Produces, per advance:
  - the matched Faro purchase row (date = true purchase date, purchase = what Faro actually bought)
  - the AMOUNT GAP  (our invoice face - Faro purchase)  -> an invoice dispute when non-zero
  - the DATE        (advanced_at should be the Faro purchase date) -> the day-by-day rebuild

Sources (Faro is truth for date + purchase amount; our invoice face stays the billed amount):
  /tmp/advances.csv                              (our 63 advances)
  docs/reconcile/faro_canonical_purchases.csv    (Faro's own exports, canonicalized)
"""
import csv, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FARO = ROOT / "docs/reconcile/faro_canonical_purchases.csv"
ADV = Path("/tmp/advances.csv")


def norm_ref(s: str) -> str:
    if not s:
        return ""
    s = s.strip().upper()
    s = re.sub(r"[^0-9A-Z]", "", s)      # drop #, -, spaces
    s = s.lstrip("0")                     # 0488 == 488
    return s


def norm_debtor(s: str) -> set:
    if not s:
        return set()
    s = s.upper()
    s = re.sub(r"[^0-9A-Z ]", " ", s)
    stop = {"LLC", "INC", "CO", "CORP", "LTD", "LIMITED", "THE", "DBA", "SERVICES",
            "LOGISTICS", "TRANSPORT", "TRANSPORTATION", "FREIGHT", "GROUP", "COMPANY"}
    return {t for t in s.split() if t and t not in stop}


def deb_concat(s: str) -> str:
    """Whole-name alnum key, spaces dropped, so 'J RAYL TRANSPORT' == 'JRAYL TRANSPORT'."""
    return re.sub(r"[^0-9A-Z]", "", (s or "").upper())


def cents(x) -> int:
    return round(float(x) * 100)


# USMCA SCOPE ONLY: TRANSPORTATION is a frozen entity (00-IH35-LAW) — never read/report it.
# The Faro export filename in `src` separates the entities: FARO-IH-35-Transportation-export-*.csv
# is Transportation; export (NN).csv are the USMCA-era Faro purchases. Load-number collisions across
# entities (a Transportation load 13508 for VALUE LOGISTICS vs our USMCA 13508 for NCC) are exactly
# why we must scope by src, not by a bare inv==load match.
faro_all = list(csv.DictReader(FARO.open()))
faro = [r for r in faro_all if not str(r.get("src", "")).startswith("FARO-IH-35-Transportation")]
for r in faro:
    r["_po"] = norm_ref(r.get("po", ""))
    r["_inv"] = norm_ref(r.get("inv", ""))
    r["_deb"] = norm_debtor(r.get("debtor", ""))
    r["_debc"] = deb_concat(r.get("debtor", ""))
    r["_purch_c"] = cents(r["purchase"]) if r.get("purchase") else 0
print(f"faro rows: {len(faro_all)} total -> {len(faro)} USMCA-scoped (dropped {len(faro_all)-len(faro)} Transportation)")

adv = list(csv.DictReader(ADV.open()))

# 1:1 ASSIGNMENT (owner "identical day-by-day"). The earlier per-advance greedy let several
# same-debtor/same-amount advances (e.g. 6 Semares $4,900 loads) all grab the SAME Faro row/date,
# so a day double-counted while the other real Faro dates went empty. That is not identical.
# Fix: build every candidate edge, sort by strength (exact PO/inv ref first, then debtor+amount),
# and assign greedily so each Faro row is consumed AT MOST ONCE. Exact-ref matches lock their
# specific row first; the remaining same-debtor/same-amount advances then fill the OTHER Faro rows
# of that group, spreading them across their true distinct dates. Because every advance lands on a
# distinct Faro row, the multiset of assigned (date, purchase) equals Faro's own -> daily totals
# are identical by construction.
edges = []  # (score, tiebreak_date, a_idx, r_idx, why)
for ai, a in enumerate(adv):
    wo = norm_ref(a.get("wo", ""))
    face = int(a["face_cents"])
    deb = norm_debtor(a.get("customer_name", ""))
    debc = deb_concat(a.get("customer_name", ""))
    our_inv = norm_ref(a.get("inv", ""))
    for ri, r in enumerate(faro):
        score = 0
        why = []
        po_hit = bool(wo and r["_po"] and wo == r["_po"])
        inv_hit = bool(our_inv and r["_inv"] and our_inv == r["_inv"]
                       and not re.fullmatch(r"13\d{3}", our_inv))
        # token overlap OR whole-name containment (fixes 'J RAYL' vs 'JRAYL' tokenization miss)
        deb_hit = bool((deb and r["_deb"] and (deb & r["_deb"]))
                       or (len(debc) >= 4 and r["_debc"] and (debc in r["_debc"] or r["_debc"] in debc)))
        amt_hit = (r["_purch_c"] == face)
        if po_hit:
            score += 5; why.append("po=wo")
        if inv_hit:
            score += 5; why.append("inv=faroinv")
        if deb_hit:
            score += 2; why.append("debtor")
        if amt_hit:
            score += 1; why.append("amt")
        if po_hit or inv_hit or (deb_hit and amt_hit):
            edges.append((score, r.get("date", ""), ai, ri, why))

# Strongest edges first; deterministic date tiebreak keeps assignment stable.
edges.sort(key=lambda e: (-e[0], e[1]))
adv_match = {}   # a_idx -> (r_idx, score, why)
faro_used = set()
for score, _d, ai, ri, why in edges:
    if ai in adv_match or ri in faro_used:
        continue
    adv_match[ai] = (ri, score, why)
    faro_used.add(ri)

rows = []
unmatched = []
for ai, a in enumerate(adv):
    face = int(a["face_cents"])
    if ai not in adv_match:
        unmatched.append(a)
        rows.append({**a, "matched": False})
        continue
    ri, score, why = adv_match[ai]
    r = faro[ri]
    gap = face - r["_purch_c"]
    rows.append({
        "fa": a["fa"], "advance_id": a["advance_id"], "invoice_id": a["invoice_id"],
        "load": a["load_number"], "wo": a["wo"], "customer": a["customer_name"],
        "status": a["status"], "advanced_at": a["advanced_at"],
        "face_cents": face,
        "faro_inv": r["inv"], "faro_date": r["date"], "faro_debtor": r["debtor"],
        "faro_purchase_cents": r["_purch_c"],
        "gap_cents": gap,
        "match_why": "+".join(why), "match_score": score,
        "matched": True,
    })

matched = [r for r in rows if r.get("matched")]
gaps = [r for r in matched if r["gap_cents"] != 0]

print(f"advances: {len(adv)}  matched: {len(matched)}  unmatched: {len(unmatched)}")
print(f"amount gaps (invoice != Faro purchase): {len(gaps)}")
print("\n=== AMOUNT GAPS -> invoice disputes ===")
for r in sorted(gaps, key=lambda x: -abs(x["gap_cents"])):
    print(f"  load {r['load'] or r['fa']:8} {r['customer'][:28]:28} face ${r['face_cents']/100:>9,.2f}  "
          f"faro ${r['faro_purchase_cents']/100:>9,.2f}  gap ${r['gap_cents']/100:>9,.2f}  "
          f"[faro inv {r['faro_inv']} {r['faro_date']} via {r['match_why']}]")

print("\n=== UNMATCHED ===")
for a in unmatched:
    print(f"  {a['fa']}  load {a['load_number'] or '(manual '+a['inv']+')':10}  wo {a['wo']:14}  "
          f"${int(a['face_cents'])/100:>9,.2f}  {a['customer_name'][:34]}")

# daily totals from Faro purchase amounts on their true dates
daily = {}
for r in matched:
    daily.setdefault(r["faro_date"], {"n": 0, "purchase_c": 0})
    daily[r["faro_date"]]["n"] += 1
    daily[r["faro_date"]]["purchase_c"] += r["faro_purchase_cents"]
print("\n=== FARO DAILY (matched purchases by true date) ===")
for d in sorted(daily):
    print(f"  {d}  {daily[d]['n']:2} purchases  ${daily[d]['purchase_c']/100:>12,.2f}")

out = Path("/tmp/faro_reconcile_full.json")
out.write_text(json.dumps({"rows": rows, "unmatched": [a['fa'] for a in unmatched]}, indent=2))
print(f"\nwrote {out}")

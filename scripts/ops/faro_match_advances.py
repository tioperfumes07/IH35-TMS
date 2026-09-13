#!/usr/bin/env python3
"""Match the 63 real USMCA factoring advances to their canonical Faro purchase (by load_number == Faro inv),
so each advance can be re-dated to its true Faro purchase date. Analysis only — writes advance->date plan."""
import json, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_raw = json.load(open(os.path.join(ROOT, "docs/reconcile/faro_canonical_purchases.json")))
faro = _raw if isinstance(_raw, list) else (_raw.get("purchases") or _raw.get("rows") or next(v for v in _raw.values() if isinstance(v, list)))
by_inv = {}
for r in faro:
    by_inv.setdefault(str(r["inv"]).strip(), []).append(r)

# amount(cents) -> faro rows, for the load-less manual invoices
by_amt = {}
for r in faro:
    by_amt.setdefault(int(round(r["purchase"] * 100)), []).append(r)

def norm_po(x):
    if not x: return ""
    x = str(x).strip().lstrip("#").upper()
    return x

by_po = {}
for r in faro:
    by_po.setdefault(norm_po(r.get("po")), []).append(r)

# (advance_id, load_number|None, invoice_total_cents, status, cur_date)
ADV = [
    ("FAC-2026-00060","13583",685000,"submitted",None),("FAC-2026-00046","13570",611500,"advanced","09/07"),
    ("FAC-2026-00061","13588",570000,"submitted",None),("FAC-2026-00055","13580",490000,"submitted",None),
    ("FAC-2026-00018","13550",490000,"advanced","09/06"),("FAC-2026-00058","13581",490000,"submitted",None),
    ("FAC-2026-00047","13571",490000,"advanced","09/07"),("FAC-2026-00040","13535",490000,"advanced","09/07"),
    ("FAC-2026-00006","13519",490000,"advanced","09/06"),("FAC-2026-00059","13582",490000,"submitted",None),
    ("FAC-2026-00015","13547",480000,"advanced","09/06"),("FAC-2026-00013","13545",480000,"advanced","09/06"),
    ("FAC-2026-00054","13578",465000,"submitted",None),("FAC-2026-00052","13574",440000,"submitted",None),
    ("FAC-2026-00028","13560",440000,"advanced","09/07"),("FAC-2026-00063","13589",412000,"submitted",None),
    ("FAC-2026-00031","13565",400000,"advanced","09/07"),("FAC-2026-00005","13518",400000,"advanced","09/06"),
    ("FAC-2026-00012","13542",400000,"advanced","09/06"),("FAC-2026-00041","13536",400000,"advanced","09/07"),
    ("FAC-2026-00034","13568",400000,"advanced","09/07"),("FAC-2026-00025","13557",390000,"advanced","09/07"),
    ("FAC-2026-00009","13529",390000,"advanced","09/06"),("FAC-2026-00027","13559",380000,"advanced","09/07"),
    ("FAC-2026-00051",None,380000,"advanced","09/07"),("FAC-2026-00057","13576",370000,"submitted",None),
    ("FAC-2026-00062","13586",360000,"submitted",None),("FAC-2026-00008","13523",360000,"advanced","09/06"),
    ("FAC-2026-00002","13511",360000,"advanced","09/06"),("FAC-2026-00056","13577",350000,"submitted",None),
    ("FAC-2026-00026","13558",350000,"advanced","09/07"),("FAC-2026-00007","13521",350000,"advanced","09/06"),
    ("FAC-2026-00021","13526",350000,"advanced","09/07"),("FAC-2026-00019","13554",350000,"advanced","09/06"),
    ("FAC-2026-00029","13561",345000,"advanced","09/07"),("FAC-2026-00049","13537",330000,"advanced","09/07"),
    ("FAC-2026-00038","13528",310000,"advanced","09/07"),("FAC-2026-00010","13534",310000,"advanced","09/06"),
    ("FAC-2026-00045","13569",300000,"advanced","09/07"),("FAC-2026-00024","13552",300000,"advanced","09/07"),
    ("FAC-2026-00001","13510",300000,"advanced","09/06"),("FAC-2026-00023","13551",300000,"advanced","09/07"),
    ("FAC-2026-00044","13564",300000,"advanced","09/07"),("FAC-2026-00003","13514",270000,"advanced","09/06"),
    ("FAC-2026-00037","13520",260000,"advanced","09/07"),("FAC-2026-00042","13543",250000,"advanced","09/07"),
    ("FAC-2026-00020","13508",250000,"advanced","09/07"),("FAC-2026-00016","13548",230000,"advanced","09/06"),
    ("FAC-2026-00048","13573",230000,"advanced","09/07"),("FAC-2026-00053","13575",220000,"submitted",None),
    ("FAC-2026-00033","13567",210000,"advanced","09/07"),("FAC-2026-00035","13512",170000,"advanced","09/07"),
    ("FAC-2026-00032","13566",110000,"advanced","09/07"),("FAC-2026-00014","13546",110000,"advanced","09/06"),
    ("FAC-2026-00017","13549",100000,"advanced","09/06"),("FAC-2026-00039","13532",100000,"advanced","09/07"),
    ("FAC-2026-00030","13562",100000,"advanced","09/07"),("FAC-2026-00011","13538",80000,"advanced","09/06"),
    ("FAC-2026-00004","13516",70000,"advanced","09/06"),("FAC-2026-00043","13563",60000,"advanced","09/07"),
    ("FAC-2026-00022","13544",60000,"advanced","09/07"),("FAC-2026-00036","13513",52500,"advanced","09/07"),
    ("FAC-2026-00050",None,35000,"advanced","09/07"),
]

# advance_id -> customer_wo_number (from live DB)
WO = {
 "FAC-2026-00060":"66304","FAC-2026-00046":"2501086","FAC-2026-00061":"1013343-2","FAC-2026-00055":"SEM66511",
 "FAC-2026-00018":"SMX14603","FAC-2026-00058":"42-1269653","FAC-2026-00047":"SMX14611","FAC-2026-00059":"56713",
 "FAC-2026-00015":"20348480","FAC-2026-00013":"20348212","FAC-2026-00054":"1013272-2","FAC-2026-00052":"1709094",
 "FAC-2026-00028":"131060693","FAC-2026-00031":"488","FAC-2026-00012":"196203","FAC-2026-00034":"0061461",
 "FAC-2026-00025":"L-43416","FAC-2026-00027":"131252703","FAC-2026-00057":"1013406","FAC-2026-00062":"16430047",
 "FAC-2026-00056":"4619442-1","FAC-2026-00026":"0061471","FAC-2026-00019":"0003965","FAC-2026-00029":"1013241",
 "FAC-2026-00049":"119922","FAC-2026-00045":"4631936-1","FAC-2026-00024":"38642","FAC-2026-00023":"#4613473-1",
 "FAC-2026-00044":"4631956-1","FAC-2026-00042":"LD88719","FAC-2026-00016":"1000052","FAC-2026-00048":"4636360-1",
 "FAC-2026-00053":"ES-6883","FAC-2026-00033":"0061417","FAC-2026-00035":"2239480","FAC-2026-00032":"804689",
 "FAC-2026-00014":"20348564","FAC-2026-00017":"0314828","FAC-2026-00030":"18258","FAC-2026-00011":"21148",
 "FAC-2026-00043":"66174","FAC-2026-00036":"005772267",
}

def pick(rows, cents):
    exact = [r for r in rows if int(round(r["purchase"]*100))==cents]
    return exact[0] if exact else (rows[0] if rows else None)

# XLSX "5 FARO · USMCA" — authoritative August reconciliation: load# -> {issue date, face}
xlsx = json.load(open("/tmp/xlsx_faro_usmca.json"))

plan, unmatched, mism = [], [], []
for adv_id, load, cents, status, cur in ADV:
    faro_date = faro_cents = faro_inv = faro_po = how = None
    # 1) XLSX by load# (authoritative August curated reconciliation)
    if load and load in xlsx and xlsx[load].get("issue"):
        x = xlsx[load]
        faro_date = x["issue"]; faro_cents = int(round(float(x["face"])*100)); faro_inv = x["faro_inv"]; how = "xlsx"
    # 2) canonical CSV by PO == customer_wo_number (Sept), amount tiebreaker
    if faro_date is None:
        wo = norm_po(WO.get(adv_id))
        if wo and wo in by_po:
            c = pick(by_po[wo], cents)
            if c: faro_date=c["date"]; faro_cents=int(round(c["purchase"]*100)); faro_inv=c["inv"]; faro_po=c.get("po"); how="po"
    # 3) canonical by load == Faro inv
    if faro_date is None and load and load in by_inv:
        c = pick(by_inv[load], cents)
        if c: faro_date=c["date"]; faro_cents=int(round(c["purchase"]*100)); faro_inv=c["inv"]; how="inv"
    if faro_date is None:
        unmatched.append((adv_id, load, norm_po(WO.get(adv_id)), cents/100, status))
        continue
    if faro_cents != cents:
        mism.append((adv_id, load, cents/100, faro_cents/100, faro_date))
    plan.append({"advance": adv_id, "load": load, "faro_inv": faro_inv, "faro_po": faro_po,
                 "faro_date": faro_date, "our_cents": cents, "faro_cents": faro_cents,
                 "status": status, "cur_date": cur, "how": how})

# daily buckets (by faro date) of the matched plan
from collections import defaultdict
day = defaultdict(lambda: [0,0])
for p in plan:
    day[p["faro_date"]][0]+=1; day[p["faro_date"]][1]+=p["faro_cents"]

print(f"MATCHED {len(plan)} / 63  | UNMATCHED {len(unmatched)} | AMOUNT-MISMATCH {len(mism)}")
print("\n-- planned advance -> faro date (day-by-day) --")
for d in sorted(day):
    print(f"  {d}: {day[d][0]:2d} advances  ${day[d][1]/100:,.2f}")
if mism:
    print("\n-- AMOUNT MISMATCH (our invoice vs faro purchase) --")
    for m in mism: print("  ", m)
if unmatched:
    print("\n-- UNMATCHED --")
    for u in unmatched: print("  ", u)

json.dump(plan, open("/tmp/faro_redate_plan.json","w"), indent=2)
print(f"\nwrote /tmp/faro_redate_plan.json ({len(plan)} rows)")

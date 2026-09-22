#!/usr/bin/env python3
"""
IH35 SETTLEMENT PARSER — Claude Lead, 2026-09-22
Reads BOTH AlwaysTrack settlement document types and joins them on load number.
Company doc -> revenue side.  Driver doc -> operational + driver side.
Nothing is inferred. Every field is read off the page or left null.

CC-1 PORTABILITY FIX (2026-09-22, landing this file): the original hardcoded
`~/mnt/Downloads/IH35-MASTER-RECONCILIATION/03-SETTLEMENTS/text` (the Lead's own sandbox path).
Made overridable via ALWAYSTRACK_LEAD_PARSER_TXT_DIR / ALWAYSTRACK_LEAD_PARSER_OUT env vars, same
pattern as scripts/alwaystrack/parse_settlements.py, so this runs on any machine. No parsing logic
touched.
"""
import re, glob, os, json, collections

NUM = r'-?[\d,]+\.?\d*'
def f(s):
    if s is None: return None
    s = str(s).replace(',', '').replace('$', '').strip()
    if s in ('', '-'): return None
    try: return float(s)
    except: return None

# ---------------------------------------------------------------- DRIVER
STOP = re.compile(r'^\s*(Empty|Pickup|Deliver)\s+(?:([\d,]+\.?\d*)mi\.\s+)?(\d{4}-\d{2}-\d{2}),\s*(.+?)\s*$')
LOADHDR = re.compile(r'^\s*Load\s+(\d{4,6})\s+Truck\s+(\S+)\s*/\s*Trailer\s+(\S+)')
MILES = re.compile(r'^\s*(Loaded|Empty)\s+Miles\s+([\d,]+\.?\d*)\s*@\s*\$([\d.]+)\s+(' + NUM + r')')
TOTMI = re.compile(r'^\s*Total\s+(Loaded|Empty)?\s*Miles\s+([\d,]+\.?\d*)')
SALARY = re.compile(r'Salary:\s*(' + NUM + r')')
LOADLINE = re.compile(r'^\s*Load\s+(\d{4,6})\s{2,}(?:(\d{4}-\d{2}-\d{2})\s*-\s*)?(.+?)\s{2,}(' + NUM + r')\s*$')
SECT = re.compile(r'^\s*(Additional Pay|Deductions|Reimbursed Expenses|Escrow):\s*(' + NUM + r')')
TOTDUE = re.compile(r'TOTAL DUE:\s*(' + NUM + r')')
MPG = re.compile(r'M\.P\.G\.\s*-\s*([\d.]+)')
DRVHDR = re.compile(r'^\s*IH35 Transportation, LLC\s{2,}(.+?)\s*$')
DRVADDR = re.compile(r'Address:\s*(.+?)\s*$')
PERIOD = re.compile(r'(Start|End) Date:\s*(\d{4}-\d{2}-\d{2})')
DOCNO = re.compile(r'(Driver|Company) Settlement No\.\s*(\d+)')

def split_place(txt):
    """Parse 'Facility Name, City, ST 78045' from the RIGHT. Facility may contain commas."""
    m = re.search(r'^(.*?),?\s*([A-Za-z][A-Za-z\.\s]*?),\s*([A-Z]{2})\.?\s*(\d{5})?\s*$', txt.strip())
    if not m:
        return {"facility": None, "city": None, "state": None, "zip": None, "raw": txt.strip()}
    fac, city, st, zp = m.group(1), m.group(2), m.group(3), m.group(4)
    fac = (fac or '').strip().rstrip(',') or None
    return {"facility": fac, "city": city.strip(), "state": st, "zip": zp, "raw": txt.strip()}

def classify(desc):
    d = desc.lower()
    if 'cash advance' in d:               return 'cash_advance'
    if 'escrow' in d:                     return 'escrow_for_claims'
    if 'admin fee' in d:                  return 'admin_fee'
    if 'enlonada' in d or 'tarp' in d:    return 'tarp_pay'
    if 'extra delivery' in d or 'drop' in d: return 'extra_stop_pay'
    if 'reimburs' in d:                   return 'driver_reimbursement'
    if 'scale' in d:                      return 'scale'
    return 'other'

def parse_driver(path):
    doc = {"file": os.path.basename(path), "doc_no": None, "driver": None,
           "driver_address": None, "start": None, "end": None, "mpg": None,
           "total_due": None, "totals": {}, "loads": collections.OrderedDict()}
    cur = None
    for ln in open(path, errors="ignore"):
        s = ln.rstrip("\n")
        m = DOCNO.search(s)
        if m and m.group(1) == 'Driver': doc["doc_no"] = m.group(2)
        m = DRVHDR.match(s)
        if m and not doc["driver"] and 'Settlement' not in m.group(1): doc["driver"] = m.group(1).strip()
        m = DRVADDR.search(s)
        if m and not doc["driver_address"]: doc["driver_address"] = m.group(1).strip()
        m = PERIOD.search(s)
        if m: doc["start" if m.group(1) == 'Start' else "end"] = m.group(2)
        m = MPG.search(s)
        if m: doc["mpg"] = f(m.group(1))
        m = TOTDUE.search(s)
        if m: doc["total_due"] = f(m.group(1))
        m = SECT.match(s)
        if m: doc["totals"][m.group(1).lower().replace(' ', '_')] = f(m.group(2))

        m = LOADHDR.match(s)
        if m:
            cur = m.group(1)
            doc["loads"].setdefault(cur, {"load": cur, "truck": m.group(2), "trailer": m.group(3),
                                          "stops": [], "pay": [], "lines": []})
            continue
        m = STOP.match(s)
        if m and cur:
            p = split_place(m.group(4))
            doc["loads"][cur]["stops"].append({"seq": len(doc["loads"][cur]["stops"]) + 1,
                                               "type": m.group(1).lower(), "leg_miles": f(m.group(2)),
                                               "date": m.group(3), **p})
            continue
        m = MILES.match(s)
        if m and cur:
            doc["loads"][cur]["pay"].append({"kind": m.group(1).lower() + "_miles",
                                             "miles": f(m.group(2)), "rate": f(m.group(3)),
                                             "amount": f(m.group(4))})
            continue
        m = LOADLINE.match(s)
        if m:
            ld = m.group(1)
            doc["loads"].setdefault(ld, {"load": ld, "truck": None, "trailer": None,
                                         "stops": [], "pay": [], "lines": []})
            doc["loads"][ld]["lines"].append({"date": m.group(2), "description": m.group(3).strip(),
                                              "amount": f(m.group(4)), "category": classify(m.group(3))})
            continue
        m = TOTMI.match(s)
        if m:
            k = "total_%s_miles" % (m.group(1).lower() if m.group(1) else "all")
            doc["totals"][k] = f(m.group(2))
            sm = SALARY.search(s)
            if sm: doc["totals"]["salary"] = f(sm.group(1))
    return doc

# ---------------------------------------------------------------- COMPANY
CSTOP = re.compile(r'^\s*(Pickup|Deliver|Empty)\s+(\d{4}-\d{2}-\d{2}),\s*(.+?)\s{2,}Trk:\s*(\S+)\s*/\s*Trlr:\s*(\S+)\s*/\s*(.+?)\s*$')
CLOAD = re.compile(r'^\s*Load\s+(\d{4,6})\s*(?:/\s*(.+?))?\s*$')
LH = re.compile(r'^\s*Line Haul\s+Line Haul\s+([\d,]+\.?\d*)\s+([\d.]+)\s+([\d.]+%?)?\s+(' + NUM + r')\s*$')
FUEL = re.compile(r'^\s*(\d{4}-\d{2}-\d{2})\s+(\S+)\s{2,}(.+?)\s{2,}(\S+)\s+([\d,]+\.\d+)\s+([\d.]+)\s+(' + NUM + r')\s+(' + NUM + r')\s+(' + NUM + r')\s+(' + NUM + r')\s+(' + NUM + r')\s*$')
EXPR = re.compile(r'^\s*(\d{4}-\d{2}-\d{2})\s+(\S+)\s{2,}(.+?)\s{2,}(\S+)\s{2,}(.+?)\s{2,}(Y|Drv)?\s*(' + NUM + r')\s*$')
REV = re.compile(r'^\s*(Invoiced|Quick Pay|Driver Salary|Additional Driver Pay|Fuel|Company Expenses|Net Revenue)\s+(?:([\d.]+)%\s+([\d.]+) p/m\s+)?(' + NUM + r')\s*$')
PICKDROP = re.compile(r'^\s*(\d+)\s+(Picks|Drops)\s+\$(' + NUM + r') After (\d+)\s+(' + NUM + r')')

def parse_company(path):
    doc = {"file": os.path.basename(path), "doc_no": None, "start": None, "end": None,
           "revenue": {}, "loads": collections.OrderedDict()}
    sect, cur = None, None
    for ln in open(path, errors="ignore"):
        s = ln.rstrip("\n")
        m = DOCNO.search(s)
        if m and m.group(1) == 'Company': doc["doc_no"] = m.group(2)
        m = PERIOD.search(s)
        if m: doc["start" if m.group(1) == 'Start' else "end"] = m.group(2)
        for k in ("CUSTOMER CHARGES", "DRIVER PAYMENT", "FUEL PURCHASES", "EXPENSES", "REVENUE"):
            if s.strip() == k: sect = k
        m = REV.match(s)
        if m and sect == "REVENUE":
            doc["revenue"][m.group(1).lower().replace(' ', '_')] = {
                "pct": f(m.group(2)), "per_mile": f(m.group(3)), "amount": f(m.group(4))}
            continue
        m = CSTOP.match(s)
        if m:
            ld = None
            doc.setdefault("_stops", []).append({"type": m.group(1).lower(), "date": m.group(2),
                                                 **split_place(m.group(3)), "truck": m.group(4),
                                                 "trailer": m.group(5), "driver": m.group(6).strip()})
            continue
        m = CLOAD.match(s)
        if m:
            cur = m.group(1)
            e = doc["loads"].setdefault(cur, {"load": cur, "customer": None, "driver": None,
                                              "line_haul": None, "pay": [], "fuel": [], "expenses": []})
            if m.group(2):
                (e.__setitem__("driver", m.group(2).strip()) if sect in ("DRIVER PAYMENT", "FUEL PURCHASES", "EXPENSES")
                 else e.__setitem__("customer", m.group(2).strip()))
            continue
        m = LH.match(s)
        if m and cur:
            doc["loads"][cur]["line_haul"] = {"miles": f(m.group(1)), "rate": f(m.group(2)),
                                              "qp": m.group(3), "amount": f(m.group(4))}
            continue
        m = MILES.match(s)
        if m and cur:
            doc["loads"][cur]["pay"].append({"kind": m.group(1).lower() + "_miles", "miles": f(m.group(2)),
                                             "rate": f(m.group(3)), "amount": f(m.group(4))})
            continue
        m = PICKDROP.match(s)
        if m and cur:
            doc["loads"][cur]["pay"].append({"kind": m.group(2).lower(), "count": int(m.group(1)),
                                             "amount": f(m.group(5))})
            continue
        if sect == "FUEL PURCHASES" and cur:
            m = FUEL.match(s)
            if m:
                doc["loads"][cur]["fuel"].append({"date": m.group(1), "vendor": m.group(2),
                    "location": m.group(3).strip(), "invoice": m.group(4), "gallons": f(m.group(5)),
                    "cpg": f(m.group(6)), "receipt": f(m.group(7)), "fees": f(m.group(8)),
                    "disc": f(m.group(9)), "disc_pg": f(m.group(10)), "actual": f(m.group(11))})
                continue
        if sect == "EXPENSES" and cur:
            m = EXPR.match(s)
            if m:
                doc["loads"][cur]["expenses"].append({"date": m.group(1), "vendor": m.group(2),
                    "location": m.group(3).strip(), "invoice": m.group(4),
                    "description": m.group(5).strip(), "flag": m.group(6), "amount": f(m.group(7))})
                continue
    return doc

if __name__ == "__main__":
    here = os.path.expanduser(
        os.environ.get(
            "ALWAYSTRACK_LEAD_PARSER_TXT_DIR",
            "~/Downloads/IH35-MASTER-RECONCILIATION/03-SETTLEMENTS/text",
        )
    )
    out_path = os.environ.get("ALWAYSTRACK_LEAD_PARSER_OUT", "parsed.json")
    D = [parse_driver(p) for p in sorted(glob.glob(os.path.join(here, "Driver_Settlement_*.txt")))]
    C = [parse_company(p) for p in sorted(glob.glob(os.path.join(here, "Company_*.txt")))]
    json.dump({"driver": D, "company": C}, open(out_path, "w"), indent=1)
    dl = {l for d in D for l in d["loads"]}
    cl = {l for c in C for l in c["loads"]}
    stops = sum(len(v["stops"]) for d in D for v in d["loads"].values())
    fac   = sum(1 for d in D for v in d["loads"].values() for s in v["stops"] if s["facility"])
    legs  = sum(1 for d in D for v in d["loads"].values() for s in v["stops"] if s["leg_miles"] is not None)
    lines = collections.Counter(x["category"] for d in D for v in d["loads"].values() for x in v["lines"])
    amts  = collections.defaultdict(float)
    for d in D:
        for v in d["loads"].values():
            for x in v["lines"]: amts[x["category"]] += (x["amount"] or 0)
    fuel  = sum(len(v["fuel"]) for c in C for v in c["loads"].values())
    exp   = sum(len(v["expenses"]) for c in C for v in c["loads"].values())
    lh    = sum(1 for c in C for v in c["loads"].values() if v["line_haul"])
    print(f"DRIVER docs {len(D)}  loads {len(dl)}")
    print(f"COMPANY docs {len(C)}  loads {len(cl)}")
    print(f"UNION loads {len(dl|cl)}   BOTH {len(dl&cl)}   driver-only {sorted(dl-cl)}   company-only {sorted(cl-dl)}")
    print(f"STOPS {stops}  with facility name {fac}  with leg miles {legs}")
    print(f"LINE HAUL rows {lh}   FUEL rows {fuel}   COMPANY EXPENSE rows {exp}")
    print("DRIVER SETTLEMENT LINE CATEGORIES:")
    for k, n in lines.most_common(): print(f"   {k:<22} {n:>4} lines   {amts[k]:>12,.2f}")

#!/usr/bin/env python3
"""
IH35 SETTLEMENT PARSER — Claude Lead, 2026-09-22
Reads BOTH AlwaysTrack settlement document types and joins them on load number.
Company doc -> revenue side.  Driver doc -> operational + driver side.
Nothing is inferred. Every field is read off the page or left null.
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

# Mexican state abbreviations as AlwaysTrack prints them. A cross-border carrier's stops are
# half in Mexico; a US-only state pattern silently drops the facility name on every one of them.
MX_STATE = (r'Tam|N\.?L|Coah|Chih|Son|Pue|Ver|Jal|Gto|Qro|Mex|Mich|SLP|S\.?L\.?P|Ags|Zac|'
            r'Dgo|Sin|Nay|Col|Hgo|Tlax|Mor|Gro|Oax|Chis|Tab|Camp|Yuc|Q\.?Roo|BC|BCS|CDMX|DF')

def split_place(txt):
    """Parse 'Facility Name, City, ST 78045' from the RIGHT. Facility may contain commas
    ('Global Manufacturing, Inc'), so the state and zip anchor the parse, never the first comma.
    Handles US two-letter states AND Mexican abbreviations like 'Tam.' or 'N.L.'."""
    t = txt.strip()
    m = re.search(r'^(.*?),?\s*([A-Za-z][A-Za-z\.\s]*?),\s*([A-Z]{2})\.?\s*(\d{5})?\s*$', t)
    if not m:
        m = re.search(r'^(.*?),?\s*([A-Za-z][A-Za-z\.\s]*?),\s*(' + MX_STATE + r')\.?\s*(\d{4,5})?\s*$',
                      t, re.I)
    if not m:
        return {"facility": None, "city": None, "state": None, "zip": None, "raw": t}
    fac, city, st, zp = m.group(1), m.group(2), m.group(3), m.group(4)
    fac = (fac or '').strip().rstrip(',') or None
    return {"facility": fac, "city": city.strip(), "state": st.strip().rstrip('.'),
            "zip": zp, "raw": t}

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
    _lines = open(path, errors="ignore").read().splitlines()
    for _i, ln in enumerate(_lines):
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
            place = m.group(4)
            p = split_place(place)
            # A long facility+city+state+zip WRAPS onto the next line in the PDF text. The
            # first line then ends mid-address ("..., Laredo,") and parses to nothing. Join
            # the continuation — an indented fragment that is not itself a stop, a pay line
            # or a new load — and re-parse. Without this the consignee of record is lost.
            if p["facility"] is None and _i + 1 < len(_lines):
                nxt = _lines[_i + 1]
                if (nxt.strip() and nxt.startswith(" ")
                        and not STOP.match(nxt) and not LOADHDR.match(nxt)
                        and not MILES.match(nxt) and len(nxt.strip()) <= 40):
                    joined = place.rstrip().rstrip(",") + ", " + nxt.strip()
                    p2 = split_place(joined)
                    if p2["facility"] is not None:
                        p = p2
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

EXP_DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
EXP_AMT  = re.compile(r'^-?[\d,]+\.\d\d$')
EXP_INVOICE_LIKE = re.compile(r'^[0-9][0-9A-Za-z\-]*$')

def parse_expense_row(line):
    """Structural parser for a company-settlement EXPENSES row.

    2026-09-23, Round 102.6. The old EXPR regex assumed one fixed column layout and ONE trailing
    flag. It lost the description on every row that (a) carried BOTH flags - 'Drv' reimbursed AND
    'Y' company-expense, 47 rows - because the description group swallowed the 'Drv'; (b) had no
    invoice number; (c) had a vendor containing a single space (FUEL AMERICA, INDIANA TOLL ROAD,
    CONTINENTAL FORWARDING); or (d) sat on page 2, which AllWaysTrack prints at a different
    column width. That is the whole of the feed_input_gaps.json "lost in parsing" set.

    Columns are separated by runs of 2+ spaces. Read from the right: amount last, then the flags.
    THE DESCRIPTION IS ALWAYS THE LAST FIELD BEFORE THE FLAGS - verified true on all 305 expense
    rows across the 58 company documents. Everything left of it is vendor / location / invoice.

    Returns None when the line is not an expense row. Never guesses: a field it cannot resolve
    comes back None and the caller reports it.
    """
    cols = [c.strip() for c in re.split(r'\s{2,}', line.strip()) if c.strip()]
    if len(cols) < 3 or not EXP_DATE.match(cols[0]) or not EXP_AMT.match(cols[-1]):
        return None
    flags = [c for c in cols[1:-1] if c in ('Y', 'Drv')]
    mid   = [c for c in cols[1:-1] if c not in ('Y', 'Drv')]
    if not mid:
        return None
    row = {"date": cols[0], "vendor": None, "location": None, "invoice": None,
           "description": mid[-1], "reimbursed": "Drv" in flags, "company_expense": "Y" in flags,
           "amount": f(cols[-1]), "unresolved": []}
    rest = mid[:-1]
    if len(rest) >= 3:
        row["vendor"], row["invoice"] = rest[0], rest[-1]
        row["location"] = " ".join(rest[1:-1])
    elif len(rest) == 2:
        row["vendor"] = rest[0]
        if EXP_INVOICE_LIKE.match(rest[1]):
            row["invoice"] = rest[1]
        else:
            row["location"] = rest[1]
    elif len(rest) == 1:
        row["vendor"] = rest[0]
    else:
        row["unresolved"].append("vendor")
    return row

FUEL_NUM = re.compile(r'^-?[\d,]*\.?\d+$')

def parse_fuel_row(line):
    """Structural parser for a company-settlement FUEL PURCHASES row.

    2026-09-23, Round 102.8. The old FUEL regex required an invoice token between location and
    gallons. Rows printed WITHOUT an invoice number failed outright and their fuel vanished:
    doc 5772 -590.00, doc 5788 -624.60, doc 5809 -190.00 = 1,404.60 of real diesel missing from
    the feed, measured against the documents' own Fuel control. Same defect class as EXPENSES.

    The seven trailing numeric columns are fixed and ordered:
        Gallons  CPG  Receipt  Fees  Disc.  Disc.PG  Actual
    Read them from the right; everything left is date, vendor, location and - only when a token
    is present - the invoice. Never guesses: returns None when the shape does not hold.
    """
    cols = [c.strip() for c in re.split(r'\s{2,}', line.strip()) if c.strip()]
    if len(cols) < 8:
        return None
    # AllWaysTrack separates the date from the vendor by a SINGLE space on page 1 and by a run
    # of spaces on page 2, so the first column is either the date or "date vendor".
    head0 = cols[0].split(None, 1)
    if not head0 or not EXP_DATE.match(head0[0]):
        return None
    cols = [head0[0]] + ([head0[1]] if len(head0) > 1 else []) + cols[1:]
    if len(cols) < 9:
        return None
    nums = cols[-7:]
    if not all(FUEL_NUM.match(c) for c in nums):
        return None
    head = cols[1:-7]
    if not head:
        return None
    row = {"date": cols[0], "vendor": head[0], "location": None, "invoice": None,
           "gallons": f(nums[0]), "cpg": f(nums[1]), "receipt": f(nums[2]), "fees": f(nums[3]),
           "disc": f(nums[4]), "disc_pg": f(nums[5]), "actual": f(nums[6])}
    rest = head[1:]
    if len(rest) >= 2:
        row["location"], row["invoice"] = " ".join(rest[:-1]), rest[-1]
    elif len(rest) == 1:
        row["location"] = rest[0]
    return row

def parse_company(path):
    doc = {"file": os.path.basename(path), "doc_no": None, "start": None, "end": None,
           "revenue": {}, "loads": collections.OrderedDict()}
    sect, cur = None, None
    exp_cur = None
    for ln in open(path, errors="ignore"):
        s = ln.rstrip("\n")
        m = DOCNO.search(s)
        if m and m.group(1) == 'Company': doc["doc_no"] = m.group(2)
        m = PERIOD.search(s)
        if m: doc["start" if m.group(1) == 'Start' else "end"] = m.group(2)
        for k in ("CUSTOMER CHARGES", "DRIVER PAYMENT", "FUEL PURCHASES", "EXPENSES", "REVENUE"):
            if s.strip() == k:
                sect = k
                # 2026-10-04 (CC-3, DEF-on-the-wrong-load): the EXPENSES block names its load only when
                # the document prints a "Load NNNN" header inside it. Until it does, a row belongs to NO
                # load yet - it is NOT the last load the FUEL section happened to print.
                if k == "EXPENSES": exp_cur = None
        m = CLOAD.match(s)
        if m and sect == "EXPENSES":
            exp_cur = m.group(1)
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
            row = parse_fuel_row(s)
            if row:
                doc["loads"][cur]["fuel"].append(row)
                continue
        if sect == "EXPENSES" and cur:
            row = parse_expense_row(s)
            if row:
                row["flag"] = "Drv" if row["reimbursed"] else ("Y" if row["company_expense"] else None)
                if exp_cur:
                    row["load_by"] = "header"
                    doc["loads"].setdefault(exp_cur, {"load": exp_cur, "customer": None, "driver": None,
                                                      "line_haul": None, "pay": [], "fuel": [], "expenses": []})
                    doc["loads"][exp_cur]["expenses"].append(row)
                else:
                    doc.setdefault("unheaded_expenses", []).append(row)
                continue
    return doc


def attribute_unheaded_expenses(cdoc, ddoc):
    """Give every EXPENSES row the document printed without a "Load NNNN" header its load - by PROOF, never by
    position. 2026-10-04 (CC-3): the parser used to drop the whole block on whichever load the FUEL section printed
    last, so on 5770 three DEF rows (receipts 99301244 / 99442334 / 99444239) all landed on 13509 and on 5794 the
    30.30 DEF (receipt 2885954) landed on 13568 - the signed documents tie them to 13503 / 13503 / 13509 / 13558.

    Proof, in order; the first that yields exactly ONE load wins:
      1. receipt  - the row's invoice equals an invoice on exactly one load's FUEL section (same ticket);
      2. driver   - the driver settlement carries the same amount on exactly one load (the reimbursement line);
      3. date     - the row's date falls inside exactly one load's own dated span (its fuel + stop dates);
         on a boundary day, a lumper / washout goes to the load DELIVERING that day and a scale ticket to the load
         PICKING UP that day (the stop event the charge belongs to); before every load's span -> the first load
         (deadhead into its pickup); after every span -> the last load; still shared -> the unfinished load with the
         EARLIEST first pickup (owner rule, loadAtTimeSql) — a same-pickup tie is refused;
      4. single   - the document has exactly one load.
    Anything else is REFUSED into the returned gaps list - never guessed. Returns (attributed, gaps).
    """
    loads = cdoc.get("loads", {})
    rows = cdoc.get("unheaded_expenses") or []
    attributed, gaps = 0, []

    def norm(x):
        return re.sub(r"\D", "", str(x or ""))

    fuel_inv = {}
    for ln, v in loads.items():
        for fr in v.get("fuel") or []:
            k = norm(fr.get("invoice"))
            if k: fuel_inv.setdefault(k, set()).add(ln)
    span = {}
    dloads = (ddoc or {}).get("loads", {})
    for ln, v in loads.items():
        ds = [fr.get("date") for fr in (v.get("fuel") or []) if fr.get("date")]
        ds += [st.get("date") for st in (dloads.get(ln, {}).get("stops") or []) if st.get("date")]
        ds = [d for d in ds if re.match(r"\d{4}-\d{2}-\d{2}$", str(d))]
        if ds: span[ln] = (min(ds), max(ds))

    for row in rows:
        target, how = None, None
        hit = fuel_inv.get(norm(row.get("invoice")), set()) if norm(row.get("invoice")) else set()
        if len(hit) == 1:
            target, how = next(iter(hit)), "receipt"
        if target is None and row.get("amount") is not None:
            amt = round(float(row["amount"]), 2)
            on = {ln for ln, v in dloads.items() if ln in loads
                  for x in (v.get("lines") or []) if x.get("amount") is not None and round(float(x["amount"]), 2) == amt}
            if len(on) == 1: target, how = next(iter(on)), "driver"
        if target is None and re.match(r"\d{4}-\d{2}-\d{2}$", str(row.get("date") or "")):
            inside = {ln for ln, (a, b) in span.items() if a <= row["date"] <= b}
            if len(inside) == 1: target, how = next(iter(inside)), "date"
            elif len(inside) > 1 or not inside:
                # Boundary day (one load delivers, the next picks up) or no span holds it: the STOP EVENT decides,
                # by what the charge is. A lumper is paid at the consignee while unloading and a reefer washout follows
                # the unload -> the load that DELIVERS that day. A scale ticket weighs the freight after loading -> the
                # load that PICKS UP that day. Any other charge is not decided by a stop and stays refused.
                desc = str(row.get("description") or "").upper()
                stop = "deliver" if ("LUMPER" in desc or "WASHOUT" in desc) else ("pickup" if "SCALE" in desc else None)
                if stop:
                    on = {ln for ln in loads
                          for st in (dloads.get(ln, {}).get("stops") or [])
                          if st.get("type") == stop and st.get("date") == row["date"]}
                    if len(on) == 1: target, how = next(iter(on)), f"stop:{stop}"
                if target is None and len(inside) > 1:
                    # TIEBREAK (owner rule 2026-10-01, the same one the database engines use — loadAtTimeSql in
                    # apps/backend/src/maintenance/driver-attribution.ts): a truck holds its next load while still running
                    # the current one, and "the load at time T" is the UNFINISHED load with the EARLIEST first pickup — the
                    # load already rolling owns everything until its delivery. A charge dated inside two loads' spans with
                    # nothing else proving it goes there. Two loads with the same first pickup is a true tie: refused.
                    first_pick = {}
                    for ln in inside:
                        picks = [st.get("date") for st in (dloads.get(ln, {}).get("stops") or [])
                                 if st.get("type") == "pickup" and re.match(r"\d{4}-\d{2}-\d{2}$", str(st.get("date") or ""))]
                        first_pick[ln] = min(picks) if picks else span[ln][0]
                    earliest = min(first_pick.values())
                    cand = [ln for ln, d in first_pick.items() if d == earliest]
                    if len(cand) == 1: target, how = cand[0], "earliest-pickup"
                if target is None and not inside and span:
                    # Outside every load's span on this document: before the first load starts it is the deadhead
                    # INTO that load (tolls / crossings on the way to the pickup); after the last load ends it is the
                    # tail of that load. Only when exactly one load starts first / ends last.
                    first = min(a for a, _ in span.values()); last = max(b for _, b in span.values())
                    if row["date"] < first:
                        cand = [ln for ln, (a, _) in span.items() if a == first]
                        if len(cand) == 1: target, how = cand[0], "deadhead:first"
                    elif row["date"] > last:
                        cand = [ln for ln, (_, b) in span.items() if b == last]
                        if len(cand) == 1: target, how = cand[0], "tail:last"
        if target is None and len(loads) == 1:
            target, how = next(iter(loads)), "single"
        if target is None:
            gaps.append({"doc": cdoc.get("doc_no"), "date": row.get("date"), "invoice": row.get("invoice"),
                         "description": row.get("description"), "amount": row.get("amount"),
                         "needs": "load attribution - no receipt, driver line, date span or single load proves it"})
            continue
        row["load_by"] = how
        loads[target].setdefault("expenses", []).append(row)
        attributed += 1
    cdoc["unheaded_expenses"] = []
    return attributed, gaps

def assert_no_duplicate_documents(docs, kind):
    """REFUSE a corpus that carries the same settlement number in two files.

    2026-09-23, Round 102: the 6,720.00 line-haul variance was NOT a feeder loss. The text
    corpus carried company settlement 5760 twice - Company_Settlement_5760.txt and
    Company_Settlement_5760 (Merged) page 1.txt - each with Total Line Haul 6,720.00
    (load 13481 3,920.00 + load 13489 2,800.00). Summing files instead of documents inflated
    the control to 436,415.00 against the feeder's correct 429,695.00.

    A duplicate export whose numbers DIFFER would silently overwrite instead of inflating,
    which is worse. Stop, never repair - the corpus is the source document.
    """
    seen = collections.defaultdict(list)
    for d in docs:
        seen[d.get("doc_no")].append(d.get("file"))
    dupes = {n: f for n, f in seen.items() if n is not None and len(f) > 1}
    missing = [d.get("file") for d in docs if not d.get("doc_no")]
    if missing:
        raise SystemExit(f"REFUSED: {kind} file(s) with no settlement number: {missing}")
    if dupes:
        lines = [f"REFUSED: {kind} corpus carries {len(dupes)} duplicated settlement number(s)."]
        for n, f in sorted(dupes.items()):
            lines.append(f"  settlement {n}: " + " | ".join(sorted(f)))
        lines.append("Remove the duplicate export from the corpus. Never dedupe in the parser -")
        lines.append("the two files may disagree, and the source document decides which is real.")
        raise SystemExit("\n".join(lines))
    return len(seen)

if __name__ == "__main__":
    # 2026-09-23 Round 102.6 — canonical corpus. Override with SETTLEMENT_TEXT_DIR.
    # The old default (IH35-MASTER-RECONCILIATION/03-SETTLEMENTS/text) carried the duplicate
    # export of company settlement 5760 that produced the 6,720.00 line-haul variance.
    default = "~/mnt/Downloads/IH35-RECONCILIATION-AND-FEED/03-SOURCE-DOCUMENTS/settlement-text"
    here = os.path.expanduser(os.environ.get("SETTLEMENT_TEXT_DIR", default))
    if not os.path.isdir(here):
        raise SystemExit(f"REFUSED: settlement text corpus not found at {here}")
    D = [parse_driver(p) for p in sorted(glob.glob(os.path.join(here, "Driver_Settlement_*.txt")))]
    C = [parse_company(p) for p in sorted(glob.glob(os.path.join(here, "Company_*.txt")))]
    nd = assert_no_duplicate_documents(D, "DRIVER")
    nc = assert_no_duplicate_documents(C, "COMPANY")
    print(f"CORPUS UNIQUE: {nd} driver document(s) in {len(D)} file(s), {nc} company document(s) in {len(C)} file(s)")
    json.dump({"driver": D, "company": C}, open("parsed.json", "w"), indent=1)
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

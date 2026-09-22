#!/usr/bin/env python3
"""
ROUND 53 (Lead, 2026-09-22) -- "CC-3: The expense extract from the settlement PDFs, per load, per
day -- diesel, DEF, driver pay, scales, lumpers. That is the feeder's second input and it does not
exist yet." + follow-up: "any other load expense."

INPUT: ~/Downloads/_st_txt/Company_Settlement_*.txt -- the OCR'd text of every real AlwaysTrack
company settlement document on disk. Counted directly, not assumed: 58 files, 57 unique settlement
numbers (5760 has a duplicate "(Merged) page 1" variant, same shape already documented by the
existing repo script scripts/ops/fuel-linkage-03-resolve-load-id-from-settlement-docs.ts -- excluded
here the same way), date range 2026-07-03 through 2026-09-21 -- covers and exceeds the "last 45
days" the ruling asks for (2026-08-08 forward). Driver_Settlement_*.txt files are NOT used here --
the company settlement documents already carry the per-load DRIVER PAYMENT section, FUEL PURCHASES
section, and EXPENSES section this extract needs; the driver-side documents duplicate the same pay
figures at the settlement level, not the load/day level.

METHOD: reuses the EXACT parsing logic already proven this session to build
data/alwaystrack/settlements-truth-2026-09-13.json (the ground truth cross-referenced in the
Round 43 fuel-dedupe work) -- same section-splitting, same money/number regexes -- extended to
also emit load header metadata (truck/trailer/driver/stops) and to categorize every EXPENSES line
into DEF / scales / lumpers / other by its own printed Description field (never guessed -- the
document's own vocabulary: "Fuel-DEF-Diesel Exhaust Fluid" -> def, "...Scale Expense" -> scales,
"Warehouse-Lumper Fee..." -> lumpers, everything else stays "other" with its real description kept
verbatim so nothing is silently bucketed).

OUTPUT (all written to scripts/ops/output/, gitignored -- regenerate, don't hand-edit):
  feeder-input-loads.csv    one row per load: settlement_doc, load_number, start_date, end_date,
                            entity, truck, trailer, driver_name, first_pickup_date,
                            last_deliver_date, stops_json (ordered pickup/deliver/empty legs)
  feeder-input-expenses.csv one row per (load, date, line item): settlement_doc, load_number,
                            date, category (diesel|def|driver_pay|scales|lumpers|other),
                            vendor, location, invoice, description, amount, raw_line
  feeder-input-expenses.json  the same expense rows as feeder-input-expenses.csv, grouped
                            {load_number: {settlement_doc, days: {date: {category: [rows]}}}} --
                            direct-consumption shape for createLoadWithFullSideEffects callers,
                            no CSV parsing required.

Every dollar amount comes from the document's own printed "Actual"/"Amount" column (net, after
discount) -- the same figure this session's fuel-dedupe work already established as the correct
value to trust (gross vs net was the exact defect class FUEL-DEDUPE-03 corrected).
"""
import os
import re
import csv
import glob
import json

HOME = os.path.expanduser("~")
TXT_DIR = os.path.join(HOME, "Downloads/_st_txt")
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ops", "output")
os.makedirs(OUT_DIR, exist_ok=True)


def money(s):
    s = s.replace(",", "").replace("$", "").strip()
    if s in ("", "-"):
        return None
    neg = s.startswith("(") and s.endswith(")")
    if neg:
        s = s[1:-1]
    try:
        v = float(s)
    except ValueError:
        return None
    return -v if neg else v


def num(s):
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


SEC = ["CUSTOMER CHARGES", "DRIVER PAYMENT", "FUEL PURCHASES", "EXPENSES", "REVENUE"]


def sections(lines):
    idx = [(i, l.strip()) for i, l in enumerate(lines) if l.strip() in SEC]
    out = {}
    for k, (i, s) in enumerate(idx):
        j = idx[k + 1][0] if k + 1 < len(idx) else len(lines)
        out.setdefault(s, []).extend(lines[i + 1 : j])
    return out


NUMTOK = re.compile(r"^-?[\d,]+\.\d+$")

# The document's OWN vocabulary, never guessed -- verified live against every distinct
# "Description" value across all 116 files before writing this (see the companion audit run).
DEF_RE = re.compile(r"\bDEF\b|Diesel Exhaust Fluid", re.I)
SCALE_RE = re.compile(r"\bScale\b", re.I)
LUMPER_RE = re.compile(r"\bLumper\b", re.I)


def categorize_expense(description):
    if DEF_RE.search(description):
        return "def"
    if SCALE_RE.search(description):
        return "scales"
    if LUMPER_RE.search(description):
        return "lumpers"
    return "other"


def parse_load_headers(raw):
    """Load NNNNN blocks at the top of the document: Pickup/Deliver/Empty stop lines with
    dates + Trk/Trlr/Driver. Returns {load_number: {...}} preserving stop order."""
    loads = {}
    order = []
    cur = None
    for ln in raw.split("\n"):
        s = ln.rstrip()
        m = re.match(r"^Load (\d+)\s*$", s)
        if m:
            cur = m.group(1)
            if cur not in loads:
                loads[cur] = {"stops": [], "truck": None, "trailer": None, "driver": None}
                order.append(cur)
            continue
        m = re.match(
            r"^\s*(Pickup|Deliver|Empty)\s+(\d{4}-\d{2}-\d{2}),\s*(.+?)\s{2,}Trk:\s*(\S+)\s*/\s*Trlr:\s*(\S+)\s*/\s*(.+?)\s*$",
            s,
        )
        if m and cur:
            leg_type, date, loc, trk, trlr, driver = m.groups()
            loads[cur]["stops"].append({"type": leg_type, "date": date, "location": loc.strip()})
            loads[cur]["truck"] = trk
            loads[cur]["trailer"] = trlr
            loads[cur]["driver"] = driver.strip()
            continue
        # A CUSTOMER CHARGES / other section heading ends the load-header block.
        if s.strip() in SEC:
            break
    return loads, order


def parse_company(path):
    raw = open(path, errors="replace").read()
    lines = raw.split("\n")
    doc = os.path.basename(path)

    m = re.search(r"Company Settlement No\.\s*(\d+)", raw)
    settlement_no = m.group(1) if m else None
    m = re.search(r"Start Date:\s*([\d-]+)", raw)
    start_date = m.group(1) if m else None
    m = re.search(r"End Date:\s*([\d-]+)", raw)
    end_date = m.group(1) if m else None
    m = re.search(r"^\s*(IH35 [A-Za-z]+, LLC|USMCA[^\n]*?)\s{2,}", raw, re.M)
    entity = m.group(1).strip() if m else None

    load_headers, load_order = parse_load_headers(raw)

    sec = sections(lines)

    # DRIVER PAYMENT -- per-load total (no per-line date in the source; attributed to the load's
    # own first Pickup date below, never fabricated).
    driver_pay_by_load = {}
    cl = None
    for t in sec.get("DRIVER PAYMENT", []):
        t = t.rstrip()
        if not t.strip():
            continue
        m = re.match(r"\s*Load (\d+)\s*/\s*(.+?)\s*$", t)
        if m:
            cl = m.group(1)
            continue
        if "Totals:" in t:
            continue
        p = re.split(r"\s{2,}", t.strip())
        if len(p) >= 2 and money(p[-1]) is not None and cl:
            driver_pay_by_load.setdefault(cl, []).append(
                {"item": p[0], "detail": p[1] if len(p) > 2 else "", "amount": money(p[-1]), "raw": t.strip()}
            )

    # FUEL PURCHASES -- diesel, dated, per load.
    fuel_rows = []
    cl = None
    for t in sec.get("FUEL PURCHASES", []):
        s = t.strip()
        if not s:
            continue
        m = re.match(r"Load (\d+)\s*/\s*(.+)$", s)
        if m:
            cl = m.group(1)
            continue
        if s.startswith("Totals:"):
            continue
        if not re.match(r"^\d{4}-\d{2}-\d{2}", s):
            continue
        p = re.split(r"\s{2,}", s)
        nums = []
        for seg in p:
            for tok in seg.split():
                if NUMTOK.match(tok):
                    nums.append(tok)
        if len(nums) < 7:
            continue
        g, c, r, f, dc, dpg, a = nums[-7:]
        head = p[0].split(None, 1)
        inv = None
        for seg in p[1:]:
            if re.match(r"^\d{4,}$", seg.strip()):
                inv = seg.strip()
        fuel_rows.append(
            {
                "load": cl,
                "date": head[0],
                "vendor": head[1] if len(head) > 1 else "",
                "location": p[1] if len(p) > 1 else "",
                "invoice": inv,
                "gallons": num(g),
                "amount": money(a),
                "raw": s,
            }
        )

    # EXPENSES -- DEF/scales/lumpers/other, dated. Load attribution: the EXPENSES table in this
    # document format does NOT repeat "Load NNNN /" headers the way FUEL PURCHASES/DRIVER PAYMENT
    # do -- confirmed by direct inspection of multiple files. Attribute each expense line to the
    # load whose stop-date range contains it (a load's first Pickup through its last Deliver/Empty
    # date, inclusive); if more than one load's range contains the date, or none does, leave
    # load blank and keep the raw line -- never guessed.
    def load_for_date(date_str):
        candidates = []
        for ld, info in load_headers.items():
            dates = [s["date"] for s in info["stops"]]
            if not dates:
                continue
            if min(dates) <= date_str <= max(dates):
                candidates.append(ld)
        return candidates[0] if len(candidates) == 1 else None

    expense_rows = []
    hdr = None
    for l in lines:
        if "Reimb." in l and "Amount" in l:
            hdr = l
            break
    pR = hdr.index("Reimb.") if hdr else None
    pC = hdr.index("Comp.") if hdr and "Comp." in hdr else None
    for t in sec.get("EXPENSES", []):
        s = t.strip()
        if not s:
            continue
        if s.startswith("Totals:"):
            continue
        if not re.match(r"^\d{4}-\d{2}-\d{2}", s):
            continue
        p = re.split(r"\s{2,}", s)
        amt = money(p[-1])
        if amt is None:
            continue
        # Trailing columns after Description are Reimb. (Y/N) then Comp. Exp. (free text -- the
        # ENTIRE corpus was grepped: the only value that ever appears is "Drv", 47 times, never
        # "Cmp" or anything else -- so both are excluded by exact literal match, never a fuzzy
        # guess, before picking the description off body[-2]. Missing this dropped the real
        # description ("Fuel-Reefer Diesel", "Parking Expense", etc.) in favor of "Drv" on every
        # row that carries a Comp. Exp. value -- caught via a ground-truth cross-check, not assumed.
        body = [x for x in p if not re.fullmatch(r"[YN]", x.strip()) and x.strip() != "Drv"]
        head = body[0].split(None, 1)
        date = head[0]
        description = body[-2] if len(body) >= 3 else (body[1] if len(body) > 1 else "")
        vendor = head[1] if len(head) > 1 else (body[1] if len(body) > 1 else "")
        category = categorize_expense(description)
        expense_rows.append(
            {
                "load": load_for_date(date),
                "date": date,
                "vendor": vendor,
                "description": description,
                "category": category,
                "amount": amt,
                "raw": s,
            }
        )

    return {
        "doc": doc,
        "settlement_no": settlement_no,
        "start_date": start_date,
        "end_date": end_date,
        "entity": entity,
        "load_headers": load_headers,
        "load_order": load_order,
        "driver_pay_by_load": driver_pay_by_load,
        "fuel_rows": fuel_rows,
        "expense_rows": expense_rows,
    }


def main():
    files = sorted(
        f
        for f in glob.glob(os.path.join(TXT_DIR, "Company_Settlement_*.txt"))
        if "(Merged)" not in f
    )
    print(f"parsing {len(files)} company settlement files from {TXT_DIR}")

    loads_out = []
    expenses_out = []
    seen_settlement_no = set()

    for path in files:
        d = parse_company(path)
        if d["settlement_no"] in seen_settlement_no:
            continue  # a re-issued/duplicate PDF of the same settlement number
        seen_settlement_no.add(d["settlement_no"])

        for ld in d["load_order"]:
            info = d["load_headers"][ld]
            dates = [s["date"] for s in info["stops"]]
            first_pickup = min((s["date"] for s in info["stops"] if s["type"] == "Pickup"), default=(dates[0] if dates else None))
            last_deliver = max((s["date"] for s in info["stops"] if s["type"] == "Deliver"), default=(dates[-1] if dates else None))
            loads_out.append(
                {
                    "settlement_doc": d["doc"],
                    "settlement_no": d["settlement_no"],
                    "load_number": ld,
                    "entity": d["entity"],
                    "settlement_start_date": d["start_date"],
                    "settlement_end_date": d["end_date"],
                    "truck": info["truck"],
                    "trailer": info["trailer"],
                    "driver_name": info["driver"],
                    "first_pickup_date": first_pickup,
                    "last_deliver_date": last_deliver,
                    "stops_json": json.dumps(info["stops"]),
                }
            )
            # driver pay -- attribute to the load's own first pickup date (booking date), never a
            # fabricated per-day split; the source document only carries a load-level total.
            for row in d["driver_pay_by_load"].get(ld, []):
                expenses_out.append(
                    {
                        "settlement_doc": d["doc"],
                        "load_number": ld,
                        "date": first_pickup,
                        "category": "driver_pay",
                        "vendor": "",
                        "location": "",
                        "invoice": "",
                        "description": row["item"] + (f" {row['detail']}" if row["detail"] else ""),
                        "amount": row["amount"],
                        "raw_line": row["raw"],
                    }
                )

        for row in d["fuel_rows"]:
            expenses_out.append(
                {
                    "settlement_doc": d["doc"],
                    "load_number": row["load"],
                    "date": row["date"],
                    "category": "diesel",
                    "vendor": row["vendor"],
                    "location": row["location"],
                    "invoice": row["invoice"] or "",
                    "description": "Diesel",
                    "amount": row["amount"],
                    "raw_line": row["raw"],
                }
            )

        for row in d["expense_rows"]:
            expenses_out.append(
                {
                    "settlement_doc": d["doc"],
                    "load_number": row["load"] or "",
                    "date": row["date"],
                    "category": row["category"],
                    "vendor": row["vendor"],
                    "location": "",
                    "invoice": "",
                    "description": row["description"],
                    "amount": row["amount"],
                    "raw_line": row["raw"],
                }
            )

    loads_path = os.path.join(OUT_DIR, "feeder-input-loads.csv")
    with open(loads_path, "w", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "settlement_doc", "settlement_no", "load_number", "entity",
                "settlement_start_date", "settlement_end_date", "truck", "trailer",
                "driver_name", "first_pickup_date", "last_deliver_date", "stops_json",
            ],
        )
        w.writeheader()
        w.writerows(loads_out)

    expenses_path = os.path.join(OUT_DIR, "feeder-input-expenses.csv")
    with open(expenses_path, "w", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "settlement_doc", "load_number", "date", "category", "vendor",
                "location", "invoice", "description", "amount", "raw_line",
            ],
        )
        w.writeheader()
        w.writerows(expenses_out)

    # JSON, grouped for direct feeder consumption -- {load_number: {settlement_doc, days: {date:
    # {category: [rows]}}}}. Rows with no resolved load_number (see load_for_date above) are kept
    # under the synthetic key "" rather than dropped, so nothing silently disappears.
    by_load = {}
    for r in expenses_out:
        ln = r["load_number"] or ""
        by_load.setdefault(ln, {"settlement_doc": r["settlement_doc"], "days": {}})
        day = by_load[ln]["days"].setdefault(r["date"] or "", {})
        day.setdefault(r["category"], []).append(
            {k: r[k] for k in ("vendor", "location", "invoice", "description", "amount", "raw_line")}
        )
    json_path = os.path.join(OUT_DIR, "feeder-input-expenses.json")
    with open(json_path, "w") as f:
        json.dump(by_load, f, indent=2)

    by_cat = {}
    for r in expenses_out:
        by_cat.setdefault(r["category"], [0, 0.0])
        by_cat[r["category"]][0] += 1
        by_cat[r["category"]][1] += r["amount"] or 0.0

    no_load = [r for r in expenses_out if not r["load_number"]]

    print(f"\nloads: {len(loads_out)} rows -> {loads_path}")
    print(f"expenses: {len(expenses_out)} rows -> {expenses_path}")
    print(f"expenses (grouped JSON): {len(by_load)} load key(s) -> {json_path}")
    print("\nby category:")
    for cat, (n, total) in sorted(by_cat.items()):
        print(f"  {cat:12s} {n:5d} rows  ${total:,.2f}")
    print(f"\nexpense lines with NO load attribution (date fell in 0 or >1 load's stop range, left blank not guessed): {len(no_load)}")


if __name__ == "__main__":
    main()

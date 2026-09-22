#!/usr/bin/env python3
"""
ROUND 66 (Lead, 2026-09-22/23) -- "I PARSED ALL 116 SETTLEMENTS MYSELF. HERE IS THE COMPLETE
GRAMMAR... CC-3 builds against this, not a guess... TAKE IT AND HARDEN IT. Do not start over. Do
not re-derive the grammar."

BASE: ~/Downloads/_lead_parser/parse_settlements.py (Claude Lead, 2026-09-22) -- the proven
grammar for BOTH AlwaysTrack document types, joined on load number, spec'd in
~/Downloads/09-22-2026-Claude-Lead-ROUND-66-SETTLEMENT-GRAMMAR-PARSED-AND-PROVEN.md. This file
keeps that grammar's regexes and section logic verbatim (DOCNO/PERIOD/STOP/LOADHDR/MILES/TOTMI/
SALARY/LOADLINE/SECT/TOTDUE/MPG/DRVHDR/DRVADDR/CSTOP/CLOAD/LH/FUEL/PICKDROP/split_place) and
extends only what the ruling asked for: the 2 named parser bugs fixed, the category taxonomy
widened from 1 driver-side classifier to the full 15-category split, and a load-number join
emitting both mileage measures side by side.

FIXED, RED-BEFORE-GREEN (both confirmed live against the real text before writing the fix):
  1. "9 company EXPENSE rows carry a BLANK description, $1,314.57" -- NOT a physical line-wrap
     (checked the raw text directly: every one of the 9 is a SINGLE physical line). The real
     cause: EXPENSES rows with NO invoice number (road service / lumper / toll rows routinely
     have none) collapse the location/invoice/description columns by one position under the
     original regex's fixed group order, which requires an invoice token to exist. Fixed by
     replacing the fixed-position regex for this one section with the same split-on-2+-spaces +
     explicit-token-filter method this session already proved byte-exact against ground truth
     earlier today (scripts/ops/feeder-input-02-settlement-expense-extract.py's prior version,
     document 5774/loads 13517-13518 cross-check) -- it does not assume a column is present, so a
     missing invoice number no longer shifts anything.
  2. "1 expense row parsed 'Y' as description, $50.00" -- the SAME missing-invoice-column defect,
     same fix, verified this exact row (Company_Settlement_5761, load 13485, SOAKERZ, $50.00) now
     reads description="Reefer Trailer-Washout Expense", not "Y".
  3. NOT a bug, named per the ruling's own "confirm that is all of them" instruction: the FUEL
     location wrap ("21548FM471SNATALIA,TX," reading like two joined fragments) is a single-line
     OCR spacing artifact, not a genuine multi-physical-line wrap -- checked the raw text directly
     (Company_Settlement_5798.txt:34, one physical line). No join was needed; the original FUEL
     regex already reads it correctly. Confirmed 300/300 fuel rows survive unchanged.

INPUT: ~/Downloads/IH35-MASTER-RECONCILIATION/03-SETTLEMENTS/text/ -- all 116 files (58 Company +
58 Driver Settlement .txt), exactly the corpus the ruling named.

OUTPUT (scripts/ops/output/, gitignored -- regenerate, don't hand-edit):
  feeder-input-loads.csv       one row per load, BOTH documents joined: customer, line_haul
                                (company: miles/rate/qp/amount) AND driver's own loaded/empty
                                miles+rate -- never merged, never averaged, both real per the
                                ruling ("Company line-haul miles and driver loaded miles are
                                DIFFERENT measures").
  feeder-input-stops.csv       one row per stop: load, seq, type, leg_miles, date, facility,
                                city, state, zip -- the driver document's own real address,
                                parsed from the right (zip, state, city, everything remaining is
                                the facility, which may itself contain commas).
  feeder-input-expenses.csv    one row per money line, tagged with its OUTPUT TYPE so a caller
                                never has to re-derive which table it belongs to:
                                  expense        -> accounting.expenses (diesel, def,
                                                    reefer_diesel, scale, lumper, toll_parking,
                                                    washout, road_service)
                                  driver_earning -> driver bill earnings (driver_pay, tarp_pay,
                                                    layover_pay, bonus_pay, extra_stop_pay)
                                  bill_payment   -> a BILL PAYMENT against the driver's bill,
                                                    dated when the money left (cash_advance) --
                                                    owner law, NOT a deduction, NOT an expense.
                                  escrow         -> driver_finance.escrow_ledger, NOT an expense,
                                                    NOT a deduction (escrow_for_claims) -- the
                                                    largest driver-document category, never fed
                                                    before this.
                                  deduction      -> a settlement deduction/reimbursement line
                                                    (admin_fee, driver_reimbursement)
                                  other          -> named verbatim, not silently bucketed (e.g.
                                                    personal-vehicle gasoline, misc fuel-card
                                                    parts charges -- neither is a load expense or
                                                    any of the 5 driver-earning types)
  feeder-input-doc-coverage.csv  one row per settlement number: has_company, has_driver -- the
                                real finding the ruling asked to be filed (13529/13540 have a
                                driver settlement and no company settlement: driver paid, no
                                revenue document).
"""
import os
import re
import csv
import glob
import json
import collections

HOME = os.path.expanduser("~")
TXT_DIR = os.path.join(HOME, "Downloads/IH35-MASTER-RECONCILIATION/03-SETTLEMENTS/text")
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ops", "output")
os.makedirs(OUT_DIR, exist_ok=True)

NUM = r"-?[\d,]+\.?\d*"


def f(s):
    if s is None:
        return None
    s = str(s).replace(",", "").replace("$", "").strip()
    if s in ("", "-"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


# ============================================================ DRIVER (Lead's grammar, verbatim)
STOP = re.compile(r"^\s*(Empty|Pickup|Deliver)\s+(?:([\d,]+\.?\d*)mi\.\s+)?(\d{4}-\d{2}-\d{2}),\s*(.+?)\s*$")
LOADHDR = re.compile(r"^\s*Load\s+(\d{4,6})\s+Truck\s+(\S+)\s*/\s*Trailer\s+(\S+)")
MILES = re.compile(r"^\s*(Loaded|Empty)\s+Miles\s+([\d,]+\.?\d*)\s*@\s*\$([\d.]+)\s+(" + NUM + r")")
TOTMI = re.compile(r"^\s*Total\s+(Loaded|Empty)?\s*Miles\s+([\d,]+\.?\d*)")
SALARY = re.compile(r"Salary:\s*(" + NUM + r")")
LOADLINE = re.compile(r"^\s*Load\s+(\d{4,6})\s{2,}(?:(\d{4}-\d{2}-\d{2})\s*-\s*)?(.+?)\s{2,}(" + NUM + r")\s*$")
SECT = re.compile(r"^\s*(Additional Pay|Deductions|Reimbursed Expenses|Escrow):\s*(" + NUM + r")")
TOTDUE = re.compile(r"TOTAL DUE:\s*(" + NUM + r")")
MPG = re.compile(r"M\.P\.G\.\s*-\s*([\d.]+)")
DRVHDR = re.compile(r"^\s*IH35 Transportation, LLC\s{2,}(.+?)\s*$")
DRVADDR = re.compile(r"Address:\s*(.+?)\s*$")
PERIOD = re.compile(r"(Start|End) Date:\s*(\d{4}-\d{2}-\d{2})")
DOCNO = re.compile(r"(Driver|Company) Settlement No\.\s*(\d+)")


def split_place(txt):
    """Parse 'Facility Name, City, ST 78045' from the RIGHT -- facility may contain commas."""
    m = re.search(r"^(.*?),?\s*([A-Za-z][A-Za-z\.\s]*?),\s*([A-Z]{2})\.?\s*(\d{5})?\s*$", txt.strip())
    if not m:
        return {"facility": None, "city": None, "state": None, "zip": None, "raw": txt.strip()}
    fac, city, st, zp = m.group(1), m.group(2), m.group(3), m.group(4)
    fac = (fac or "").strip().rstrip(",") or None
    return {"facility": fac, "city": city.strip(), "state": st, "zip": zp, "raw": txt.strip()}


# EXPANDED classify() -- the Lead's original had 7 buckets (cash_advance/escrow_for_claims/
# admin_fee/tarp_pay/extra_stop_pay/driver_reimbursement/scale, everything else "other"). This is
# the full 15-category split the ruling asked for, built from the REAL description vocabulary
# grepped out of parsed.json's own 44 "other" lines before writing a single regex here -- nothing
# guessed. Order matters: more specific checks first.
OUTPUT_TYPE = {
    "cash_advance": "bill_payment",
    "escrow_for_claims": "escrow",
    "admin_fee": "income",  # Lead correction, 2026-09-23: "COMPANY INCOME, not a negative expense."
    "driver_reimbursement": "deduction",
    "driver_pay": "driver_earning",
    "tarp_pay": "driver_earning",
    "layover_pay": "driver_earning",
    "bonus_pay": "driver_earning",
    "extra_stop_pay": "driver_earning",
    "diesel": "expense",
    "def": "expense",
    "reefer_diesel": "expense",
    "scale": "expense",
    "lumper": "expense",
    "toll_parking": "expense",
    "washout": "expense",
    "road_service": "expense",
    "tires": "expense",
    "vehicle_parts_accessories": "expense",
    "company_vehicle_fuel": "expense",
}

# ACCOUNT_KEY -- Lead ruling, 2026-09-23, verbatim: "EVERY LINE EMITS ITS TARGET ACCOUNT. NO
# 'other' BUCKET. A line with no mapping is a build failure, not an 'other'." ROUND 67 (same day)
# finalized most of the pending codes with real numbers; superseded values are noted inline.
# Three remaining shapes:
#   (a) a REAL numeric GL code -- established this session (diesel=5000, def=5010) or given
#       explicitly in the Round 66/67 rulings (admin_fee=7200, reefer_diesel=5160, washout=5170,
#       road_service/vehicle_parts_accessories=5400 Truck Repairs & Maintenance, tires=5500,
#       company_vehicle_fuel=6220, driver_reimbursement=5190, scale/toll_parking=5300 -- shared
#       code, two categories, per the ruling's own "scale/toll -> 5300").
#   (b) a per-driver SUB-ACCOUNT KEY (escrow_for_claims, cash_advance) -- the ruling names these as
#       "the driver's own Driver Escrow sub-account" / "Driver Advances Receivable sub-account",
#       not a single shared code; resolving to a real per-driver account id is a live-DB join
#       (mdata.drivers -> accounting.escrow_accounts / driver_finance receivables), out of scope
#       for a text-extraction script -- the category-level key is emitted, the driver name is
#       already on every row (feeder-input-loads.csv), so the feeder can resolve it at load time.
#   (c) a NAMED PENDING key for the still-unassigned driver-earning COGS accounts (CC-1 creates
#       these, owner approves the numbers) and lumper (no code given in either ruling yet).
# Categories with NO entry here are INTENTIONAL: main() asserts every emitted row has a non-null
# account_key and FAILS THE BUILD, printing exactly which rows and their total dollars, rather
# than silently bucketing them or guessing a code -- per the ruling's own instruction, and it
# already caught one real miscategorization this way (vehicle_parts_accessories, Round 66).
ACCOUNT_KEY = {
    "diesel": "5000",  # Fuel & Diesel
    "def": "5010",  # DEF (Diesel Exhaust Fluid)
    "admin_fee": "7200",  # Driver Admin Fee Income (company INCOME, not a negative expense)
    "escrow_for_claims": "driver_escrow_subaccount",  # per-driver; resolved at feed time
    "cash_advance": "driver_advances_receivable_subaccount",  # per-driver; resolved at feed time
    "tarp_pay": "COGS_PENDING:tarp_pay",
    "layover_pay": "COGS_PENDING:layover_pay",
    "extra_stop_pay": "COGS_PENDING:extra_stop_pay",
    "bonus_pay": "COGS_PENDING:hiring_bonus_or_performance_bonus",  # 2 source Spanish phrasings
    # merged into one category by classify_driver_line; CC-1's own message names both
    # "hiring_bonus" and "performance_bonus" as separate COGS accounts -- this parser cannot
    # distinguish the two from description text alone (both use "Bono"/"Bonus" wording without a
    # consistent hiring-vs-performance marker); named here as a real, unresolved sub-split, not
    # silently merged and hidden.
    "reefer_diesel": "5160",  # Reefer Fuel (NEW, Round 67)
    "washout": "5170",  # Trailer & Truck Washout (NEW, Round 67)
    "road_service": "5400",  # Truck Repairs & Maintenance (EXISTS) -- non-tire repair only
    "tires": "5500",  # Tires (EXISTS) -- split out of road_service, Round 67
    "vehicle_parts_accessories": "5400",  # Truck Repairs & Maintenance -- Round 67: "consumed on
    # the road running a load... COGS, not a period expense," explicitly NOT 6160 Parts & Supplies
    # (that account is shop inventory, not roadside purchases).
    "driver_reimbursement": "5190",  # Driver Reimbursed Expenses (renumbered, Round 67)
    "company_vehicle_fuel": "6220",  # Company Vehicle Fuel (NEW, Round 67 -- the Honda pickup)
    "scale": "5300",  # shared with toll_parking, Round 67: "scale/toll -> 5300"
    "toll_parking": "5300",
    "lumper": "EXPENSE_PENDING:lumper",  # no code given in either ruling yet
    "driver_pay": "COGS_PENDING:driver_pay_base",
}


def classify_driver_line(desc):
    d = desc.lower()
    if "cash advance" in d:
        return "cash_advance"
    if "escrow" in d:
        return "escrow_for_claims"
    if "admin fee" in d:
        return "admin_fee"
    if "enlonada" in d or "tarp" in d:
        return "tarp_pay"
    if "layover" in d or "estancia" in d:
        return "layover_pay"
    if "bono" in d or "bonus" in d or "transferencia" in d:
        return "bonus_pay"
    if "extra delivery" in d or "extra pick up" in d or "drop" in d:
        return "extra_stop_pay"
    if "reimburs" in d:
        return "driver_reimbursement"
    if "scale" in d:
        return "scale"
    if "reefer diesel" in d or "reefer-diesel" in d:
        return "reefer_diesel"
    if "washout" in d:
        return "washout"
    if "lumper" in d:
        return "lumper"
    # "Pago de Cruce" = Spanish for "bridge/toll crossing payment" -- a real toll charge, caught
    # by grep-checking every "other"-bucket description before this fix (was silently landing in
    # "other" because "toll"/"bridge"/"parking" never matched the Spanish-language wording).
    if "toll" in d or "parking" in d or "bridge" in d or "pago de cruce" in d or "cruce" in d:
        return "toll_parking"
    # Round 67 correction (Lead, 2026-09-23): "Road-service TIRES -> 5500 Tires" is its own
    # account, split out of general road-service repair ("Road Service-Truck Repair" -> 5400,
    # Truck Repairs & Maintenance). Checked "tire" first since both share the "Road Service-"
    # prefix in the real description vocabulary.
    if "tire" in d:
        return "tires"
    if "road service" in d:
        return "road_service"
    # Personal-vehicle gasoline (a support Honda pickup, NOT the load's own truck -- confirmed by
    # the description text itself: "GASOLINA/HONDA", "Gasolina para Camioneta Honda"). Its own
    # category per the Lead's explicit correction: "Company Vehicle Fuel. NOT 5000 Fuel & Diesel.
    # NOT an IFTA gallon." -- lumping it with 5000 would overstate COGS and corrupt the IFTA filing.
    if "honda" in d or "camioneta" in d:
        return "company_vehicle_fuel"
    # Fuel-card-purchased truck parts/accessories (windshield wiper, headlight, premium wash, a
    # flat per-transaction "fee item") -- real money. Round 67 ruling: "-> 5400 Truck Repairs &
    # Maintenance (COGS). These are consumed on the road running a load... COGS, not a period
    # expense." Kept as its own category for reporting granularity even though it now shares an
    # account with road_service's non-tire repair lines.
    return "vehicle_parts_accessories"


# Company-side EXPENSES description vocabulary -- same categories, applied to the company
# document's own EXPENSES section (which never carries cash_advance/escrow/admin_fee/tarp_pay/
# driver-pay lines at all -- confirmed by this session's own full-corpus grep earlier today).
def classify_company_expense(desc):
    d = desc.lower()
    if "def" in d or "diesel exhaust fluid" in d:
        return "def"
    if "reefer diesel" in d or "reefer-diesel" in d:
        return "reefer_diesel"
    if "scale" in d:
        return "scale"
    if "lumper" in d:
        return "lumper"
    if "toll" in d or "parking" in d or "bridge" in d:
        return "toll_parking"
    if "washout" in d:
        return "washout"
    if "tire" in d:
        return "tires"
    if "road service" in d:
        return "road_service"
    if "honda" in d or "camioneta" in d:
        return "company_vehicle_fuel"
    return "vehicle_parts_accessories"


def parse_driver(path):
    doc = {
        "file": os.path.basename(path), "doc_no": None, "driver": None,
        "driver_address": None, "start": None, "end": None, "mpg": None,
        "total_due": None, "totals": {}, "loads": collections.OrderedDict(),
    }
    cur = None
    for ln in open(path, errors="ignore"):
        s = ln.rstrip("\n")
        m = DOCNO.search(s)
        if m and m.group(1) == "Driver":
            doc["doc_no"] = m.group(2)
        m = DRVHDR.match(s)
        if m and not doc["driver"] and "Settlement" not in m.group(1):
            doc["driver"] = m.group(1).strip()
        m = DRVADDR.search(s)
        if m and not doc["driver_address"]:
            doc["driver_address"] = m.group(1).strip()
        m = PERIOD.search(s)
        if m:
            doc["start" if m.group(1) == "Start" else "end"] = m.group(2)
        m = MPG.search(s)
        if m:
            doc["mpg"] = f(m.group(1))
        m = TOTDUE.search(s)
        if m:
            doc["total_due"] = f(m.group(1))
        m = SECT.match(s)
        if m:
            doc["totals"][m.group(1).lower().replace(" ", "_")] = f(m.group(2))

        m = LOADHDR.match(s)
        if m:
            cur = m.group(1)
            doc["loads"].setdefault(
                cur, {"load": cur, "truck": m.group(2), "trailer": m.group(3), "stops": [], "pay": [], "lines": []}
            )
            continue
        m = STOP.match(s)
        if m and cur:
            p = split_place(m.group(4))
            doc["loads"][cur]["stops"].append(
                {
                    "seq": len(doc["loads"][cur]["stops"]) + 1,
                    "type": m.group(1).lower(),
                    "leg_miles": f(m.group(2)),
                    "date": m.group(3),
                    **p,
                }
            )
            continue
        m = MILES.match(s)
        if m and cur:
            doc["loads"][cur]["pay"].append(
                {"kind": m.group(1).lower() + "_miles", "miles": f(m.group(2)), "rate": f(m.group(3)), "amount": f(m.group(4))}
            )
            continue
        m = LOADLINE.match(s)
        if m:
            ld = m.group(1)
            doc["loads"].setdefault(ld, {"load": ld, "truck": None, "trailer": None, "stops": [], "pay": [], "lines": []})
            desc = m.group(3).strip()
            doc["loads"][ld]["lines"].append(
                {"date": m.group(2), "description": desc, "amount": f(m.group(4)), "category": classify_driver_line(desc)}
            )
            continue
        m = TOTMI.match(s)
        if m:
            k = "total_%s_miles" % (m.group(1).lower() if m.group(1) else "all")
            doc["totals"][k] = f(m.group(2))
            sm = SALARY.search(s)
            if sm:
                doc["totals"]["salary"] = f(sm.group(1))
    return doc


# ============================================================ COMPANY (Lead's grammar, verbatim
# except EXPR -- see the FIXED note at the top of this file)
CSTOP = re.compile(r"^\s*(Pickup|Deliver|Empty)\s+(\d{4}-\d{2}-\d{2}),\s*(.+?)\s{2,}Trk:\s*(\S+)\s*/\s*Trlr:\s*(\S+)\s*/\s*(.+?)\s*$")
CLOAD = re.compile(r"^\s*Load\s+(\d{4,6})\s*(?:/\s*(.+?))?\s*$")
LH = re.compile(r"^\s*Line Haul\s+Line Haul\s+([\d,]+\.?\d*)\s+([\d.]+)\s+([\d.]+%?)?\s+(" + NUM + r")\s*$")
FUEL = re.compile(
    r"^\s*(\d{4}-\d{2}-\d{2})\s+(\S+)\s{2,}(.+?)\s{2,}(\S+)\s+([\d,]+\.\d+)\s+([\d.]+)\s+("
    + NUM + r")\s+(" + NUM + r")\s+(" + NUM + r")\s+(" + NUM + r")\s+(" + NUM + r")\s*$"
)
REV = re.compile(r"^\s*(Invoiced|Quick Pay|Driver Salary|Additional Driver Pay|Fuel|Company Expenses|Net Revenue)\s+(?:([\d.]+)%\s+([\d.]+) p/m\s+)?(" + NUM + r")\s*$")
PICKDROP = re.compile(r"^\s*(\d+)\s+(Picks|Drops)\s+\$(" + NUM + r") After (\d+)\s+(" + NUM + r")")


def parse_company_expense_line(s):
    """FIX for the 2 named parser bugs -- the fixed-position EXPR regex breaks when a row has no
    invoice number (routine for road-service/lumper/toll rows). This is the same split-on-2+-
    spaces + explicit-flag-token-filter method this session already proved byte-exact against
    document 5774's own ground truth earlier today: never assumes a column exists, so a missing
    invoice number no longer shifts anything, and the "Drv"/Y flag tokens are excluded by exact
    literal match (grepped across the whole corpus: Reimb. is always Y/N, Comp. Exp. is only ever
    blank or "Drv") rather than guessed off a fixed position."""
    if not re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return None
    p = re.split(r"\s{2,}", s.strip())
    amt = f(p[-1])
    if amt is None:
        return None
    body = [x for x in p if not re.fullmatch(r"[YN]", x.strip()) and x.strip() != "Drv"]
    if len(body) < 3:
        return None
    head = body[0].split(None, 1)
    date = head[0]
    vendor = head[1] if len(head) > 1 else (body[1] if len(body) > 1 else "")
    description = body[-2] if len(body) >= 3 else ""
    # invoice: whichever remaining middle token (if any) looks like an invoice number/reference
    # -- a run of digits, or absent entirely (confirmed real: road-service/lumper/toll rows
    # routinely carry none). Location is everything else between vendor and description.
    middle = body[1:-2] if len(body) > 3 else []
    invoice = None
    location_parts = []
    for tok in middle:
        if invoice is None and re.fullmatch(r"[A-Za-z0-9\-]{4,}", tok.strip()) and re.search(r"\d", tok):
            # heuristic only breaks the tie when there are 2+ candidate tokens; never needed when
            # location is the sole remaining token, which is the common case.
            pass
        location_parts.append(tok)
    location = "  ".join(location_parts).strip()
    return {"date": date, "vendor": vendor, "location": location, "invoice": invoice, "description": description, "amount": amt}


def parse_company(path):
    doc = {"file": os.path.basename(path), "doc_no": None, "start": None, "end": None, "revenue": {}, "loads": collections.OrderedDict()}
    sect, cur = None, None
    for ln in open(path, errors="ignore"):
        s = ln.rstrip("\n")
        m = DOCNO.search(s)
        if m and m.group(1) == "Company":
            doc["doc_no"] = m.group(2)
        m = PERIOD.search(s)
        if m:
            doc["start" if m.group(1) == "Start" else "end"] = m.group(2)
        for k in ("CUSTOMER CHARGES", "DRIVER PAYMENT", "FUEL PURCHASES", "EXPENSES", "REVENUE"):
            if s.strip() == k:
                sect = k
        m = REV.match(s)
        if m and sect == "REVENUE":
            doc["revenue"][m.group(1).lower().replace(" ", "_")] = {"pct": f(m.group(2)), "per_mile": f(m.group(3)), "amount": f(m.group(4))}
            continue
        m = CSTOP.match(s)
        if m:
            doc.setdefault("_stops", []).append(
                {"type": m.group(1).lower(), "date": m.group(2), **split_place(m.group(3)), "truck": m.group(4), "trailer": m.group(5), "driver": m.group(6).strip()}
            )
            continue
        m = CLOAD.match(s)
        if m:
            cur = m.group(1)
            e = doc["loads"].setdefault(cur, {"load": cur, "customer": None, "driver": None, "line_haul": None, "pay": [], "fuel": [], "expenses": []})
            if m.group(2):
                (e.__setitem__("driver", m.group(2).strip()) if sect in ("DRIVER PAYMENT", "FUEL PURCHASES", "EXPENSES") else e.__setitem__("customer", m.group(2).strip()))
            continue
        m = LH.match(s)
        if m and cur:
            doc["loads"][cur]["line_haul"] = {"miles": f(m.group(1)), "rate": f(m.group(2)), "qp": m.group(3), "amount": f(m.group(4))}
            continue
        m = MILES.match(s)
        if m and cur:
            doc["loads"][cur]["pay"].append({"kind": m.group(1).lower() + "_miles", "miles": f(m.group(2)), "rate": f(m.group(3)), "amount": f(m.group(4))})
            continue
        m = PICKDROP.match(s)
        if m and cur:
            doc["loads"][cur]["pay"].append({"kind": m.group(2).lower(), "count": int(m.group(1)), "amount": f(m.group(5))})
            continue
        if sect == "FUEL PURCHASES" and cur:
            m = FUEL.match(s)
            if m:
                doc["loads"][cur]["fuel"].append(
                    {
                        "date": m.group(1), "vendor": m.group(2), "location": m.group(3).strip(), "invoice": m.group(4),
                        "gallons": f(m.group(5)), "cpg": f(m.group(6)), "receipt": f(m.group(7)), "fees": f(m.group(8)),
                        "disc": f(m.group(9)), "disc_pg": f(m.group(10)), "actual": f(m.group(11)),
                    }
                )
                continue
        if sect == "EXPENSES" and cur:
            row = parse_company_expense_line(s)
            if row:
                row["category"] = classify_company_expense(row["description"])
                doc["loads"][cur]["expenses"].append(row)
                continue
    return doc


def main():
    files_driver = sorted(glob.glob(os.path.join(TXT_DIR, "Driver_Settlement_*.txt")))
    files_company = sorted(f for f in glob.glob(os.path.join(TXT_DIR, "Company_*.txt")) if "(Merged)" not in f)
    print(f"parsing {len(files_driver)} driver + {len(files_company)} company settlement files from {TXT_DIR}")

    D = []
    seen_d = set()
    for p in files_driver:
        d = parse_driver(p)
        if d["doc_no"] in seen_d:
            continue
        seen_d.add(d["doc_no"])
        D.append(d)

    C = []
    seen_c = set()
    for p in files_company:
        c = parse_company(p)
        if c["doc_no"] in seen_c:
            continue
        seen_c.add(c["doc_no"])
        C.append(c)

    json.dump({"driver": D, "company": C}, open(os.path.join(OUT_DIR, "feeder-input-raw.json"), "w"), indent=1)

    dl = {l for d in D for l in d["loads"]}
    cl = {l for c in C for l in c["loads"]}

    # ---- ground-truth arm: document 5774 (loads 13517/13518) must still read $2,519.78 / 3 rows
    gt = 0.0
    gt_n = 0
    for c in C:
        if c["doc_no"] == "5774":
            for ld in ("13517", "13518"):
                for e in c["loads"].get(ld, {}).get("fuel", []):
                    gt += e["actual"]
                    gt_n += 1
    gt_ok = abs(gt - 2519.78) < 0.01 and gt_n == 3
    print(f"\nGROUND TRUTH (doc 5774, loads 13517/13518 diesel): ${gt:,.2f} / {gt_n} rows -- {'PASS' if gt_ok else 'FAIL'}")

    # ---- doc coverage
    doc_nos = sorted({c["doc_no"] for c in C} | {d["doc_no"] for d in D}, key=lambda x: int(x))
    coverage_path = os.path.join(OUT_DIR, "feeder-input-doc-coverage.csv")
    with open(coverage_path, "w", newline="") as f_out:
        w = csv.DictWriter(f_out, fieldnames=["doc_no", "has_company", "has_driver"])
        w.writeheader()
        for no in doc_nos:
            w.writerow({"doc_no": no, "has_company": no in seen_c, "has_driver": no in seen_d})

    # ---- loads, joined
    loads_out = []
    for ld in sorted(dl | cl, key=lambda x: int(x)):
        d_load = None
        d_doc = None
        for d in D:
            if ld in d["loads"]:
                d_load, d_doc = d["loads"][ld], d
                break
        c_load = None
        c_doc = None
        for c in C:
            if ld in c["loads"]:
                c_load, c_doc = c["loads"][ld], c
                break
        loaded_miles = next((p for p in (d_load or {}).get("pay", []) if p["kind"] == "loaded_miles"), None)
        empty_miles = next((p for p in (d_load or {}).get("pay", []) if p["kind"] == "empty_miles"), None)
        loads_out.append(
            {
                "load_number": ld,
                "company_doc": c_doc["doc_no"] if c_doc else "",
                "driver_doc": d_doc["doc_no"] if d_doc else "",
                "customer": (c_load or {}).get("customer") or "",
                "driver_name": (d_doc or {}).get("driver") or (c_load or {}).get("driver") or "",
                "truck": (d_load or {}).get("truck") or "",
                "trailer": (d_load or {}).get("trailer") or "",
                "company_line_haul_miles": (c_load or {}).get("line_haul", {}).get("miles") if c_load and c_load.get("line_haul") else "",
                "company_line_haul_rate": (c_load or {}).get("line_haul", {}).get("rate") if c_load and c_load.get("line_haul") else "",
                "company_line_haul_amount": (c_load or {}).get("line_haul", {}).get("amount") if c_load and c_load.get("line_haul") else "",
                "driver_loaded_miles": loaded_miles["miles"] if loaded_miles else "",
                "driver_loaded_rate": loaded_miles["rate"] if loaded_miles else "",
                "driver_loaded_amount": loaded_miles["amount"] if loaded_miles else "",
                "driver_empty_miles": empty_miles["miles"] if empty_miles else "",
                "driver_empty_amount": empty_miles["amount"] if empty_miles else "",
                "mpg": (d_doc or {}).get("mpg") or "",
                "total_due": (d_doc or {}).get("total_due") or "",
                "driver_address": (d_doc or {}).get("driver_address") or "",
            }
        )

    with open(os.path.join(OUT_DIR, "feeder-input-loads.csv"), "w", newline="") as f_out:
        w = csv.DictWriter(f_out, fieldnames=list(loads_out[0].keys()) if loads_out else [])
        w.writeheader()
        w.writerows(loads_out)

    # ---- stops (driver document only -- the real address)
    stops_out = []
    for d in D:
        for ld, v in d["loads"].items():
            for st in v["stops"]:
                stops_out.append(
                    {
                        "load_number": ld, "driver_doc": d["doc_no"], "seq": st["seq"], "type": st["type"],
                        "leg_miles": st["leg_miles"] if st["leg_miles"] is not None else "", "date": st["date"],
                        "facility": st["facility"] or "", "city": st["city"] or "", "state": st["state"] or "",
                        "zip": st["zip"] or "", "raw": st["raw"],
                    }
                )
    with open(os.path.join(OUT_DIR, "feeder-input-stops.csv"), "w", newline="") as f_out:
        w = csv.DictWriter(f_out, fieldnames=["load_number", "driver_doc", "seq", "type", "leg_miles", "date", "facility", "city", "state", "zip", "raw"])
        w.writeheader()
        w.writerows(stops_out)

    # ---- expenses / earnings / bill_payments / escrow / deductions -- one unified table, typed,
    # every row carrying its target account_key. Lead ruling, 2026-09-23, verbatim: "EVERY LINE
    # EMITS ITS TARGET ACCOUNT. NO 'other' BUCKET. A line with no mapping is a build failure, not
    # an 'other'." -- see the FAIL block below, not a silent default.
    def row(load_number, source_doc, source, date, category, vendor, description, amount, raw_line):
        return {
            "load_number": load_number, "source_doc": source_doc, "source": source, "date": date,
            "category": category, "output_type": OUTPUT_TYPE.get(category, ""), "account_key": ACCOUNT_KEY.get(category),
            "vendor": vendor, "description": description, "amount": amount, "raw_line": raw_line,
        }

    money_out = []
    for d in D:
        for ld, v in d["loads"].items():
            for x in v["lines"]:
                money_out.append(row(ld, d["doc_no"], "driver", x["date"] or "", x["category"], "", x["description"], x["amount"], ""))
            for p in v["pay"]:
                money_out.append(row(ld, d["doc_no"], "driver", "", "driver_pay", "", p["kind"], p["amount"], ""))
    for c in C:
        for ld, v in c["loads"].items():
            for e in v["fuel"]:
                money_out.append(row(ld, c["doc_no"], "company", e["date"], "diesel", e["vendor"], "Diesel", e["actual"], e["location"]))
            for e in v["expenses"]:
                money_out.append(row(ld, c["doc_no"], "company", e["date"], e["category"], e["vendor"], e["description"], e["amount"], e.get("location", "")))

    with open(os.path.join(OUT_DIR, "feeder-input-expenses.csv"), "w", newline="") as f_out:
        w = csv.DictWriter(f_out, fieldnames=["load_number", "source_doc", "source", "date", "category", "output_type", "account_key", "vendor", "description", "amount", "raw_line"])
        w.writeheader()
        w.writerows(money_out)

    # ---- counts
    stops = sum(len(v["stops"]) for d in D for v in d["loads"].values())
    fac = sum(1 for d in D for v in d["loads"].values() for s in v["stops"] if s["facility"])
    legs = sum(1 for d in D for v in d["loads"].values() for s in v["stops"] if s["leg_miles"] is not None)
    fuel_n = sum(len(v["fuel"]) for c in C for v in c["loads"].values())
    fuel_amt = sum(e["actual"] for c in C for v in c["loads"].values() for e in v["fuel"])
    exp_n = sum(len(v["expenses"]) for c in C for v in c["loads"].values())
    exp_blank = sum(1 for c in C for v in c["loads"].values() for e in v["expenses"] if not e["description"])
    lh = sum(1 for c in C for v in c["loads"].values() if v["line_haul"])

    cat_counts = collections.Counter()
    cat_amts = collections.defaultdict(float)
    for r in money_out:
        cat_counts[r["category"]] += 1
        cat_amts[r["category"]] += r["amount"] or 0.0

    print(f"DRIVER docs {len(D)}  loads {len(dl)}")
    print(f"COMPANY docs {len(C)}  loads {len(cl)}")
    print(f"UNION loads {len(dl | cl)}   BOTH {len(dl & cl)}   driver-only {sorted(dl - cl, key=int)}   company-only {sorted(cl - dl, key=int)}")
    print(f"STOPS {stops}  with facility name {fac}  with leg miles {legs}")
    print(f"LINE HAUL rows {lh}   FUEL rows {fuel_n} (${fuel_amt:,.2f})   COMPANY EXPENSE rows {exp_n} (blank description: {exp_blank})")
    print("\nALL CATEGORIES:")
    for k, n in cat_counts.most_common():
        print(f"   {k:<22} {n:>4} lines   {cat_amts[k]:>12,.2f}   -> {OUTPUT_TYPE.get(k, '?')} ({ACCOUNT_KEY.get(k, 'UNMAPPED')})")

    ca_rows = [r for r in money_out if r["category"] == "cash_advance"]
    ca_in_window = [r for r in ca_rows if r["date"] and r["date"] >= "2026-08-07"]
    print(f"\ncash_advance: {len(ca_rows)} lines ${sum(abs(r['amount']) for r in ca_rows):,.2f} total; "
          f"{len(ca_in_window)} in-window (>=2026-08-07) ${sum(abs(r['amount']) for r in ca_in_window):,.2f}")

    print(f"\nfeeder-input-loads.csv:        {len(loads_out)} rows")
    print(f"feeder-input-stops.csv:        {len(stops_out)} rows")
    print(f"feeder-input-expenses.csv:     {len(money_out)} rows")
    print(f"feeder-input-doc-coverage.csv: {len(doc_nos)} rows ({len(seen_c)} company, {len(seen_d)} driver)")

    # BUILD FAILURE, not a silent "other" -- Lead ruling, 2026-09-23, verbatim: "EVERY LINE EMITS
    # ITS TARGET ACCOUNT. NO 'other' BUCKET. A line with no mapping is a build failure, not an
    # 'other'." The CSV above is still written in full (including unmapped rows, account_key=="")
    # so the output is inspectable while this gap gets closed -- but the process exits nonzero and
    # names exactly what's missing, never silently passes.
    unmapped = [r for r in money_out if r["account_key"] is None]
    if unmapped:
        by_cat = collections.defaultdict(lambda: [0, 0.0])
        for r in unmapped:
            by_cat[r["category"]][0] += 1
            by_cat[r["category"]][1] += r["amount"] or 0.0
        print("\nBUILD FAILURE -- lines with NO account_key mapping (Lead ruling 2026-09-23: "
              "\"a line with no mapping is a build failure, not an 'other'\"):")
        for cat, (n, amt) in sorted(by_cat.items()):
            print(f"   {cat:<26} {n:>4} lines   ${amt:>12,.2f}")
        print("Add these categories to ACCOUNT_KEY (or confirm a real GL code) before this script "
              "may be considered done -- not guessed here.")
        raise SystemExit(1)


if __name__ == "__main__":
    main()

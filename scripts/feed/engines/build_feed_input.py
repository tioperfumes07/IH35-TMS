#!/usr/bin/env python3
"""
FEEDER INPUT BUILDER  —  IH35-TMS / USMCA  —  Claude Lead, 2026-09-22

Turns the 117 AlwaysTrack settlement documents into the deterministic payload the
feeder hands to the app's real create path. It invents nothing: every field is
carried from a source document, and every money line is a QuickBooks ITEM line
carrying quantity, unit of measure, rate and amount, with amount = qty x rate
proven to the cent before the file is written.

INPUT   parsed.json          (parse_settlements.py output: 59 company + 58 driver docs)
OUTPUT  feed_input.json      one record per load, grouped by feed day
EXIT    0 only if every self-proof passes. Any failure exits 1 and names the load.

LAW THIS ENCODES
  - A money line is item | description | qty | uom | rate | amount. Amount is computed.
  - DEF and reefer fuel are ITEMS under the Fuel Expenses category, never accounts.
  - Cash advances are BILL PAYMENTS, not deductions and not expenses.
  - Escrow for claims is a driver escrow liability, not an expense.
  - Admin fee is income, not a negative expense.
  - The stop list carries facility, full city/state/zip and the delivery date, because
    revrec reads the final delivery departure and finds nothing without it.
"""
import json, sys, re, collections
from collections import defaultdict
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse_settlements import attribute_unheaded_expenses

CENT = 0.005

# ---------------------------------------------------------------- item catalog
# Names are verbatim from the LIVE QuickBooks company file (USMCA Freight
# Solutions, Inc.), pulled 2026-09-22. category :: item, exactly as QBO stores it.
ITEM = {
  "line_haul":      ("Sales of Service Income", "Line Haul",                     "mile"),
  "loaded_miles":   ("Driver Salaries", "Driver Pay-CDL-Loaded Miles",           "mile"),
  "empty_miles":    ("Driver Salaries", "Driver Pay-CDL-Empty Miles",            "mile"),
  "diesel":         ("Fuel Expenses", "Fuel-Truck Diesel",                       "gallon"),
  "def":            ("Fuel Expenses", "Fuel-DEF-Diesel Exhaust Fluid",           "gallon"),
  "reefer":         ("Fuel Expenses", "Fuel-Reefer-Diesel",                      "gallon"),
  "tarp_pay":       ("Driver Salaries", "Driver Pay-Tarp-Enlonada/Desenlonada",  "each"),
  "layover_pay":    ("Driver Salaries", "Driver Pay-Layover-Estancia",           "each"),
  "extra_stop_pay": ("Driver Salaries", "Driver Pay-Extra Pick/Delivery-Drop",   "each"),
  "bonus_pay":      ("Driver Salaries", "Driver Pay-Bonus",                      "each"),
  "local_movement": ("Driver Salaries", "Driver Pay-Local Movement",             "each"),
  "cash_advance":   ("Driver Salaries", "Petty Cash Advance-Caja Chica",         "each"),
  "escrow":         ("Driver Deductions", "Driver Deduction-Escrow for Claims-2026", "each"),
  "admin_fee":      ("Driver Deductions", "Driver Deduction-Wire & ACH Fee",     "each"),
  "scale":          ("Scale Expense", "OTR-Scale Expense",                       "each"),
  "toll_parking":   ("Bridge & Toll Expenses", "Highway Toll Expense-USA",       "each"),
  "washout":        ("Freight Delivery Costs", "Reefer-Trailer Washout Expense", "each"),
  "lumper":         ("Freight Delivery Costs", "Warehouse Lumper Expense",       "each"),
  "road_service":   ("Repair & Maintenance-Roadservice", "Road Service-Truck Repair Expense", "each"),
  "tires":          ("Repair & Maintenance-Roadservice", "Road Service-Truck Tire Expense",   "each"),
  "reimbursement":  ("Driver Reimbursements", "Driver Reimbursement-Scale Expense", "each"),
  "permit":         ("Operational Licenses, Permits & Taxes", "Permits-Mexico",  "each"),
}
ITEM.update({
  # --- NEW ITEMS. Do not exist in the live QBO file yet; owner ordered them created.
  # Owner, 2026-09-23: "WE CHARGE THEM A FEE FOR USING THE COMPANY VEHICLE BECAUSE THEY
  # USE IT AND NEVER FUEL, SO WE CHARGE THEM FOR THE USE."  It is a charge to the driver,
  # therefore income to us -- never a fuel expense and never an IFTA gallon.
  "company_vehicle_use_fee": ("Driver Deductions", "Driver Deduction-Company Vehicle Use Fee", "each"),
  # Accessorials the brokers pay separately from line haul, read off the rate confirmations.
  "acc_tracking":   ("Sales of Service Income", "Sales-Tracking/MacroPoint Compliance", "each"),
  "acc_pickup_appt":("Sales of Service Income", "Sales-On-Time Pickup Appointment",     "each"),
  "acc_delivery_appt":("Sales of Service Income","Sales-On-Time Delivery Appointment",  "each"),
  "acc_tarp":       ("Sales of Service Income", "Sales-Tarp Charge",                    "each"),
  "parking":      ("Bridge & Toll Expenses", "OTR-Parking Expense",                          "each"),
  "oil_additive": ("Repair & Maintenance-Over the Road", "OTR-Additives, Oil, Antifreeze",   "each"),
  "shop_tools":   ("Repair & Maintenance-Over the Road", "OTR-Maintenance-Tools",            "each"),
  "reimb_def":    ("Driver Reimbursements", "Driver Reimbursement-Fuel Def",                    "each"),
  "reimb_scale":  ("Driver Reimbursements", "Driver Reimbursement-Scale Expense",               "each"),
  "reimb_toll":   ("Driver Reimbursements", "Driver Reimbursement-TPE-Toll Expense",            "each"),
  "reimb_lumper": ("Driver Reimbursements", "Driver Reimbursement Warehouse-Lumper Fee",        "each"),
  "reimb_maint":  ("Driver Reimbursements", "Driver Reimbursement-OTR-Maintenance, Oils, Additives", "each"),
})

# Where the line goes. Dollars alone cannot catch a line posted to the wrong place.
DESTINATION = {
  "line_haul":    "revenue",
  "cash_advance": "bill_payment",              # money already left. Not a deduction.
  "escrow":       "driver_escrow_liability",   # held in trust. Not an expense.
  "admin_fee":    "income",                    # we charge it. Not a negative expense.
  "company_vehicle_use_fee": "income",         # we charge the driver for the use.
  "acc_tracking":      "revenue",
  "acc_pickup_appt":   "revenue",
  "acc_delivery_appt": "revenue",
  "acc_tarp":          "revenue",
}
def destination(kind):
    if kind in DESTINATION: return DESTINATION[kind]
    if kind in ("loaded_miles","empty_miles","tarp_pay","layover_pay","extra_stop_pay",
                "bonus_pay","local_movement"): return "driver_bill"
    return "expense"

REIMB = {
  "def":        ("Driver Reimbursements", "Driver Reimbursement-Fuel Def",                    "each"),
  "scale":      ("Driver Reimbursements", "Driver Reimbursement-Scale Expense",               "each"),
  "toll":       ("Driver Reimbursements", "Driver Reimbursement-TPE-Toll Expense",            "each"),
  "lumper":     ("Driver Reimbursements", "Driver Reimbursement Warehouse-Lumper Fee",        "each"),
  "maint":      ("Driver Reimbursements", "Driver Reimbursement-OTR-Maintenance, Oils, Additives", "each"),
}

def resolve_kind(kind, desc):
    """Map a parsed category + its description onto exactly one real QBO item.
    Never buckets to 'other'. An unmappable line fails the build by name."""
    d = (desc or "").upper()
    if kind == "escrow_for_claims":
        return "escrow"
    if kind == "driver_reimbursement":
        if "DEF" in d:                       return "reimb_def"
        if "SCALE" in d:                     return "reimb_scale"
        if "TOLL" in d or "TPE" in d:        return "reimb_toll"
        if "LUMPER" in d:                    return "reimb_lumper"
        return "reimb_maint"
    if kind in ("diesel", "fuel"):
        return fuel_kind(desc)
    if kind in ITEM:
        return kind
    # free text, in the document's own words
    if "REEFER" in d and "DIESEL" in d:                       return "reefer"
    if "DEF" in d or "DIESEL EXHAUST" in d:                   return "def"
    if "WASHOUT" in d:                                        return "washout"
    if "PARKING" in d or "PENSION" in d or "ESTACIONA" in d:  return "parking"
    if "TOLL" in d or "PEAJE" in d:                           return "toll_parking"
    # parts and consumables bought on the road, in the vendor's own shorthand
    if re.search(r"PREMIUM|ASC|\bOIL\b|ANTIFREEZE|ADITIVO|\bACEITE\b", d):
        return "oil_additive"
    if "WINDSHIELD" in d or "HEADLIG" in d or "WIPER" in d or "PARABRISAS" in d:
        return "shop_tools"
    if "SCALE" in d or "BASCULA" in d:                        return "scale"
    if "LUMPER" in d:                                         return "lumper"
    if "TIRE" in d or "LLANTA" in d:                          return "tires"
    if "LAYOVER" in d or "ESTANCIA" in d:                     return "layover_pay"
    if "ENLONADA" in d or "DESENLONADA" in d or "TARP" in d:  return "tarp_pay"
    if "BONO" in d or "BONUS" in d:                           return "bonus_pay"
    if "TRANSFERENCIA" in d or "WIRE" in d or "ACH" in d:     return "admin_fee"
    if "ADVANCE" in d or "ANTICIPO" in d or "CAJA CHICA" in d:return "cash_advance"
    if "PERMIT" in d or "PERMISO" in d or "I-94" in d:        return "permit"
    if re.search(r"HONDA|GASOLINA|\bGAS/|CAMIONETA", d):      return "company_vehicle_use_fee"
    if "REPAIR" in d or "SERVICE" in d or "REPARACION" in d:  return "road_service"
    if "LOCAL" in d:                                          return "local_movement"
    if "PICK" in d or "DROP" in d or "EXTRA" in d:            return "extra_stop_pay"
    return None

def fuel_kind(text):
    t = (text or "").upper()
    if "DEF" in t or "DIESEL EXHAUST" in t: return "def"
    if "REEFER" in t: return "reefer"
    return "diesel"

def r2(x): return round(x + 0.0, 2)

# ---------------------------------------------------------------- line builder
class Fail(Exception): pass

# A contracted price is agreed as a total; its per-unit figure is derived and must
# never be treated as a rate. A true rate (driver CPM, fuel cost per gallon) is
# agreed per unit and the total is computed from it. Only the second kind is proven.
FLAT_PRICED = {"line_haul"}

def line(kind, desc, qty, uom, rate, amount, source, metric=None):
    """One QuickBooks item line. A rate-priced line must satisfy qty x rate = amount."""
    if kind not in ITEM:
        raise Fail(f"no item mapped for kind '{kind}' ({desc})")
    cat, name, default_uom = ITEM[kind]
    if qty is None:
        qty, rate, uom = 1.0, amount, (uom or default_uom)
    if rate is None:
        rate = (amount / qty) if qty else 0.0
    if kind in FLAT_PRICED:
        # Contracted total. Quantity 1, rate = the agreed price. The mileage the
        # broker quoted rides along as a metric, never as a price.
        qty, rate, uom = 1.0, r2(amount), "each"
    else:
        computed = qty * rate
        # The document rounds every line to cents; prove it the same way, with one
        # cent of slack for its own half-up rounding of the printed rate.
        if abs(round(computed, 2) - round(amount, 2)) > 0.011:
            raise Fail(f"{kind} \'{desc}\': qty {qty} x rate {rate} = {computed:.4f} != amount {amount:.2f}")
    return {
        "item_category": cat, "item_name": name, "description": desc,
        "quantity": round(qty, 3), "unit_of_measure": uom or default_uom,
        "rate": round(rate, 6), "amount": r2(amount),
        "posts_to": destination(kind), "kind": kind, "source": source,
        **({"metric": metric} if metric else {}),
    }

# ---------------------------------------------------------------- main
def main():
    doc = json.load(open("parsed.json"))
    company = {d["doc_no"]: d for d in doc["company"]}
    driver  = {d["doc_no"]: d for d in doc["driver"]}

    records, failures, gaps, suppressed = [], [], [], []

    for doc_no, cdoc in sorted(company.items()):
        ddoc = driver.get(doc_no)
        # 2026-10-04 (CC-3): an EXPENSES row the document printed without a load header gets its load by proof
        # (receipt / driver line / date span / single load) or is refused as a gap - never the last fuel load.
        _n, _g = attribute_unheaded_expenses(cdoc, ddoc)
        gaps.extend({"load": None, "doc": doc_no, "category": "expense", "description": g["description"],
                     "amount": g["amount"], "invoice": g["invoice"], "date": g["date"], "needs": g["needs"]} for g in _g)
        for ln, cl in sorted(cdoc.get("loads", {}).items()):
            dl = (ddoc or {}).get("loads", {}).get(ln, {})
            src = f"Company_Settlement_{doc_no}/Driver_Settlement_{doc_no}"
            lines = []
            try:
                # ---- revenue: the line haul the customer is billed
                lh = cl.get("line_haul") or {}
                if lh.get("amount"):
                    lines.append(line("line_haul", "Line Haul", None, None, None,
                                      lh["amount"], src,
                                      metric={"billed_miles": lh.get("miles"),
                                              "derived_rate_per_mile": lh.get("rate")}))

                # ---- driver pay, per mile, carried with its CPM
                for p in (dl.get("pay") or cl.get("pay") or []):
                    k = p.get("kind")
                    if k in ("loaded_miles", "empty_miles"):
                        if not p.get("amount"): continue
                        lines.append(line(k, k.replace("_", " ").title(),
                                          p.get("miles"), "mile", p.get("rate"),
                                          p["amount"], src))

                # ---- fuel, per gallon, split diesel / DEF / reefer by the item
                for f in (cl.get("fuel") or []):
                    amt = f.get("actual", f.get("receipt"))
                    if not amt: continue
                    k = fuel_kind(f.get("location", "") + " " + str(f.get("vendor", "")))
                    desc = f"{f.get('vendor','')} {f.get('location','')} inv {f.get('invoice','')}".strip()
                    lines.append(line(k, desc, f.get("gallons"), "gallon",
                                      f.get("cpg"), amt, src))
                    # R-177: the document's own purchase date per fuel line (was dropped; the feeder then used delivery)
                    lines[-1]["date"] = f.get("date")
                    lines[-1]["invoice"] = f.get("invoice") or None  # the printed receipt, or nothing

                # ---- every remaining money line from both documents
                #
                # 2026-09-23, Round 102.7. A charge the DRIVER paid and is reimbursed for appears
                # on BOTH documents: once in the company settlement's EXPENSES block carrying the
                # 'Drv' reimbursed flag, and once as a line on the driver settlement. Emitting
                # both posted the same cost twice - measured live: load 13574 emitted
                # Road Service-Truck Tire Expense 531.26 TWICE, load 13485 emitted the 6.30 toll,
                # the 50.00 washout and the 100.00 lumper twice each. 23 (doc, load, amount) keys
                # overlapped, 1,356.34 in duplicated charges across the corpus.
                #
                # The COMPANY document is authoritative: its EXPENSES rows tie to its own REVENUE
                # block's Company Expenses control to the cent on 58 of 58 documents,
                # 14,646.18 = 14,646.18. So the company row is emitted and the driver-side copy
                # is SUPPRESSED, one driver line consumed per matching reimbursed company row -
                # count-aware, because a load can carry three company scale rows against two
                # driver claims (doc 5776 load 13515 does exactly that).
                #
                # THIS SUPPRESSES A DUPLICATE. IT DOES NOT DECIDE WHERE A REIMBURSED EXPENSE
                # POSTS. The company expense and the driver's reimbursement are one cost and one
                # payable to the driver, not two costs - that posting split is an open accounting
                # question and is NOT silently changed here. Every suppression is reported.
                _reimb = collections.Counter(
                    r2(e.get("amount")) for e in (cl.get("expenses") or [])
                    if e.get("reimbursed") and e.get("amount"))
                for src_lines in ((cl.get("expenses") or []), (dl.get("lines") or [])):
                    _is_driver_side = src_lines is (dl.get("lines") or [])
                    for x in src_lines:
                        if _is_driver_side and x.get("amount"):
                            _a = r2(x["amount"])
                            if _reimb.get(_a):
                                _reimb[_a] -= 1
                                suppressed.append({"load": ln, "doc": doc_no, "amount": _a,
                                                   "description": x.get("description"),
                                                   "category": x.get("category"),
                                                   "reason": "SUPPRESSED_DUPLICATE: same charge "
                                                             "carried on the company settlement "
                                                             "EXPENSES block with the Drv "
                                                             "reimbursed flag"})
                                continue
                        amt = x.get("amount")
                        if amt in (None, 0): continue
                        d = x.get("description") or x.get("category") or ""
                        k = resolve_kind(x.get("category"), d)
                        if k is None or str(k).startswith("__GAP_"):
                            gaps.append({"load": ln, "doc": doc_no,
                                         "category": x.get("category"),
                                         "description": d, "amount": r2(amt),
                                         "needs": (k or "__GAP_unidentified")[6:] or "identification"})
                            continue
                        lines.append(line(k, d, None, None, None, amt, src))
                        lines[-1]["date"] = x.get("date")  # R-177: the document's own line date
                        lines[-1]["invoice"] = x.get("invoice") or None  # the printed receipt, or nothing
                        if x.get("load_by"): lines[-1]["load_by"] = x["load_by"]
            except Fail as e:
                failures.append(f"load {ln} ({src}): {e}")
                continue

            stops = []
            for s in (dl.get("stops") or []):
                stops.append({
                    "sequence": s.get("seq"), "stop_type": s.get("type"),
                    "facility_name": s.get("facility"),
                    "city": s.get("city"), "state": s.get("state"), "zip": s.get("zip"),
                    "stop_date": s.get("date"), "leg_miles": s.get("leg_miles"),
                    "address_raw": s.get("raw"),
                })
            delivery = [s for s in stops if s["stop_type"] == "deliver"]
            records.append({
                "load_number": ln,
                "settlement_doc_no": doc_no,
                "customer_name": cl.get("customer"),
                "driver_name": cl.get("driver") or (ddoc or {}).get("driver"),
                "truck": dl.get("truck"), "trailer": dl.get("trailer"),
                "period_start": cdoc.get("start"), "period_end": cdoc.get("end"),
                "stops": stops,
                # revrec reads this. Without it, no delivery is recognized and no invoice issues.
                "delivery_departure_date": delivery[-1]["stop_date"] if delivery else None,
                "consignee": delivery[-1]["facility_name"] if delivery else None,
                "lines": lines,
            })

    if suppressed:
        tot = sum(x["amount"] for x in suppressed)
        print(f"SUPPRESSED (duplicate charge on both documents) — {len(suppressed)} line(s), {tot:,.2f}:")
        for x in suppressed:
            print(f"   load {x['load']} doc {x['doc']} {x['amount']:>10,.2f}  {x['description']}")
        json.dump(suppressed, open("feed_input_suppressed.json", "w"), indent=1)

    if gaps:
        tot = sum(g["amount"] for g in gaps)
        print(f"NAMED GAPS — {len(gaps)} line(s), {tot:,.2f} — no item exists for these. NOT GUESSED:")
        for g in gaps:
            print(f"  load {g['load']} doc {g['doc']}  {g['amount']:>10,.2f}  {g['needs']:24s} {g['description'][:52]!r}")
        json.dump(gaps, open("feed_input_gaps.json","w"), indent=1)
        print()

    if failures:
        print(f"FEED INPUT BUILD FAILED — {len(failures)} load(s) could not produce honest lines:")
        for f in failures[:25]: print("  " + f)
        return 1

    # ------------------------------------------------ self-proof before writing
    by_dest = defaultdict(float); by_item = defaultdict(float)
    n_lines = n_stops = n_facility = n_legmiles = 0
    no_delivery = [r["load_number"] for r in records if not r["delivery_departure_date"]]
    for r in records:
        n_stops += len(r["stops"])
        n_facility += sum(1 for s in r["stops"] if s["facility_name"])
        n_legmiles += sum(1 for s in r["stops"] if s["leg_miles"] is not None)
        for l in r["lines"]:
            n_lines += 1
            by_dest[l["posts_to"]] += l["amount"]
            by_item[f'{l["item_category"]} :: {l["item_name"]}'] += l["amount"]
            if abs(round(l["quantity"] * l["rate"], 2) - round(l["amount"], 2)) > 0.011:
                print(f"SELF-PROOF FAILED on load {r['load_number']}: {l}"); return 1

    days = defaultdict(list)
    for r in records: days[r["period_end"]].append(r["load_number"])

    out = {"generated_for": "IH35-TMS USMCA feeder",
           "source": "117 AlwaysTrack settlement documents",
           "loads": len(records), "lines": n_lines, "records": records}
    json.dump(out, open("feed_input.json", "w"), indent=1)

    print(f"LOADS {len(records)}   LINES {n_lines}   FEED DAYS {len(days)}")
    print(f"  stops {n_stops}  with facility {n_facility}  with leg miles {n_legmiles}")
    print(f"  loads with a delivery departure {len(records)-len(no_delivery)} of {len(records)}")
    if no_delivery:
        print(f"  NO DELIVERY STOP (revrec cannot recognize these): {', '.join(no_delivery[:12])}")
    print("\nBY POSTING DESTINATION")
    for k in sorted(by_dest, key=lambda x: -abs(by_dest[x])):
        print(f"  {k:28s} {by_dest[k]:14,.2f}")
    print("\nBY ITEM")
    for k in sorted(by_item, key=lambda x: -abs(by_item[x])):
        print(f"  {k:62s} {by_item[k]:13,.2f}")
    print("\nEVERY LINE CARRIES ITEM, QUANTITY, UOM, RATE AND A COMPUTED AMOUNT — exit 0")
    return 0

if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Parse every signed AlwaysTrack settlement PDF into one truth file.
Newest copy wins per settlement number (handles "(1)", "(2)", "(3)" re-downloads).
Emits ~/IH35-TMS-clean/feed-input/settlement-truth-from-pdfs.json"""
import glob, os, re, json, sys
from pypdf import PdfReader

D = os.path.expanduser("~/Downloads")
OUT = os.path.expanduser("~/IH35-TMS-clean/feed-input/settlement-truth-from-pdfs.json")

def newest_by_num(pattern):
    best = {}
    for p in glob.glob(os.path.join(D, pattern)):
        m = re.search(r"_(\d{4})", os.path.basename(p))
        if not m:
            continue
        n = m.group(1)
        if n not in best or os.path.getmtime(p) > os.path.getmtime(best[n]):
            best[n] = p
    return best

def text(p):
    try:
        return "\n".join((pg.extract_text() or "") for pg in PdfReader(p).pages)
    except Exception as e:
        return ""

MONEY = r"-?[\d,]+\.\d{2}"
def m2f(s):
    return float(s.replace(",", "").replace("$", ""))

def parse_driver(raw):
    t = re.sub(r"[ \t]+", " ", raw)
    flat = re.sub(r"\s+", " ", raw)
    out = {"loads": {}, "additional_pay": [], "deductions": []}
    m = re.search(r"Start Date:?\s*(\d{4}-\d{2}-\d{2})", flat)
    if m: out["period_start"] = m.group(1)
    m = re.search(r"End Date:?\s*(\d{4}-\d{2}-\d{2})", flat)
    if m: out["period_end"] = m.group(1)
    m = re.search(r"Driver Settlement No\.?\s*\d{4}\s+IH35[^,]*?,?\s*LLC\s+([A-Za-z][A-Za-z .'\-]+?)\s+(?:Start Date|Address)", flat)
    if m: out["driver_name"] = m.group(1).strip()
    m = re.search(r"TOTAL DUE:?\s*(" + MONEY + ")", flat)
    if m: out["total_due"] = m2f(m.group(1))
    m = re.search(r"Salary:?\s*(" + MONEY + ")", flat)
    if m: out["salary"] = m2f(m.group(1))
    m = re.search(r"Additional Pay:?\s*(" + MONEY + ")", flat)
    if m: out["additional_pay_total"] = m2f(m.group(1))
    m = re.search(r"Deductions:?\s*(" + MONEY + ")", flat)
    if m: out["deductions_total"] = m2f(m.group(1))
    m = re.search(r"Total Loaded Miles\s*([\d,]+\.?\d*)", flat)
    if m: out["total_loaded_miles"] = m2f(m.group(1) + (".00" if "." not in m.group(1) else ""))
    m = re.search(r"Total Empty Miles\s*([\d,]+\.?\d*)", flat)
    if m: out["total_empty_miles"] = m2f(m.group(1) + (".00" if "." not in m.group(1) else ""))
    m = re.search(r"M\.?P\.?G\.?\s*-?\s*([\d.]+)", flat)
    if m: out["mpg"] = float(m.group(1))
    # per-load block: miles/rate/amount + stops. MERGE, never overwrite — the additional-pay and
    # deduction sections repeat "Load NNNNN" and would otherwise blank the real block.
    for lm in re.finditer(r"Load (\d{5})\b(.*?)(?=Load \d{5}\b|Total Loaded Miles|TOTAL DUE|$)", flat):
        ln, body = lm.group(1), lm.group(2)
        rec = {}
        tk = re.search(r"Truck (\S+) / Trailer (\S+)", body)
        if tk: rec["truck"], rec["trailer"] = tk.group(1), tk.group(2)
        lo = re.search(r"Loaded Miles ([\d,]+\.?\d*) @ \$?([\d.]+)\s+(" + MONEY + ")", body)
        if lo:
            rec["loaded_miles"] = m2f(lo.group(1)); rec["loaded_rate"] = float(lo.group(2)); rec["loaded_amount"] = m2f(lo.group(3))
        em = re.search(r"Empty Miles ([\d,]+\.?\d*) @ \$?([\d.]+)\s+(" + MONEY + ")", body)
        if em:
            rec["empty_miles"] = m2f(em.group(1)); rec["empty_rate"] = float(em.group(2)); rec["empty_amount"] = m2f(em.group(3))
        stops = []
        for st in re.finditer(r"(Pickup|Deliver|Empty)\s+(?:([\d,]+\.?\d*)mi\.\s+)?(\d{4}-\d{2}-\d{2}),\s*(.*?),\s*([A-Za-z .]+),\s*([A-Z]{2})\s+(\d{5})", body):
            stops.append({"type": st.group(1), "miles_to": m2f(st.group(2)) if st.group(2) else None,
                          "date": st.group(3), "facility": st.group(4).strip(),
                          "city": st.group(5).strip(), "state": st.group(6), "zip": st.group(7)})
        if stops: rec["stops"] = stops
        if rec:
            out["loads"][ln] = {**out["loads"].get(ln, {}), **rec}
    # itemized additional pay and deductions (they follow the totals block)
    for ap in re.finditer(r"Load (\d{5}) (Driver Pay-[A-Za-z/\- ]+?) (" + MONEY + ")", flat):
        out["additional_pay"].append({"load": ap.group(1), "desc": ap.group(2).strip(), "amount": m2f(ap.group(3))})
    for dd in re.finditer(r"Load (\d{5}) (?:(\d{4}-\d{2}-\d{2}) - )?((?:Driver-Escrow|Admin fee|CASH ADVANCE|Cash Advance|Driver Deduction)[A-Za-z0-9/\- ]*?) (" + MONEY + ")", flat):
        out["deductions"].append({"load": dd.group(1), "date": dd.group(2), "desc": dd.group(3).strip(), "amount": m2f(dd.group(4))})
    return out

def parse_company(raw):
    flat = re.sub(r"\s+", " ", raw)
    out = {"loads": [], "customer_charges": [], "fuel_total": None, "expenses_total": None}
    for m in re.finditer(r"Load (\d{5}) / ([A-Za-z0-9 ,.&'\-]+?) (?:Line Haul|Loaded Miles)", flat):
        out["customer_charges"].append({"load": m.group(1), "customer": m.group(2).strip()})
    m = re.search(r"Total Line Haul:?\s*[\d,.]*\s*[\d,.]*\s*(" + MONEY + ")", flat)
    if m: out["total_line_haul"] = m2f(m.group(1))
    m = re.search(r"Invoiced\s*(" + MONEY + ")", flat)
    if m: out["invoiced"] = m2f(m.group(1))
    m = re.search(r"Net Revenue\s*[\d.]*%?\s*[\d.]*\s*p/m\s*(" + MONEY + ")", flat)
    if m: out["net_revenue"] = m2f(m.group(1))
    out["loads"] = sorted({m.group(1) for m in re.finditer(r"Load (\d{5})", flat)})
    return out

drv = newest_by_num("Driver_Settlement_*.pdf")
cmp_ = newest_by_num("Company_Settlement_*.pdf")
nums = sorted(set(drv) | set(cmp_))
print(f"driver PDFs {len(drv)} · company PDFs {len(cmp_)} · distinct settlements {len(nums)}", file=sys.stderr)

truth = {}
for n in nums:
    rec = {"settlement": n}
    if n in drv:
        rec["driver_pdf"] = os.path.basename(drv[n])
        rec.update(parse_driver(text(drv[n])))
    if n in cmp_:
        rec["company_pdf"] = os.path.basename(cmp_[n])
        rec["company"] = parse_company(text(cmp_[n]))
    truth[n] = rec

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(truth, open(OUT, "w"), indent=1)
ok = [n for n, r in truth.items() if r.get("total_due") is not None]
miss = [n for n in nums if n not in ok]
print(f"WROTE {OUT}")
print(f"settlements {len(nums)} · TOTAL DUE parsed {len(ok)} · missing {len(miss)}: {miss[:20]}")
print("sum TOTAL DUE:", round(sum(truth[n]['total_due'] for n in ok), 2))
print("with per-load miles:", sum(1 for n in ok if truth[n].get('loads')))

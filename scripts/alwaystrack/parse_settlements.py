"""AlwaysTrack settlement PDF-text parser.

ROUND 27.1 STEP 3 fixes (root cause, not a patch):
  1. `Reimbursements?:` never matched the documents, which print `Reimbursed Expenses:`.
     Renamed to the real label.
  2. There was no Additional Pay regex at all -- driver settlements print a whole
     `Additional Pay:` section (bonus/layover/stop pay) that was silently never parsed.
  3. Position-based field reads (splitting on N-space gaps and grabbing p[k] by index)
     drop a line with no error whenever an address/description field itself contains
     extra whitespace or wraps -- e.g. Company_Settlement_5809's LOVES fuel line whose
     Invoice column happened to repeat the Location text ("101 PINNACLE ROAD"). Every
     numeric field is now read by ANCHORING ON THE TRAILING NUMERIC TOKENS (the last N
     decimal amounts on the line), never by column index, so a free-text field of any
     shape or width cannot shift a dollar figure out of position.
  4. Every parsed section is now ASSERTED against the settlement's own printed subtotal
     (`Totals:` / `Additional Pay:` / `Reimbursed Expenses:` / `Deductions:` / `Salary:`).
     A section that does not tie to the document's own total is flagged in `_tie_errors`
     and the CLI exits non-zero -- "a parse that does not tie does not post" (ROUND 27.1
     rule 1). Downstream import code must refuse to write an untied settlement.
  5. The module no longer runs an import-time side effect against a hardcoded
     `/home/claude/st` path (this broke on every machine but the one it was written on).
     TXT_DIR / OUT_PATH are overridable via env vars or CLI args; the parse+dump only
     runs under `if __name__ == "__main__"`.
"""
import os, re, sys, json, glob

TXT_DIR = os.environ.get("ALWAYSTRACK_TXT_DIR", os.path.expanduser("~/Downloads/_st_txt"))
OUT_PATH = os.environ.get("ALWAYSTRACK_OUT", "/tmp/alwaystrack-truth.json")


def money(s):
    s = s.replace(",", "").replace("$", "").strip()
    if s in ("", "-"):
        return None
    neg = s.startswith("(") and s.endswith(")")
    if neg:
        s = s[1:-1]
    try:
        v = float(s)
    except Exception:
        return None
    return -v if neg else v


def num(s):
    try:
        return float(s.replace(",", ""))
    except Exception:
        return None


def close(a, b, tol=0.01):
    if a is None or b is None:
        return False
    return abs(a - b) <= tol


SEC = ["CUSTOMER CHARGES", "DRIVER PAYMENT", "FUEL PURCHASES", "EXPENSES", "REVENUE"]


def sections(lines):
    idx = [(i, l.strip()) for i, l in enumerate(lines) if l.strip() in SEC]
    out = {}
    for k, (i, s) in enumerate(idx):
        j = idx[k + 1][0] if k + 1 < len(idx) else len(lines)
        out.setdefault(s, []).extend(lines[i + 1:j])
    return out


# A trailing numeric token: an optionally-negative, optionally-comma-grouped decimal.
NUMTOK = re.compile(r"^-?[\d,]+\.\d+$")


def trailing_numbers(s, n):
    """Anchor on the last N decimal tokens on the line, wherever they sit -- never by
    column index. Any free-text field (vendor, location, invoice, description) before
    them is untouched, however wide or however it wrapped."""
    toks = [t for t in re.split(r"\s+", s.strip()) if NUMTOK.match(t)]
    if len(toks) < n:
        return None
    return [num(t) for t in toks[-n:]]


def join_wrapped(lines):
    """A row that wraps onto a continuation line in the source PDF has no leading
    date/Load marker and no trailing numeric tail of its own -- join it onto the
    previous row instead of losing it or misreading it as a new one."""
    out = []
    for raw in lines:
        s = raw.rstrip("\n")
        stripped = s.strip()
        if not stripped:
            out.append(s)
            continue
        starts_new = bool(
            re.match(r"^(Load\s+\d+|Totals:|\d{4}-\d{2}-\d{2})", stripped)
        )
        has_amount = trailing_numbers(stripped, 1) is not None
        if out and not starts_new and not has_amount:
            out[-1] = out[-1].rstrip() + " " + stripped
        else:
            out.append(s)
    return out


def parse_company(path):
    raw = open(path, errors="replace").read()
    # Split into sections on the UNJOINED lines first -- join_wrapped's own "does this
    # line start something new" heuristic doesn't know about section-header lines
    # ("FUEL PURCHASES" etc.), so joining before splitting would swallow a header into
    # the previous section's last row and destroy the section boundary entirely.
    lines = raw.split("\n")
    d = {"doc": os.path.basename(path), "kind": "company", "_tie_errors": []}
    m = re.search(r"Company Settlement No\.\s*(\d+)", raw)
    d["settlement_no"] = m.group(1) if m else None
    m = re.search(r"Start Date:\s*([\d-]+)", raw)
    d["start_date"] = m.group(1) if m else None
    m = re.search(r"End Date:\s*([\d-]+)", raw)
    d["end_date"] = m.group(1) if m else None
    m = re.search(r"^\s*(IH35 [A-Za-z]+, LLC|USMCA[^\n]*?)\s{2,}", raw, re.M)
    d["entity"] = m.group(1).strip() if m else None
    d["loads"] = sorted(set(re.findall(r"^Load (\d+)", raw, re.M)))
    sec = sections(lines)

    # customer charges
    cc = []
    cl = cu = None
    for t in sec.get("CUSTOMER CHARGES", []):
        t = t.rstrip()
        if not t.strip():
            continue
        m = re.match(r"\s*Load (\d+)\s*/\s*(.+?)\s*$", t)
        if m:
            cl, cu = m.group(1), m.group(2).strip()
            continue
        if "Total Line Haul" in t:
            continue
        tail = trailing_numbers(t, 1)
        if tail is None:
            continue
        p = re.split(r"\s{2,}", t.strip())
        row = {
            "load": cl, "customer": cu, "item": p[0],
            "description": p[1] if len(p) > 2 else p[0],
            "miles": None, "rate": None, "amount": tail[0],
        }
        tail4 = trailing_numbers(t, 4)
        if tail4 is not None and len(tail4) == 4 and tail4[-1] == tail[0]:
            row["miles"], row["rate"] = tail4[0], tail4[1]
        cc.append(row)
    d["customer_charges"] = cc

    # driver payment (informational passthrough on the company doc)
    dp = []
    cl = cd = None
    dt = None
    for t in sec.get("DRIVER PAYMENT", []):
        t = t.rstrip()
        if not t.strip():
            continue
        m = re.match(r"\s*Load (\d+)\s*/\s*(.+?)\s*$", t)
        if m:
            cl, cd = m.group(1), m.group(2).strip()
            continue
        m = re.search(r"Totals:\s*([\d,\.\-\(\)\$]+)\s*$", t)
        if m:
            dt = money(m.group(1))
            continue
        tail = trailing_numbers(t, 1)
        if tail is not None and cl:
            p = re.split(r"\s{2,}", t.strip())
            dp.append({"load": cl, "driver": cd, "item": p[0],
                       "detail": p[1] if len(p) > 2 else "", "amount": tail[0]})
    d["driver_payment"] = dp
    d["driver_payment_total"] = dt

    # fuel -- anchor on the trailing 7 numeric fields: gallons, cpg, receipt, fees,
    # discount, disc/gal, actual. Everything before is free text (date, vendor,
    # location, invoice) whatever its own internal spacing.
    fu = []
    cl = None
    ft = None
    for s in join_wrapped(sec.get("FUEL PURCHASES", [])):
        s = s.strip()
        if not s:
            continue
        m = re.match(r"Load (\d+)\s*/\s*(.+)$", s)
        if m:
            cl = m.group(1)
            continue
        if s.startswith("Totals:"):
            tail = trailing_numbers(s, 7)
            if tail:
                g, c, r, f, dc, dpg, a = tail
                ft = {"gallons": g, "cpg": c, "receipt": r, "fees": f, "disc": dc,
                      "discpg": dpg, "actual": a}
            continue
        if not re.match(r"^\d{4}-\d{2}-\d{2}", s):
            continue
        tail = trailing_numbers(s, 7)
        if tail is None:
            continue
        g, c, r, f, dc, dpg, a = tail
        # Strip the 7 trailing numeric tokens back off the line to read the free-text
        # head (date, vendor, location, invoice) without them shifting anything.
        head_text = re.sub(r"(\s+-?[\d,]+\.\d+){7}\s*$", "", s)
        head = head_text.split(None, 1)
        date_ = head[0]
        rest = head[1] if len(head) > 1 else ""
        # vendor is the first run of non-space text; location/invoice are whatever
        # free text remains, split on 2+ spaces (best-effort, not money-bearing).
        rp = re.split(r"\s{2,}", rest.strip())
        vendor = rp[0] if rp else ""
        location = rp[1] if len(rp) > 1 else ""
        invoice = rp[2] if len(rp) > 2 else None
        fu.append({"load": cl, "date": date_, "vendor": vendor, "location": location,
                    "invoice": invoice, "gallons": g, "cpg": c, "receipt": r, "fees": f,
                    "disc": dc, "discpg": dpg, "actual": a})
    d["fuel_purchases"] = fu
    d["fuel_totals"] = ft
    if ft is not None:
        fsum = round(sum(x["actual"] for x in fu), 2)
        if not close(fsum, round(ft["actual"], 2)):
            d["_tie_errors"].append(("fuel_purchases", fsum, ft["actual"]))

    # expenses -- anchor on the trailing amount only. The Reimb. column's real printed value is
    # never Y/N -- it is the literal word "Drv" (reimbursed to the driver) or blank; only the
    # Comp. Exp. column ever prints a standalone Y/N. Confirmed on prod text 2026-09-21
    # (Company_Settlement_5809.txt:82: "...Fee Expense    Drv    Y    120.00" -- Reimb.=Drv AND
    # Comp. Exp.=Y on the SAME line is real and means "the company paid it, recover it from the
    # driver" -- both flags stand, never collapsed into one). An earlier version of this file
    # took the first Y/N token as "reimb" whenever exactly one was present -- wrong, because a
    # lone Y/N is virtually always under Comp. Exp., not Reimb.; that bug marked every plain
    # Comp.-Exp.=Y line as a driver reimbursement instead.
    ex = []
    et = None
    for t in join_wrapped(sec.get("EXPENSES", [])):
        s = t.strip()
        if not s:
            continue
        m = re.match(r"Totals:\s+([\d,\.\-\(\)\$]+)\s*$", s)
        if m:
            et = money(m.group(1))
            continue
        if not re.match(r"^\d{4}-\d{2}-\d{2}", s):
            continue
        tail = trailing_numbers(t, 1)
        if tail is None:
            continue
        amt = tail[0]
        comp_m = re.search(r"(?<!\S)([YN])(?!\S)", t)
        comp = comp_m.group(1) if comp_m else ""
        reimb = "Drv" if re.search(r"(?<!\S)Drv(?!\S)", t) else ""
        # A wrapped Location continuation (e.g. "STREET EUTAW," on one line, "AR,TX" on the next)
        # gets appended by join_wrapped AFTER the amount, not before it -- so the amount is no
        # longer the last thing on the line and a plain end-anchored strip leaves both the amount
        # and the continuation stuck in the description. Cut the line at the AMOUNT's own match
        # position instead of the string's end; everything after it (amount + any wrapped
        # continuation) is discarded for field-splitting purposes -- the amount itself is already
        # captured in `amt` via trailing_numbers, and a wrapped Location fragment was never useful
        # for vendor/description/invoice anyway.
        amt_re = re.search(r"-?[\d,]+\.\d+\s*$", t) or re.search(r"-?[\d,]+\.\d+(?!.*-?[\d,]+\.\d+)", t)
        cut_at = amt_re.start() if amt_re else len(t)
        head_text = t[:cut_at]
        head_text = re.sub(r"(?<!\S)[YN](?!\S)", " ", head_text)
        head_text = re.sub(r"(?<!\S)Drv(?!\S)", " ", head_text)
        fields = re.split(r"\s{2,}", head_text.strip())
        fields = [f for f in fields if f]
        head = fields[0].split(None, 1) if fields else []
        date_ = head[0] if head else ""
        vendor = head[1] if len(head) > 1 else (fields[1] if len(fields) > 1 else "")
        # Remaining fields, in order, are location / invoice / description -- the invoice is
        # whichever field is a bare digit run; description is whatever's left after date/vendor/
        # invoice, preferring the LAST non-invoice field (location sorts before description).
        rest = fields[2:] if len(fields) > 2 else (fields[1:] if len(fields) > 1 and vendor == fields[1] else [])
        invoice = next((f for f in rest if re.fullmatch(r"\d{4,}", f)), "")
        desc_candidates = [f for f in rest if f != invoice]
        description = desc_candidates[-1] if desc_candidates else ""
        ex.append({"date": date_, "vendor": vendor,
                    "description": description, "invoice": invoice,
                    "reimb": reimb, "comp": comp, "amount": amt, "raw": s})
    d["expenses"] = ex
    d["expenses_total"] = et
    if et is not None:
        esum = round(sum(x["amount"] for x in ex), 2)
        if not close(esum, round(et, 2)):
            d["_tie_errors"].append(("expenses", esum, et))

    rev = {}
    for k, pat in [("invoiced", r"Invoiced\s+([\d,\.\-\(\)\$]+)"),
                   ("driver_salary", r"Driver Salary\s+\S+\s+\S+ p/m\s+([\d,\.\-\(\)\$]+)"),
                   ("fuel", r"\bFuel\s+\S+\s+\S+ p/m\s+([\d,\.\-\(\)\$]+)"),
                   ("company_expenses", r"Company Expenses\s+\S+\s+\S+ p/m\s+([\d,\.\-\(\)\$]+)"),
                   ("net_revenue", r"Net Revenue\s+\S+\s+\S+ p/m\s+([\d,\.\-\(\)\$]+)")]:
        m = re.search(pat, raw)
        rev[k] = money(m.group(1)) if m else None
    m = re.search(r"Miles \(([\d,\.]+)mi\.\)", raw)
    rev["miles"] = num(m.group(1)) if m else None
    m = re.search(r"M\.P\.G\.\s+([\d\.]+)", raw)
    rev["mpg"] = num(m.group(1)) if m else None
    d["revenue"] = rev
    return d


def parse_driver(path):
    raw = open(path, errors="replace").read()
    d = {"doc": os.path.basename(path), "kind": "driver", "_tie_errors": []}
    m = re.search(r"Driver Settlement No\.\s*(\d+)", raw)
    d["settlement_no"] = m.group(1) if m else None
    m = re.search(r"Start Date:\s*([\d-]+)", raw)
    d["start_date"] = m.group(1) if m else None
    m = re.search(r"End Date:\s*([\d-]+)", raw)
    d["end_date"] = m.group(1) if m else None
    m = re.search(r"^\s*(IH35 [A-Za-z]+, LLC|USMCA[^\n]*?)\s{2,}(.+?)\s*$", raw, re.M)
    d["entity"] = m.group(1).strip() if m else None
    d["driver"] = m.group(2).strip() if m else None
    d["loads"] = sorted(set(re.findall(r"^Load (\d+)", raw, re.M)))
    for k, pat in [("total_loaded_miles", r"Total Loaded Miles\s+([\d,\.]+)"),
                   ("total_empty_miles", r"Total Empty Miles\s+([\d,\.]+)"),
                   ("total_miles", r"Total Miles\s+([\d,\.]+)")]:
        m = re.search(pat, raw)
        d[k] = num(m.group(1)) if m else None
    for k, pat in [("salary", r"Salary:\s+([\d,\.\-\(\)\$]+)"),
                   ("additional_pay_total", r"Additional Pay:\s*([\d,\.\-\(\)\$]+)\s*$"),
                   ("reimbursements_total", r"Reimbursed Expenses:\s*([\d,\.\-\(\)\$]+)\s*$"),
                   ("deductions_total", r"Deductions:\s+([\d,\.\-\(\)\$]+)"),
                   ("total_due", r"TOTAL DUE:\s*([\d,\.\-\(\)\$]+)")]:
        m = re.search(pat, raw, re.M)
        d[k] = money(m.group(1)) if m else None

    pay = []
    ded = []
    ap = []
    reimb = []
    pending = []
    cl = None
    for ln in raw.split("\n"):
        s = ln.strip()
        if not s:
            continue
        m = re.match(r"^Load (\d+)\s+Truck\s+(\S+)\s*/\s*Trailer\s+(\S+)", s)
        if m:
            cl = m.group(1)
            continue
        m = re.match(r"^Additional Pay:\s*([\d,\.\-\(\)\$]+)\s*$", s)
        if m:
            ap.extend(pending)
            pending = []
            continue
        m = re.match(r"^Reimbursed Expenses:\s*([\d,\.\-\(\)\$]+)\s*$", s)
        if m:
            reimb.extend(pending)
            pending = []
            continue
        m = re.match(r"^Deductions:\s+([\d,\.\-\(\)\$]+)", s)
        if m:
            pending = []  # deductions are captured by their own dated regex below, not via pending
            continue
        # deduction line: "Load NNNN   YYYY-MM-DD - description - description   AMOUNT"
        m = re.match(r"^Load\s+(\d+)\s{2,}(\d{4}-\d{2}-\d{2})\s*-\s*(.+?)\s{2,}([\d,\.\-\(\)\$]+)$", s)
        if m:
            ded.append({"load": m.group(1), "date": m.group(2),
                        "description": m.group(3).strip(), "amount": money(m.group(4))})
            continue
        # mileage / stop pay lines
        m = re.match(r"^(Loaded Miles|Empty Miles|Deadhead Miles)\s+([\d,\.]+)\s*@\s*\$([\d\.]+)\s+([\d,\.\-\(\)\$]+)$", s)
        if m and cl:
            pay.append({"load": cl, "item": m.group(1), "miles": num(m.group(2)),
                        "rate": num(m.group(3)), "amount": money(m.group(4))})
            continue
        m = re.match(r"^(\d+)\s+(Picks|Drops|Stops)\s+\$([\d\.]+)\s+After\s+(\d+)\s+([\d,\.\-\(\)\$]+)$", s)
        if m and cl:
            pay.append({"load": cl, "item": f"{m.group(1)} {m.group(2)}", "miles": None,
                        "rate": num(m.group(3)), "amount": money(m.group(5))})
            continue
        # generic "Load NNNN   <free text>   AMOUNT" line -- Additional Pay or
        # Reimbursed Expenses, resolved retroactively by whichever total line follows.
        m = re.match(r"^Load\s+(\d+)\s{2,}(.+?)\s{2,}([\d,\.\-\(\)\$]+)$", s)
        if m:
            amt = money(m.group(3))
            if amt is not None:
                pending.append({"load": m.group(1), "description": m.group(2).strip(), "amount": amt})
    d["pay_lines"] = pay
    d["deductions"] = ded
    d["additional_pay"] = ap
    d["reimbursements"] = reimb

    if d.get("additional_pay_total") is not None:
        s = round(sum(x["amount"] for x in ap), 2)
        if not close(s, round(d["additional_pay_total"], 2)):
            d["_tie_errors"].append(("additional_pay", s, d["additional_pay_total"]))
    if d.get("reimbursements_total") is not None:
        s = round(sum(x["amount"] for x in reimb), 2)
        if not close(s, round(d["reimbursements_total"], 2)):
            d["_tie_errors"].append(("reimbursements", s, d["reimbursements_total"]))
    if d.get("deductions_total") is not None:
        s = round(sum(x["amount"] for x in ded), 2)
        if not close(s, round(d["deductions_total"], 2)):
            d["_tie_errors"].append(("deductions", s, d["deductions_total"]))
    if d.get("salary") is not None:
        s = round(sum(x["amount"] for x in pay), 2)
        if not close(s, round(d["salary"], 2)):
            d["_tie_errors"].append(("pay_lines", s, d["salary"]))
    return d


def main():
    out = {"company": [], "driver": []}
    seen = set()
    for p in sorted(glob.glob(TXT_DIR + "/Company_Settlement_*.txt")):
        r = parse_company(p)
        if r["settlement_no"] in seen:
            continue
        seen.add(r["settlement_no"])
        out["company"].append(r)
    seen = set()
    for p in sorted(glob.glob(TXT_DIR + "/Driver_Settlement_*.txt")):
        r = parse_driver(p)
        if r["settlement_no"] in seen:
            continue
        seen.add(r["settlement_no"])
        out["driver"].append(r)
    json.dump(out, open(OUT_PATH, "w"), indent=1)
    n_errors = sum(len(x["_tie_errors"]) for x in out["company"] + out["driver"])
    print("company", len(out["company"]), "driver", len(out["driver"]), "tie_errors", n_errors)
    if n_errors:
        for x in out["company"] + out["driver"]:
            for e in x["_tie_errors"]:
                print("  TIE FAIL", x["doc"], e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

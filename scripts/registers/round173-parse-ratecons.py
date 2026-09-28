#!/usr/bin/env python3
import re, os, glob, json

DIR = "/tmp/round173-pdftext"
files = sorted(glob.glob(os.path.join(DIR, "loads_*.txt")))

results = []

for path in files:
    with open(path, errors="replace") as f:
        text = f.read()
    fname = os.path.basename(path)
    refs = set()
    customer = None
    rate = None
    fmt = None

    # Format A: Alvys/Refrigerx-style "Trip: X | Order#: Y | PO#: Z | Date:"
    m = re.search(r"^(.*?)\s+Trip:\s*([\w\-/ ]+?)\s*\|\s*Order#:\s*([\w\-/ ]+?)\s*\|\s*PO#:\s*([\w\-/ ]+?)\s*\|\s*Date:", text, re.M)
    if m:
        fmt = "alvys"
        customer = m.group(1).strip()
        for grp in (2, 3, 4):
            for tok in re.split(r"[\s/]+", m.group(grp).strip()):
                if tok:
                    refs.add(tok)
        rm = re.search(r"TOTAL COST\s+\$?([\d,]+\.\d{2})", text)
        if rm:
            rate = rm.group(1)

    # Format B: "PRO # 66607 ... Rate Confirmation" (Hawkeye/OnPoint template)
    if not fmt:
        m = re.search(r"PRO\s*#\s*([A-Za-z0-9\-]+)\s+Rate Confirmation", text)
        if m:
            fmt = "pro"
            refs.add(m.group(1).strip())
            # customer/broker name: look for a company block near top (all-caps line before "MC:")
            cm = re.search(r"^\s*([A-Z][A-Z0-9 &.,'/-]{3,40})\s*$\n\s*MC:\s*\d+", text, re.M)
            if cm:
                customer = cm.group(1).strip()
            rm = re.search(r"TOTAL RATE\s+\$?([\d,]+\.\d{2})", text)
            if rm:
                rate = rm.group(1)
            else:
                rm2 = re.search(r"LINE HAUL RATE\s+\$?([\d,]+\.\d{2})", text)
                if rm2:
                    rate = rm2.group(1)

    # Format C: "RATE CONFIRMATION : SEM12345" (Semares template)
    if not fmt:
        m = re.search(r"RATE CONFIRMATION\s*:\s*([A-Za-z0-9\-]+)", text)
        if m:
            fmt = "semares"
            refs.add(m.group(1).strip())
            rm = re.search(r"RATE:\s*\$?([\d,]+\.\d{2})", text)
            if rm:
                rate = rm.group(1)
            # customer = the company name printed just below the ref line (before "STOP 1")
            cm = re.search(r"RATE CONFIRMATION\s*:\s*[A-Za-z0-9\-]+.*?\n\s*\n?\s*(.+?)\n\s*(.+?)\n", text)
            if cm:
                customer = cm.group(1).strip()

    # Fallback: try to find any "PO#"/"PO #"/"WO#" style refs anywhere
    for rm in re.finditer(r"\b(?:PO\s*#|PO#|WO\s*#|Trip:|PRO\s*#)\s*[:#]?\s*([A-Za-z0-9\-/]+)", text):
        refs.add(rm.group(1).strip())

    results.append({
        "file": fname,
        "format": fmt,
        "refs": sorted(refs),
        "customer": customer,
        "rate": rate,
    })

with open("/tmp/round173-pdftext/parsed.json", "w") as f:
    json.dump(results, f, indent=2)

for r in results:
    print(r["file"], "|", r["format"], "|", r["customer"], "|", r["rate"], "|", r["refs"])

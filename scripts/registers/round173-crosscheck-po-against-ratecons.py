#!/usr/bin/env python3
import re, os, glob, json

with open("/tmp/round173-loads.json") as f:
    loads = json.load(f)

pdf_files = sorted(glob.glob("/tmp/round173-pdftext/loads_*.txt"))
pdf_text = {}
for p in pdf_files:
    with open(p, errors="replace") as f:
        pdf_text[os.path.basename(p)] = f.read()

def extract_context(text, ref):
    # find broker/customer hint: first non-blank, non-numeric line of the doc (rough heuristic)
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    head = " | ".join(lines[:3])
    # rate hints
    rate = None
    for pat in [r"TOTAL COST\s+\$?([\d,]+\.\d{2})", r"TOTAL RATE\s+\$?([\d,]+\.\d{2})",
                r"RATE:\s*\$?([\d,]+\.\d{2})", r"Rate:\s*\$?([\d,]+\.\d{2})",
                r"Carrier Pay[^\d]*\$?([\d,]+\.\d{2})", r"LINE HAUL RATE\s+\$?([\d,]+\.\d{2})"]:
        m = re.search(pat, text)
        if m:
            rate = m.group(1)
            break
    return head, rate

results = []
for l in loads:
    for field in ("customer_wo_number", "customer_po_number"):
        ref = l.get(field)
        if not ref or len(ref) < 3:
            continue
        matches = []
        for fname, text in pdf_text.items():
            if ref in text:
                head, rate = extract_context(text, ref)
                matches.append({"file": fname, "head": head, "rate": rate})
        if matches:
            results.append({
                "load_number": l["load_number"],
                "field": field,
                "ref": ref,
                "neon_customer": l["customer_name"],
                "neon_rate_cents": None,
                "matches": matches,
            })

with open("/tmp/round173-pdftext/crosscheck.json", "w") as f:
    json.dump(results, f, indent=2)

print(f"loads with a PO/WO found in a rate-con PDF: {len(results)}")
for r in results:
    print(r["load_number"], r["field"], r["ref"], "| Neon:", r["neon_customer"], "| PDF matches:", [(m["file"], m["head"][:60], m["rate"]) for m in r["matches"]])

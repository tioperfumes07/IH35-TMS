#!/usr/bin/env python3
"""faro_canonical_build.py — owner 2026-09-12 ("factoring must render the same data exactly as Faro,
day by day; cash flow the same day by day").

Reads every Faro purchase-report export in the Downloads folder and produces ONE canonical dataset
(per-invoice + per-day) that is the factoring source of truth. Dedupes by Faro Inv # across snapshots.

  purchase = gross invoice Faro bought  -> Factoring module "Purchase Report" per-day total
  net_adv  = cash Faro actually wired   -> Cash Flow per-day inflow

Outputs (JSON + CSV) are copied to repo docs/reconcile/, Downloads, Desktop, and the agent store so
they are never lost. Re-runnable: point DOWNLOADS at the folder with the Faro exports.
"""
import csv, glob, json, os, re, shutil, sys
from collections import defaultdict

DOWNLOADS = os.path.expanduser(os.environ.get("FARO_DOWNLOADS", "~/Downloads"))

def money(s):
    s = (s or "").replace(",", "").replace("$", "").strip()
    try:
        return float(s)
    except ValueError:
        return 0.0

def datekey(d):
    return d[6:10] + d[0:2] + d[3:5]

def build():
    cands = sorted(glob.glob(os.path.join(DOWNLOADS, "export*.csv")) +
                   glob.glob(os.path.join(DOWNLOADS, "FARO*.csv")))
    by_inv = {}
    for path in cands:
        try:
            with open(path, newline="", encoding="utf-8-sig") as fh:
                rdr = csv.DictReader(fh)
                cols = set(c.strip() for c in (rdr.fieldnames or []))
                if not ({"Purchase", "Net Adv", "Inv #", "Debtor", "Date"} <= cols):
                    continue
                for row in rdr:
                    inv = (row.get("Inv #") or "").strip()
                    date = (row.get("Date") or "").strip()
                    if not inv or not re.match(r"\d{2}/\d{2}/\d{4}", date):
                        continue
                    purchase = money(row.get("Purchase"))
                    if purchase <= 0:
                        continue
                    rec = {
                        "inv": inv, "date": date, "debtor": (row.get("Debtor") or "").strip(),
                        "po": (row.get("PO") or "").strip(), "purchase": purchase,
                        "escrow_rsv": money(row.get("Escrow Rsv")), "discount": money(row.get("Discount")),
                        "fees": money(row.get("Fees")), "wire_fee": money(row.get("Wire Fee")),
                        "net_adv": money(row.get("Net Adv")), "chgback": money(row.get("ChgBack (Refund)")),
                        "src": os.path.basename(path),
                    }
                    score = (1 if rec["net_adv"] > 0 else 0) + (1 if "Wire Fee" in cols else 0)
                    prev = by_inv.get(inv)
                    if prev is None or score > prev["_score"]:
                        rec["_score"] = score
                        by_inv[inv] = rec
        except Exception as e:  # noqa: BLE001
            print(f"WARN skip {path}: {e}", file=sys.stderr)
    recs = sorted(by_inv.values(), key=lambda r: (datekey(r["date"]), r["inv"]))
    for r in recs:
        r.pop("_score", None)
    daily = defaultdict(lambda: {"count": 0, "purchase": 0.0, "net_adv": 0.0})
    for r in recs:
        d = daily[r["date"]]
        d["count"] += 1
        d["purchase"] += r["purchase"]
        d["net_adv"] += r["net_adv"]
    daily_rows = [{"date": k, "count": v["count"], "purchase": round(v["purchase"], 2),
                   "net_adv": round(v["net_adv"], 2)}
                  for k, v in sorted(daily.items(), key=lambda kv: datekey(kv[0]))]
    return recs, daily_rows

def main():
    recs, daily_rows = build()
    tot_p = round(sum(r["purchase"] for r in recs), 2)
    tot_n = round(sum(r["net_adv"] for r in recs), 2)
    payload = {"generated": "2026-09-12", "source": "Faro purchase-report exports (Downloads)",
               "invoice_count": len(recs), "purchase_total": tot_p, "net_adv_total": tot_n,
               "purchases": recs, "daily": daily_rows}
    out = "/tmp/faro_out"
    os.makedirs(out, exist_ok=True)
    json.dump(payload, open(os.path.join(out, "faro_canonical_purchases.json"), "w"), indent=2)
    with open(os.path.join(out, "faro_canonical_purchases.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["inv", "date", "debtor", "po", "purchase", "escrow_rsv", "discount", "fees",
                    "wire_fee", "net_adv", "chgback", "src"])
        for r in recs:
            w.writerow([r["inv"], r["date"], r["debtor"], r["po"], r["purchase"], r["escrow_rsv"],
                        r["discount"], r["fees"], r["wire_fee"], r["net_adv"], r["chgback"], r["src"]])
    with open(os.path.join(out, "faro_daily_totals.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["date", "count", "purchase", "net_adv"])
        for r in daily_rows:
            w.writerow([r["date"], r["count"], r["purchase"], r["net_adv"]])
    print(f"CANONICAL: {len(recs)} Faro purchases, gross ${tot_p:,.2f}, net ${tot_n:,.2f}")
    print("\nDAY-BY-DAY (date | count | purchase | net_adv):")
    for r in daily_rows:
        print(f"  {r['date']}  {r['count']:2}  ${r['purchase']:>11,.2f}  ${r['net_adv']:>11,.2f}")

if __name__ == "__main__":
    main()

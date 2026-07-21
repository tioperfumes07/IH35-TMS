#!/usr/bin/env python3
"""Publish 2026-07-21 live block audit piles + report from draft JSON."""
from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DRAFT = Path("/tmp/ih35-audit-piles-draft.json")
OUT_JSON = ROOT / "docs/trackers/block-audit-piles-2026-07-21.json"
OUT_MD = ROOT / "docs/trackers/LIVE-AUDIT-REPORT-2026-07-21.md"


def main() -> None:
    draft = json.loads(DRAFT.read_text())
    draft["neon_prod_proof"].update(
        {
            "driver_finance_settlements_rows": 0,
            "driver_finance_deductions_rows": 0,
            "driver_finance_disputes_rows": 0,
            "payroll_settlements_rows": 0,
            "bills_null_amount_rows": 0,
            "recon_runs_rows": 173,
            "drivers_rows_rls_bypass": 178,
            "zero_row_settlement_window_still_open": True,
        }
    )
    for item in draft["items"]:
        if item["block_id"] == "RECON-01":
            item["pile"] = "BUILT"
            item["evidence"] = "prod-recon_runs=173|" + item["evidence"]
    draft["totals"] = dict(Counter(i["pile"] for i in draft["items"]))
    assert sum(draft["totals"].values()) == 1185, draft["totals"]
    draft["generated_at"] = datetime.now(timezone.utc).isoformat()
    OUT_JSON.write_text(json.dumps(draft, indent=2) + "\n")

    gaps = [i for i in draft["items"] if i["pile"] == "GAP"]
    owner = [i for i in draft["items"] if i["pile"] == "NEEDS-OWNER"]
    np = [i for i in draft["items"] if i["pile"] == "NEEDS-PROD"]
    t = draft["totals"]

    md: list[str] = []
    md.append("# LIVE BLOCK AUDIT — 2026-07-21")
    md.append("")
    md.append(f"**Base SHA:** `{draft['base_sha']}`  ")
    lag = "LAG behind main" if draft.get("deploy_lag") else "current"
    md.append(f"**Deploy SHA:** `{draft['deploy_sha']}` ({lag})  ")
    md.append(
        "**Neon:** `br-fancy-credit-akjnd07a` read-only + `app.bypass_rls=lucia`  "
    )
    md.append(f"**Generated:** {draft['generated_at']}")
    md.append("")
    md.append("## Headline (active reconciler universe = 1,185)")
    md.append("")
    md.append("| Pile | Count | Meaning |")
    md.append("|---|---:|---|")
    md.append(
        f"| BUILT | {t.get('BUILT', 0)} | Done & wired (reconcile DONE + settlement foundation flips) |"
    )
    md.append(f"| GAP | {t.get('GAP', 0)} | Real need-to-build / fix |")
    md.append(
        f"| NEEDS-PROD | {t.get('NEEDS-PROD', 0)} | Still needs remaining live DQ/flag checks |"
    )
    md.append(
        f"| NEEDS-OWNER | {t.get('NEEDS-OWNER', 0)} | Financial/gated — Jorge decision |"
    )
    md.append(
        f"| NOISE | {t.get('NOISE', 0)} | Registry junk / enterprise N/A / AUDIT-NOTE inflation |"
    )
    md.append(f"| **SUM** | **{sum(t.values())}** | Must equal 1,185 |")
    md.append("")
    md.append("### vs Jul-20 external artifact (DO NOT REUSE)")
    md.append("")
    md.append("| | Jul-20 (artifact) | Today (live) |")
    md.append("|---|---:|---:|")
    md.append(f"| BUILT | 453 | {t.get('BUILT', 0)} |")
    md.append(f"| GAP | 202 | {t.get('GAP', 0)} |")
    md.append(f"| NEEDS-PROD | 105 | {t.get('NEEDS-PROD', 0)} |")
    md.append(f"| NOISE | 583 | {t.get('NOISE', 0)} |")
    md.append("| Denominator | ~1,368 raw | **1,185 active** |")
    md.append("")
    md.append(
        "Jul-20 piles were never committed; sum didn’t even hit 1,368 cleanly. "
        "Today’s numbers are derived from `block-reconciliation-data.json` + "
        "settlement PR overlay + Neon schema/row proofs."
    )
    md.append("")
    md.append("## Neon live proofs (this session)")
    md.append("")
    for k, v in draft["neon_prod_proof"].items():
        md.append(f"- `{k}` = `{v}`")
    md.append("")
    md.append("## Settlement foundation flips → BUILT")
    md.append("")
    for x in draft.get("settlement_flipped_built", []):
        md.append(f"- `{x}`")
    md.append("")
    md.append(
        "Also confirmed on Neon: payment idempotency cols, auto-deduction link col, "
        "team-split override cols. Settlement ledgers still **0 rows** (window open)."
    )
    md.append("")
    md.append("## Critical GAPs (owner priority)")
    md.append("")
    for c in draft.get("critical_gaps", []):
        md.append(f"### {c['id']} — {c['severity']}")
        md.append(
            "- Blocks: " + ", ".join(f"`{b}`" for b in c["block_ids"])
        )
        md.append(f"- Proof: {c['proof']}")
        md.append(f"- Recommendation: {c['rec']}")
        md.append("")
    md.append(f"## Full GAP list ({len(gaps)} after RECON-01 flip)")
    md.append("")
    for g in sorted(gaps, key=lambda x: (0 if x.get("fin") else 1, x["block_id"])):
        evid = (g.get("evidence") or "")[:120]
        md.append(
            f"- `{g['block_id']}` · fin={g.get('fin')} · "
            f"{g.get('status_reconcile')} · {evid}"
        )
    md.append("")
    md.append(f"## NEEDS-OWNER ({len(owner)}) — gated")
    md.append("")
    for g in sorted(owner, key=lambda x: x["block_id"]):
        md.append(f"- `{g['block_id']}`")
    md.append("")
    md.append(f"## NEEDS-PROD remaining ({len(np)})")
    md.append("")
    md.append(
        "Still open for DQ/flag batches (not all resolved this pass). "
        "Top financial seeds from backlog `needs_live`. Full list in JSON "
        "`items` where `pile=NEEDS-PROD`."
    )
    md.append("")
    md.append("## Method caveats")
    md.append("")
    md.append(draft.get("caveat", ""))
    md.append("")
    md.append("Machine artifact: `docs/trackers/block-audit-piles-2026-07-21.json`")
    OUT_MD.write_text("\n".join(md) + "\n")
    print("wrote", OUT_JSON)
    print("wrote", OUT_MD)
    print("totals", draft["totals"])
    print("gaps", len(gaps), "needs_prod", len(np), "owner", len(owner))


if __name__ == "__main__":
    main()

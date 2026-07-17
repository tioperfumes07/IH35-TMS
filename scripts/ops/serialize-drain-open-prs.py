#!/usr/bin/env python3
"""Detox open guard PRs: remove package.json + locked-guards.yml thrash.

Post-#2684 law: wire via verify-steps ONLY. Hot files must match main.
Then serialize-merge without package.json conflicts forever.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

REPO = "https://github.com/tioperfumes07/IH35-TMS.git"
COORD = Path("/Users/jorgemunoz/IH35-TMS/.worktrees/coord-main")
WORK = Path("/tmp/ih35-detox-drain")
THRASH_TAKE_MAIN = [
    "package.json",
    ".github/workflows/locked-guards.yml",
    # ci.yml only if the only delta is npm run verify:X — we reset to main too when detoxing
    ".github/workflows/ci.yml",
]

PRS = [
    (2677, "fix/h01-entity-badge-single-source", "entity-badge-single-source"),
    (2678, "fix/border-creds-edit", "driver-border-credentials-edit"),
    (2681, "fix/0441-mod11-user-detail-activity-tab", "user-detail-activity-tab"),
    (2682, "ci/sql-column-existence-guard", "sql-column-existence"),
]


def run(cmd, cwd=None, check=True, env=None):
    e = {**os.environ, **(env or {})}
    r = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, env=e)
    if check and r.returncode != 0:
        raise RuntimeError(
            f"fail {r.returncode}: {' '.join(cmd)}\n{(r.stderr or r.stdout or '')[:800]}"
        )
    return r


def gh_json(args):
    return json.loads(run(["gh", *args]).stdout)


def main_sha():
    run(["git", "fetch", "origin", "main", "-q"], cwd=COORD)
    return run(["git", "rev-parse", "--short", "origin/main"], cwd=COORD).stdout.strip()


def strip_markers(path: Path):
    t = path.read_text()
    while "<<<<<<<" in t:
        t = re.sub(
            r"<<<<<<<[^\n]*\n(.*?)=======\n.*?>>>>>>>[^\n]*\n",
            r"\1",
            t,
            count=1,
            flags=re.S,
        )
    path.write_text(t)


def ensure_step(repo: Path, stem: str):
    steps = repo / "scripts" / "verify-steps"
    steps.mkdir(parents=True, exist_ok=True)
    existing = list(steps.glob(f"*-verify-{stem}.mjs"))
    path = existing[0] if existing else steps / f"142-verify-{stem}.mjs"
    body = f"""export default {{
  name: "verify-{stem}",
  run(ctx) {{
    if (ctx.run("node", ["scripts/verify-{stem}.mjs"]) !== 0) {{
      return 1;
    }}
    return 0;
  }},
}};
"""
    need = (not path.exists()) or ("export default" not in path.read_text())
    if need:
        path.write_text(body)
        return True
    return False


def detox_pr(num: int, branch: str, stem: str):
    work = WORK / f"pr-{num}"
    if work.exists():
        shutil.rmtree(work)
    print(f"\n==== DETOX #{num} {branch} ====", flush=True)
    run(["git", "clone", "-q", REPO, str(work)])
    run(["git", "checkout", "-q", "-B", branch, f"origin/{branch}"], cwd=work)

    # rebase onto main
    if run(["git", "merge-base", "--is-ancestor", "origin/main", "HEAD"], cwd=work, check=False).returncode != 0:
        r = run(["git", "rebase", "origin/main"], cwd=work, check=False)
        while (work / ".git/rebase-merge").exists():
            conflicts = run(["git", "diff", "--name-only", "--diff-filter=U"], cwd=work).stdout.splitlines()
            if conflicts:
                for f in conflicts:
                    if f in THRASH_TAKE_MAIN or f == "docs/schema-parity-baseline.json":
                        run(["git", "checkout", "--ours", "--", f], cwd=work)
                        strip_markers(work / f)
                        run(["git", "add", "--", f], cwd=work)
                        print(f"  conflict ours: {f}", flush=True)
                    else:
                        run(["git", "rebase", "--abort"], cwd=work, check=False)
                        raise RuntimeError(f"non-thrash conflict {f}")
            run(
                ["git", "rebase", "--continue"],
                cwd=work,
                check=False,
                env={"GIT_EDITOR": "true"},
            )

    # FORCE hot files = main (root thrash cure)
    for rel in THRASH_TAKE_MAIN:
        run(["git", "checkout", "origin/main", "--", rel], cwd=work)
        print(f"  reset→main {rel}", flush=True)

    # ensure guard file exists
    guard = work / "scripts" / f"verify-{stem}.mjs"
    if not guard.exists():
        raise RuntimeError(f"missing {guard}")

    ensure_step(work, stem)

    # validate steps load
    run(
        [
            "node",
            "--input-type=module",
            "-e",
            """
import { readdirSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
const dir='scripts/verify-steps';
for (const f of readdirSync(dir).filter(x=>x.endsWith('.mjs')&&!x.startsWith('_')).sort()) {
  const m=await import(pathToFileURL(path.join(dir,f)).href);
  if (!m.default?.name || typeof m.default.run!=='function') {
    console.error('BAD', f); process.exit(1);
  }
}
console.log('steps OK');
""",
        ],
        cwd=work,
    )

    run(["git", "add", "-A"], cwd=work)
    if run(["git", "diff", "--cached", "--quiet"], cwd=work, check=False).returncode != 0:
        run(
            [
                "git",
                "commit",
                "-m",
                f"fix(ci): detox thrash — wire verify:{stem} via verify-steps only (no package.json/workflows)",
            ],
            cwd=work,
        )
    else:
        print("  no detox commit needed", flush=True)

    # prove no hot-file delta vs main (except none)
    for rel in THRASH_TAKE_MAIN:
        d = run(["git", "diff", "origin/main", "--", rel], cwd=work)
        if d.stdout.strip():
            raise RuntimeError(f"#{num} still diffs {rel} vs main:\n{d.stdout[:400]}")
        print(f"  clean vs main: {rel}", flush=True)

    run(["git", "push", "--force", "origin", f"HEAD:{branch}"], cwd=work)
    sha = run(["git", "rev-parse", "--short", "HEAD"], cwd=work).stdout.strip()
    print(f"DETOX_OK #{num} {sha}", flush=True)
    return sha


def open_prs():
    prs = gh_json(
        [
            "pr",
            "list",
            "--state",
            "open",
            "--limit",
            "40",
            "--json",
            "number,headRefName,mergeStateStatus,statusCheckRollup",
        ]
    )
    out = []
    for p in prs:
        fails = [
            c["name"]
            for c in (p.get("statusCheckRollup") or [])
            if c.get("conclusion") == "FAILURE"
        ]
        pend = sum(
            1
            for c in (p.get("statusCheckRollup") or [])
            if c.get("status") in ("IN_PROGRESS", "QUEUED", "WAITING")
        )
        out.append(
            {
                "n": p["number"],
                "br": p["headRefName"],
                "ms": p.get("mergeStateStatus"),
                "fails": fails,
                "pend": pend,
            }
        )
    return sorted(out, key=lambda x: x["n"])


def merge_one(n: int):
    r = run(["gh", "pr", "merge", str(n), "--squash"], check=False)
    if r.returncode != 0:
        raise RuntimeError(f"merge #{n}: {(r.stderr or r.stdout or '')[:400]}")
    print(f"MERGED #{n}", flush=True)


def drain():
    WORK.mkdir(parents=True, exist_ok=True)

    # 1) Detox all known thrash PRs
    for num, branch, stem in PRS:
        # skip if already merged
        st = run(["gh", "pr", "view", str(num), "--json", "state", "-q", ".state"], check=False)
        if st.returncode != 0 or st.stdout.strip() != "OPEN":
            print(f"skip #{num} not open", flush=True)
            continue
        detox_pr(num, branch, stem)

    # 2) Serialize merge until empty (no package.json conflicts expected)
    for round_i in range(1, 10):
        print(f"\n==== DRAIN ROUND {round_i} main={main_sha()} ====", flush=True)
        merged = False
        for wait in range(1, 60):
            prs = open_prs()
            print(
                f"wait={wait} open={len(prs)} "
                + " ".join(f"#{p['n']}:{p['ms']}/f{len(p['fails'])}/p{p['pend']}" for p in prs),
                flush=True,
            )
            if not prs:
                print("DRAINED", flush=True)
                return 0
            for p in prs:
                if p["fails"]:
                    print(f"  RED #{p['n']} {p['fails'][:3]}", flush=True)
                    continue
                if p["ms"] == "CLEAN":
                    merge_one(p["n"])
                    merged = True
                    break
            if merged:
                break
            time.sleep(20)
        if not merged:
            print("NO_CLEAN — detox again in case behind", flush=True)
            for num, branch, stem in PRS:
                st = run(["gh", "pr", "view", str(num), "--json", "state", "-q", ".state"], check=False)
                if st.stdout.strip() == "OPEN":
                    try:
                        detox_pr(num, branch, stem)
                    except Exception as e:
                        print(f"detox fail #{num}: {e}", flush=True)
            continue
        # after merge: detox remaining (should be fast — no hot conflicts)
        for num, branch, stem in PRS:
            st = run(["gh", "pr", "view", str(num), "--json", "state", "-q", ".state"], check=False)
            if st.stdout.strip() == "OPEN":
                try:
                    detox_pr(num, branch, stem)
                except Exception as e:
                    print(f"post-merge detox fail #{num}: {e}", flush=True)
    print("END", flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(drain())

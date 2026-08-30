#!/usr/bin/env bash
# YOUR QUEUE. Computed live from origin/main. Nobody hands you this.
# Usage:  bash scripts/next-work-item.sh <module> [module...]   (omit args = whole product)
#         bash scripts/next-work-item.sh --selftest
set -uo pipefail

if [ "${1:-}" = "--selftest" ]; then
  NEXT_WORK_ITEM_SELF_PATH="$0" python3 - <<'PY'
import os
import pathlib
import subprocess
import tempfile

def is_module_manifest(value):
    return (
        isinstance(value, dict)
        and isinstance(value.get("items"), list)
        and all(isinstance(item, dict) for item in value["items"])
    )

assert is_module_manifest({"items": [{"id": "D-1", "status": "PASS"}]})
assert is_module_manifest({"items": []})
assert not is_module_manifest(["dispatch:home"])
assert not is_module_manifest({"items": ["dispatch:home"]})
assert not is_module_manifest({"baseline": []})

self_path = pathlib.Path(os.environ["NEXT_WORK_ITEM_SELF_PATH"]).resolve()
root = self_path.parent.parent
healthy = subprocess.run(
    ["bash", str(self_path)], cwd=root, text=True, capture_output=True, check=False
)
assert healthy.returncode == 0, healthy.stderr
assert "Traceback" not in healthy.stderr
assert "### accounting" in healthy.stdout and "### vendors" in healthy.stdout
assert "### PROD-VERIFIED-BINDING-BASELINE" not in healthy.stdout

source = self_path.read_text()
needle = "raise SystemExit(0 if isinstance(items,list) and all(isinstance(item,dict) for item in items) else 2)"
assert needle in source
before, separator, after = source.rpartition(needle)
assert separator
mutated = before + "raise SystemExit(0)" + after
with tempfile.TemporaryDirectory(prefix="next-work-item-selftest-") as tmp:
    mutant_path = pathlib.Path(tmp) / "next-work-item.sh"
    mutant_path.write_text(mutated)
    mutant = subprocess.run(
        ["bash", str(mutant_path)], cwd=root, text=True, capture_output=True, check=False
    )
assert "is not a module manifest" in mutant.stderr or "Traceback" in mutant.stderr
print("next-work-item selftest PASS — support JSON filter mutation is rejected by the product sweep")
PY
  exit $?
fi

git fetch -q origin
MODS="${*:-}"
if [ -z "$MODS" ]; then
  # docs/module-completion also contains support JSON (for example the prod-verification
  # baselines).  Those files are arrays or otherwise lack an object-array `items`
  # manifest.  Feeding them to the renderer used to raise AttributeError midway through
  # the product sweep, so later modules could be silently omitted from a coder's queue.
  MODS=$(
    git ls-tree -r --name-only origin/main docs/module-completion/ \
      | grep '\.json$' \
      | while IFS= read -r manifest_path; do
          if git show "origin/main:$manifest_path" | python3 -c '
import json,sys
try: value=json.load(sys.stdin)
except Exception: raise SystemExit(1)
items=value.get("items") if isinstance(value,dict) else None
raise SystemExit(0 if isinstance(items,list) and all(isinstance(item,dict) for item in items) else 2)
'; then
            basename "$manifest_path" .json
          fi
        done
  )
fi
for m in $MODS; do
  git show "origin/main:docs/module-completion/$m.json" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
its=d.get('items',[]) if isinstance(d,dict) else None
if not isinstance(its,list) or not all(isinstance(i,dict) for i in its):
    raise SystemExit('docs/module-completion/$m.json is not a module manifest')
stamped=sum(1 for i in its if i.get('live_verified_sha'))
rows=[]
for i in its:
    st=str(i.get('status','')).upper()
    hold_ok = st=='HOLD' and i.get('owner_hold') is True and i.get('tracker') and i.get('future_block')
    scored  = (st=='PASS') or hold_ok
    pv      = i.get('prod_verified') is True
    if scored and pv:  continue
    need=[]
    if not scored: need.append('STATUS='+st)
    if not pv:     need.append('prod_verified')
    rows.append('  %-16s %-26s %s' % (i.get('id'), '+'.join(need), str(i.get('title'))[:52]))
hdr='### $m — %d open item(s); manifest L6 stamps=%d%s' % (len(rows), stamped, '  <-- NEEDS >=1 L6 STAMP' if stamped==0 else '')
if rows or stamped==0:
    print(hdr)
    if rows: print('\n'.join(rows))
    print()
"
done

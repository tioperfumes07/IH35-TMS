#!/bin/bash
# Generates the session boot state file from LIVE sources only.
# No agent types any number into this file. Every value is read at run time.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
git fetch -q --filter=blob:none origin 2>/dev/null || true
SHA=$(curl -s --max-time 20 https://api.ih35dispatch.com/api/v1/healthz/shallow | python3 -c "import sys,json;print(json.load(sys.stdin).get('version','UNREACHABLE'))" 2>/dev/null || echo UNREACHABLE)
HEALTH=$(curl -s --max-time 20 https://api.ih35dispatch.com/api/v1/healthz | python3 -c "
import sys,json
d=json.load(sys.stdin)
bad=[c['name'] for c in d.get('checks',[]) if not c.get('ok')]
print(('ok' if d.get('ok') else 'DEGRADED')+(' | failing: '+','.join(bad) if bad else ''))" 2>/dev/null || echo UNREACHABLE)
BEHIND=$(git rev-list --count "$SHA"..origin/main 2>/dev/null || echo '?')
MAIN=$(git log -1 --format='%h %ad %s' --date=format:'%Y-%m-%d %H:%M' origin/main | cut -c1-72)
echo "# IH35-TMS — STATE OF TRUTH (GENERATED — do not hand-edit)"
echo
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ) UTC / $(TZ=America/Chicago date +'%Y-%m-%d %I:%M %p') CT"
echo "Every value below is read live at generation time. No agent typed any of it."
echo "Regenerate: bash gen-state-of-truth.sh > STATE.md"
echo
echo "## DEPLOY"
echo "- live healthz SHA: \`$SHA\`   (route is /api/v1/healthz* — bare /healthz is 404)"
echo "- api health: $HEALTH"
echo "- origin/main HEAD: \`$MAIN\`"
echo "- **commits merged but NOT deployed: $BEHIND**"
echo
echo "## URGENT-6 MODULE STATE (read from docs/module-completion/*.json on origin/main)"
echo
printf "| module | items | PASS | prod_verified | PASS-but-unverified | not PASS | complete flag | L6 stamps |\n"
printf "|---|---|---|---|---|---|---|---|\n"
for m in accounting banking settlements factoring dispatch vendors; do
  git show origin/main:docs/module-completion/$m.json 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin); its=d.get('items',[])
P=[i for i in its if str(i.get('status','')).upper()=='PASS']
pv=[i for i in P if i.get('prod_verified') is True]
nv=[i for i in P if i.get('prod_verified') is not True]
np=[i for i in its if str(i.get('status','')).upper()!='PASS']
st=sum(1 for i in its if i.get('live_verified_sha'))
print(f\"| $m | {len(its)} | {len(P)} | {len(pv)} | {len(nv)} | {len(np)} | {d.get('complete')} | {st} |\")"
done
echo
echo "## EVERY ITEM NOT PROVEN (status != PASS, or PASS without prod_verified)"
for m in accounting banking settlements factoring dispatch vendors; do
  git show origin/main:docs/module-completion/$m.json 2>/dev/null | python3 -c "
import sys,json,re
d=json.load(sys.stdin)
rows=[]
for i in d.get('items',[]):
    st=str(i.get('status','')).upper()
    if st!='PASS' or i.get('prod_verified') is not True:
        ev=str(i.get('evidence') or '')
        dt=re.search(r'20\d\d-\d\d-\d\d',ev)
        ent=[e for e in ('TRANSP','USMCA','TRK') if e in ev]
        rows.append(f\"  - {chr(96)}{i.get('id')}{chr(96)} [{st}] evidence={dt.group(0) if dt else 'NO DATE'} entity={'/'.join(ent) if ent else 'NONE'} — {str(i.get('title'))[:70]}\")
if rows:
    print(f'\n### $m ({len(rows)})'); print('\n'.join(rows))"
done

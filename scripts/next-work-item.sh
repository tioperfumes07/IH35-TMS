#!/usr/bin/env bash
# YOUR QUEUE. Computed live from origin/main. Nobody hands you this.
# Usage:  bash scripts/next-work-item.sh <module> [module...]   (omit args = whole product)
set -uo pipefail
git fetch -q origin
MODS="${*:-}"
if [ -z "$MODS" ]; then
  MODS=$(git ls-tree -r --name-only origin/main docs/module-completion/ | grep '\.json$' | xargs -n1 basename | sed 's/\.json$//')
fi
for m in $MODS; do
  git show "origin/main:docs/module-completion/$m.json" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin); its=d.get('items',[])
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

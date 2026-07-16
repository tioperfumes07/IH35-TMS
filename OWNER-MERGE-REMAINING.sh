#!/usr/bin/env bash
# Merge remaining HOLD PRs after #2536/#2537/#2540 landed.
# Usage: CONFIRM=1 bash OWNER-MERGE-REMAINING.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

need_green() {
  local n="$1"
  local fails pending
  fails=$(gh pr checks "$n" 2>/dev/null | awk -F'\t' '$2=="fail"{print $1}' | paste -sd, - || true)
  pending=$(gh pr checks "$n" 2>/dev/null | awk -F'\t' '$2=="pending"{print $1}' | paste -sd, - || true)
  if [[ -n "${fails:-}" ]]; then
    echo "BLOCKED #$n failing: $fails" >&2
    return 1
  fi
  if [[ -n "${pending:-}" ]]; then
    echo "WAIT #$n pending: $pending" >&2
    return 2
  fi
  return 0
}

echo "=== status ==="
for n in 2538 2539; do
  gh pr view "$n" --json number,state,mergeable,mergeStateStatus,labels,title \
    -q '"#\(.number) \(.state) mss=\(.mergeStateStatus) labels=\([.labels[].name]|join(",")) | \(.title)"' || true
  need_green "$n" || true
done

if [[ "${CONFIRM:-}" != "1" ]]; then
  echo
  echo "Dry-run. Re-run: CONFIRM=1 bash OWNER-MERGE-REMAINING.sh"
  exit 0
fi

for n in 2538 2539; do
  state=$(gh pr view "$n" --json state -q .state)
  [[ "$state" == "MERGED" ]] && { echo "#$n already merged"; continue; }
  for i in $(seq 1 40); do
    if need_green "$n"; then break; fi
    rc=$?
    [[ $rc -eq 1 ]] && exit 1
    sleep 30
  done
  labels=$(gh pr view "$n" --json labels -q '[.labels[].name]|join(",")')
  title=$(gh pr view "$n" --json title -q .title)
  if [[ "$title" == *"[HOLD-FOR-JORGE"* ]] && [[ "$labels" != *"JORGE-APPROVED"* ]]; then
    echo "BLOCKED #$n missing JORGE-APPROVED" >&2
    exit 1
  fi
  echo "Merging #$n ..."
  gh pr merge "$n" --squash --delete-branch
  echo "Merged #$n"
done
echo "Done. Next: RELAY_API_KEY_TRANSP + flag override ON + backfill + Neon count > 0."

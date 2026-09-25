#!/bin/zsh
# IH35 Lead coordinator — ROUND 153.5. Runs on the Mac, no owner needed.
# Every 5 min: (1) if origin/main moved, run the costs guard on main; on exit 0 wake cc2+cc3 to FAST-MERGE (once).
# (2) any seat idle two checks in a row gets a nudge (max once per 15 min). (3) clears the feedback pop-up.
# Log: ~/ih35-worktrees/coordinator.log   Stop: kill $(cat ~/ih35-worktrees/.coord-state/pid)
WT=$HOME/ih35-worktrees/coordinator
LOG=$HOME/ih35-worktrees/coordinator.log
ST=$HOME/ih35-worktrees/.coord-state
mkdir -p $ST; echo $$ > $ST/pid
[ -d $WT ] || git -C $HOME/ih35-worktrees/lead-r151 worktree add -q --detach $WT origin/main
ln -sfn $HOME/IH35-TMS-clean/node_modules $WT/node_modules
stamp() { echo "$(TZ=America/Chicago date '+%m-%d %I:%M %p CT') ($(date -u +%H:%MZ))"; }
send() { tmux send-keys -t $1 "$2"; sleep 1; tmux send-keys -t $1 C-m; echo "$(stamp) -> $1: $2" >> $LOG; }
echo "$(stamp) coordinator start pid $$" >> $LOG
while true; do
  git -C $WT fetch -q origin 2>/dev/null
  sha=$(git -C $WT rev-parse --short=10 origin/main)
  if [ "$sha" != "$(cat $ST/sha 2>/dev/null)" ] && [ ! -f $ST/woke ]; then
    git -C $WT checkout -q --detach origin/main
    ( set -a; source $HOME/.ih35-gate.env; set +a; cd $WT && node scripts/verify-costs-are-expenses-not-handwritten-jes.mjs > $ST/guard.out 2>&1 )
    rc=$?
    echo $sha > $ST/sha
    echo "$(stamp) main=$sha costs-guard exit=$rc $(grep -o -E '[0-9]+ violations?' $ST/guard.out | tail -1)" >> $LOG
    if [ $rc -eq 0 ]; then
      echo $sha > $ST/woke
      send cc2 "Coordinator: costs guard GREEN on main at $sha ($(stamp)). FAST-MERGE your match-window branch now (R-153.3). Post the merge sha at the top of NOW-CC-2.md."
      send cc3 "Coordinator: costs guard GREEN on main at $sha ($(stamp)). FAST-MERGE your LAW 5 branch now (R-153.3). Post the merge sha at the top of NOW-CC-3.md."
    fi
  fi
  for n in 1 2 3; do
    p=$(tmux capture-pane -p -t cc$n | grep -v '^[[:space:]]*$' | tail -14)
    if echo "$p" | grep -q 'to dismiss'; then tmux send-keys -t cc$n 0; sleep 2; tmux send-keys -t cc$n Escape; echo "$(stamp) cc$n feedback pop-up dismissed (not sent)" >> $LOG; continue; fi
    if echo "$p" | grep -q -E '… \(|queued messages|Compacting'; then echo 0 > $ST/idle$n; continue; fi
    if echo "$p" | grep -q ' · done '; then
      c=$(( $(cat $ST/idle$n 2>/dev/null || echo 0) + 1 )); echo $c > $ST/idle$n
      lastn=$(cat $ST/nudge$n 2>/dev/null || echo 0); now=$(date +%s)
      if [ $c -ge 2 ] && [ $(( now - lastn )) -ge 900 ]; then
        echo $now > $ST/nudge$n
        send cc$n "Coordinator ($(stamp)): you are IDLE. A finished turn cannot self-check. Read the top of docs/bus/NOW-CC-$n.md and continue the next unblocked step of your R-153 job on your same branch. Do not stop until your job is done."
      fi
    fi
  done
  sleep 300
done

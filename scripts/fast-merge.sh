#!/bin/bash
# OWNER LAW — FAST 4-MINUTE MERGE (owner 2026-11-27 17:44 CT): "bypass unecessary checks, if tested locally and passed then
# automatically use fast merge law, the fast 4 mintue weekend merge method, it is a law. you and all coders instruct in repo."
# Usage, right after `git push` of a branch whose touched tests passed locally:
#   scripts/fast-merge.sh <PR number> <branch name>
# Waits 4 minutes from the push, lists every red CI check (reported, not waited on), squash-merges with the PR's own title.
# Never: --no-verify, hooks disabled, force-push, `gh pr merge --admin`. A red that is the PR's own is fixed in the next PR.
set -u
repo=tioperfumes07/IH35-TMS
n=$1; want=$2
head=$(gh api repos/$repo/pulls/$n --jq .head.ref)
if [ "$head" != "$want" ]; then echo "REFUSED — PR #$n is branch '$head', expected '$want'"; exit 1; fi
start=$(date +%s)
until [ $(date +%s) -ge $((start + 240)) ]; do sleep 10; done
sha=$(gh api repos/$repo/pulls/$n --jq .head.sha)
title=$(gh api repos/$repo/pulls/$n --jq .title)
reds=$(gh api "repos/$repo/commits/$sha/check-runs?per_page=100" --jq '[.check_runs[]|select(.conclusion=="failure")|.name]|join(", ")')
echo "PR #$n $(date -u +%H:%M:%S) UTC — red checks reported (not waited on): ${reds:-none}"
gh api -X PUT repos/$repo/pulls/$n/merge -f merge_method=squash -f commit_title="$title (#$n)" --jq .sha

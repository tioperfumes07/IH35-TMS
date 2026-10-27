# ENG-18 — commit intent, measured rather than guessed

Git's prepare-commit-msg arguments are ambiguous: `--amend -m` supplies `message` with no SHA, while a new `--allow-empty -C HEAD` supplies `commit` / `HEAD`. The previous detector classified both incorrectly.

## Exact intent, hooks enabled

Stage the intended changes, put the complete evidence-bearing commit message in a file, then use:

```sh
node scripts/commit-with-evidence.mjs --kind new --message-file /absolute/path/commit-message.txt
node scripts/commit-with-evidence.mjs --kind amend --message-file /absolute/path/commit-message.txt
```

The wrapper constructs the Git command itself and passes matching intent only to its child process. It forwards no arbitrary flags and does not disable hooks. `--allow-empty` is supported explicitly.

Ordinary `git commit` still works, but ambiguous intent checks the union of both possible file sets; this can require evidence for previous-commit files. It is never falsely labelled a new commit or an amendment. Use the wrapper for exact classification. Missing or stale markers use the same conservative behavior.

An amendment compares the actual index with HEAD's first parent, or the empty tree for a root commit. It therefore includes message-only amendments, excludes changes reverted in the amendment, and honors Git's temporary partial-commit index. Git read errors fail rather than becoming an empty commit.

## Evidence

- `node scripts/prepare-commit-kind.mjs --selftest`: exit 0, six cases.
- `node scripts/verify-money-pr-local-gate.mjs --selftest`: exit 0, existing mutation assertions plus nine real-Git cases.
- Cases: root new; root amendment; new docs after money; raw amendment with staged docs; new reuse-HEAD ambiguity; explicit empty new; reverted money; merge amendment; partial index.
- Running the new behavior tests against old-main helpers exits 1, including lost root-amendment files, lost prior money on `--amend -m`, false new/reuse classification, and wrong reverted-file classification.
- Fixtures use the canonical `gitChildEnv` sanitizer and exact temporary-directory cleanup. Independent review passed after correcting fixture environment isolation.
- Static/tooling change only. No production query, ledger change, or runtime deploy proof claimed.

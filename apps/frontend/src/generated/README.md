# Generated frontend data

`module-completion.ts` is produced by `node scripts/generate-module-completion-data.mjs` from `docs/module-completion/*.json`.

It is **gitignored** on purpose (parallel PRs were conflicting on the committed derived file). Frontend `npm run typecheck` / `build` / `dev` regenerate it automatically.

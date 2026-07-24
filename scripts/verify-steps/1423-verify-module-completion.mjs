// Owner rule 2026-07-24: every module reports "N of M" mechanically, and "merged" never counts as
// done — only a boundary with recorded live proof does. Manifests are the source of truth; the
// human-readable status doc is generated and must not drift.
export default {
  name: "verify:module-completion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-module-completion.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-module-completion.mjs"]);
  },
};

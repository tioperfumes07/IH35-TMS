const guards = [
  "verify-wiring-law-guard-registry-batch.mjs",
  "verify-fully-wired-complete-bar-present.mjs",
  "verify-honest-built-launch-law-present.mjs",
  "verify-matrix-built-leaf-specific.mjs",
];

export default {
  name: "verify-wiring-law-orphan-guard-registry-batch",
  async run(ctx) {
    for (const guard of guards) await ctx.run("node", [`scripts/${guard}`]);
  },
};

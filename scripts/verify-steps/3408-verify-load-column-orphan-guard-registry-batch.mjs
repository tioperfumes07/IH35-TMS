const guards = [
  "verify-load-column-guard-registry-batch.mjs",
  "verify-border-crossing-load-linkage.mjs", "verify-dispatch-required-load-honest.mjs",
  "verify-dispatch-trailer-board-and-book-load.mjs", "verify-internal-fine-load-reverse.mjs",
  "verify-intransit-issue-load-linkage.mjs", "verify-load-drill-route-vertical-sweep.mjs",
  "verify-load-inline-surface-linkage.mjs", "verify-roundtrips-quality-load-entitylink.mjs",
];
export default { name: "verify-load-column-orphan-guard-registry-batch", async run(ctx) { for (const guard of guards) await ctx.run("node", [`scripts/${guard}`]); } };

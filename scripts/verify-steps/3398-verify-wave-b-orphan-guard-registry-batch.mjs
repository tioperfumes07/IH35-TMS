const guards = [
  "verify-wave-b-guard-registry-batch.mjs",
  "verify-wave-b-acct-conn-closeout.mjs",
  "verify-wave-b-acct-conn-hub-audit.mjs",
  "verify-wave-b-acct-connectivity-remainder.mjs",
  "verify-wave-b-connectivity-all-modules.mjs",
  "verify-wave-b-dispatch-connectivity-remainder.mjs",
  "verify-wave-b-factoring-banking-drivers-connectivity.mjs",
  "verify-wave-b-lists-reverse-link-column.mjs",
  "verify-wave-b-lists-reverse-link.mjs",
  "verify-wave-b-reverse-link-all-modules.mjs",
  "verify-wave-b-reverse-link-column.mjs",
  "verify-wave-b-safety-connectivity-lists.mjs",
  "verify-wave-b-safety-connectivity-remainder-a.mjs",
  "verify-wave-b-safety-connectivity-remainder-b.mjs",
  "verify-wave-b-safety-connectivity-remainder-c.mjs",
];

export default {
  name: "verify-wave-b-orphan-guard-registry-batch",
  async run(ctx) {
    for (const guard of guards) await ctx.run("node", [`scripts/${guard}`]);
  },
};

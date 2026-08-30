/** DQF-01 Q4 — 49 CFR 391.51 catalog seed + driver_qualification_files FK/retention fields. */
export default {
  name: "verify-dqf01-required-document-types-and-file-fks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dqf01-required-document-types-and-file-fks.mjs"]);
    await ctx.run("node", ["scripts/verify-dqf01-required-document-types-and-file-fks.mjs", "--selftest"]);
  },
};

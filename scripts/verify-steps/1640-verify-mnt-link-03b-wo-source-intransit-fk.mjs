/** MNT-LINK-03b — WO source_intransit_issue_id reverse FK. */
export default {
  name: "verify-mnt-link-03b-wo-source-intransit-fk",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-mnt-link-03b-wo-source-intransit-fk.mjs"]);
    await ctx.run("node", ["scripts/verify-mnt-link-03b-wo-source-intransit-fk.mjs", "--selftest"]);
  },
};

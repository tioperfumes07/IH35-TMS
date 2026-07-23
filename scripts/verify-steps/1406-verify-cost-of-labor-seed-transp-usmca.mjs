export default {
  name: "verify-cost-of-labor-seed-transp-usmca",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-cost-of-labor-seed-transp-usmca.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cost-of-labor-seed-transp-usmca.mjs"]);
  },
};

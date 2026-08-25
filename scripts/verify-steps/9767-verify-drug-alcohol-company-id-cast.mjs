export default {
  name: "verify-drug-alcohol-company-id-cast",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-drug-alcohol-company-id-cast.mjs"]) !== 0) {
      throw new Error("verify-drug-alcohol-company-id-cast failed");
    }
  },
};

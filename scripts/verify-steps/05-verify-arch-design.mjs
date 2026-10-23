export default {
  name: "verify-arch-design",
  run: async (ctx) => {
    for (const args of [["--selftest"], []]) {
      if (ctx.run("node", ["scripts/verify-entity-filters-multi-select.mjs", ...args]) !== 0) {
        throw new Error("Entity multi-select contract failed");
      }
    }
    if (ctx.run("npm", ["run", "verify:arch-design"]) !== 0) {
      process.exit(1);
    }
  },
};

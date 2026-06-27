export default {
  name: "verify-af1-coa-role-binding-heal",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:af1-coa-role-binding-heal"]) !== 0) {
      process.exit(1);
    }
  },
};

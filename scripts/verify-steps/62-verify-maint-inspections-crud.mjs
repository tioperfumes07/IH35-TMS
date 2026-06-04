export default {
  name: "verify-maint-inspections-crud",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:maint-inspections-crud"]) !== 0) {
      throw new Error("verify:maint-inspections-crud failed");
    }
  },
};

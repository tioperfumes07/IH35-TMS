export default { name: "verify-maint-mech-labor-ux", run(ctx) { if (ctx.run("npm", ["run", "verify:maint-mech-labor-ux"]) !== 0) throw new Error("verify:maint-mech-labor-ux failed"); } };

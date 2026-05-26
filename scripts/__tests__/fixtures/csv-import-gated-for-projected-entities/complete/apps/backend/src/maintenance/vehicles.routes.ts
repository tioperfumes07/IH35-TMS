const flag = process.env.VEHICLES_CSV_IMPORT_ENABLED;
function isVehiclesCsvImportEnabled() {}
app.post("/api/v1/maintenance/vehicles/import", async () => {
  throw new Error("vehicles_csv_import_disabled");
});

export function shouldUseDevFixturesForMaintenance(
  nodeEnv = process.env.NODE_ENV,
  enableDevFixtures = process.env.ENABLE_DEV_FIXTURES
) {
  return nodeEnv !== "production" && enableDevFixtures === "1";
}

export function triageDevFixtures() {
  return [
    {
      id: "00000000-0000-0000-0000-000000000001",
      reported_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      unit_id: "00000000-0000-0000-0000-000000000011",
      driver_id: "00000000-0000-0000-0000-000000000021",
      gps_lat: 26.17,
      gps_lng: -98.0,
      gps_label: "US-281",
      issue_category: "check_engine",
      issue_description: "Check-engine light with power loss",
      severity: "high",
      promoted_to_wo_id: null,
      promoted_to_damage_report_id: null,
      unit_display_id: "T034",
      driver_full_name: "L. Vargas",
      hours_since_report: 1,
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      reported_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      unit_id: "00000000-0000-0000-0000-000000000012",
      driver_id: "00000000-0000-0000-0000-000000000022",
      gps_lat: 27.53,
      gps_lng: -99.5,
      gps_label: "I-35 MM 10",
      issue_category: "oil_leak",
      issue_description: "Oil leak detected on shoulder check",
      severity: "medium",
      promoted_to_wo_id: null,
      promoted_to_damage_report_id: null,
      unit_display_id: "T091",
      driver_full_name: "M. Torres",
      hours_since_report: 3,
    },
  ];
}

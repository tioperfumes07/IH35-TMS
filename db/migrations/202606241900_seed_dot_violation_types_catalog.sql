-- 202606241900 — Seed catalogs.dot_violation_types: 71 FMCSA driver DOT violation codes.
--
-- Source: IH35-DOT-FINES-VIOLATIONS-CATALOG-2026-06-24 (schema-verified vs the live table). The sheet has
-- 77 codes; this seeds 71. EXCLUDED: the 6 HazMat-Compliance codes (177.817(a), 172.704(a), 172.504(a),
-- 177.823(a), 173.24(b), 397.7) — their basic_category 'HazMat Compliance' violates BOTH the live CHECK
-- (basic_category ∈ {unsafe_driving,hours_of_service,driver_fitness,controlled_substances,vehicle_maintenance,
-- crash_indicator}) AND CLAUDE.md §4 "NO hazmat fields anywhere". HazMat is a HOLD decision for Jorge
-- (would require widening the CHECK = separate gated migration + resolving the §4/hazmat-field drift).
--
-- MAPPING (sheet label -> live CHECK value): Unsafe Driving->unsafe_driving, HOS Compliance->hours_of_service,
-- Driver Fitness->driver_fitness, Controlled Substances/Alcohol->controlled_substances, Vehicle Maintenance->
-- vehicle_maintenance. VMDO ("Vehicle Maintenance: Driver Observed", the new-2026 split) is COLLAPSED to
-- vehicle_maintenance because the live CHECK has no VMDO value (4 rows: 393.9, 393.11, 393.95(a), 393.95(f)).
-- severity_weight = the CSA 1-10 scale (matches the live CHECK 1..10), per the sheet.
--
-- Per-entity: seeded for every non-deactivated company (TRANSP/TRK/USMCA) — entity-independence rule, mirrors
-- the canonical 0123 catalog-seed pattern. Idempotent: ON CONFLICT (operating_company_id, violation_code)
-- DO NOTHING -> no-op on re-run. Pure reference DATA in catalogs.* -> §1.4 gated, [HOLD-FOR-JORGE].

BEGIN;

INSERT INTO catalogs.dot_violation_types
  (operating_company_id, violation_code, display_name, description, basic_category, severity_weight, is_oos, is_active, sort_order)
SELECT c.id, v.violation_code, v.display_name, v.description, v.basic_category, v.severity_weight, v.is_oos, true, v.sort_order
FROM org.companies c
CROSS JOIN (VALUES
  ('392.2-SPEED', 'Speeding', 'Exceeding the posted speed limit while operating a CMV.', 'unsafe_driving', 5, false, 10),
  ('392.2-SLLS2', 'Speeding 6-10 over', 'Speeding 6-10 mph over the posted limit.', 'unsafe_driving', 4, false, 20),
  ('392.2-SLLS3', 'Speeding 11-14 over', 'Speeding 11-14 mph over the posted limit.', 'unsafe_driving', 7, false, 30),
  ('392.2-SLLS4', 'Speeding 15+ over', 'Speeding 15 or more mph over the posted limit.', 'unsafe_driving', 10, false, 40),
  ('392.2-SLLSWZ', 'Speeding work zone', 'Speeding in a posted construction / work zone.', 'unsafe_driving', 10, false, 50),
  ('392.80(a)', 'Texting while driving', 'Driving a CMV while texting. Driver-disqualifying.', 'unsafe_driving', 10, false, 60),
  ('392.82(a)(1)', 'Handheld phone use', 'Using a hand-held mobile telephone while driving a CMV.', 'unsafe_driving', 10, false, 70),
  ('392.16', 'Seat belt not used', 'Failing to use a seat belt while operating a CMV.', 'unsafe_driving', 7, false, 80),
  ('392.2FC', 'Following too close', 'Following the vehicle ahead too closely.', 'unsafe_driving', 5, false, 90),
  ('392.2LC', 'Improper lane change', 'Improper or unsafe lane change.', 'unsafe_driving', 5, false, 100),
  ('392.2R', 'Reckless driving', 'Driving in willful or wanton disregard for safety.', 'unsafe_driving', 10, false, 110),
  ('392.2Y', 'Failure to yield', 'Failure to yield right of way.', 'unsafe_driving', 5, false, 120),
  ('392.2S', 'Disobey traffic signal', 'Disregarding a traffic control device / signal.', 'unsafe_driving', 5, false, 130),
  ('392.2P', 'Improper passing', 'Improper or unsafe passing.', 'unsafe_driving', 5, false, 140),
  ('392.2T', 'Improper turn', 'Making an improper turn.', 'unsafe_driving', 5, false, 150),
  ('392.14', 'Hazardous-condition driving', 'Failure to use caution / reduce speed for hazardous conditions.', 'unsafe_driving', 5, false, 160),
  ('395.3(a)(1)', '11-hour rule violation', 'Driving beyond the 11-hour driving limit.', 'hours_of_service', 7, true, 170),
  ('395.3(a)(2)', '14-hour rule violation', 'Driving beyond the 14th consecutive on-duty hour.', 'hours_of_service', 7, true, 180),
  ('395.3(b)', '60/70-hour rule violation', 'Driving after 60/70 hours on duty in 7/8 days.', 'hours_of_service', 7, true, 190),
  ('395.8(a)', 'No record of duty status', 'Failing to maintain / produce a RODS.', 'hours_of_service', 5, false, 200),
  ('395.8(e)', 'False record of duty status', 'False report of driver''s record of duty status. OOS.', 'hours_of_service', 7, true, 210),
  ('395.8(k)', 'RODS not retained', 'Failing to retain previous 7 days of RODS.', 'hours_of_service', 1, false, 220),
  ('395.22(a)', 'No ELD when required', 'Operating without a required Electronic Logging Device.', 'hours_of_service', 5, false, 230),
  ('395.24(c)', 'ELD data not transferable', 'ELD unable to transfer / produce required data.', 'hours_of_service', 5, false, 240),
  ('395.30(a)', 'No ELD account / login', 'Driver not using own ELD account / not logged in.', 'hours_of_service', 1, false, 250),
  ('395.8(f)(1)', 'Incomplete log entry', 'RODS not current / missing required entries.', 'hours_of_service', 5, false, 260),
  ('395.3(a)(3)(ii)', '30-minute break violation', 'Driving without the required 30-minute break.', 'hours_of_service', 7, false, 270),
  ('391.11(b)(2)', 'English proficiency', 'Driver cannot read/speak English sufficiently. OOS per 2025 CVSA update.', 'driver_fitness', 5, true, 280),
  ('391.11(b)(4)', 'No valid CDL / improper class', 'Driver lacks a valid CDL of the proper class.', 'driver_fitness', 8, true, 290),
  ('391.11(b)(5)', 'Multiple CDLs', 'Driver possessing more than one license.', 'driver_fitness', 4, true, 300),
  ('391.41(a)', 'No medical certificate', 'Operating without a valid medical examiner''s certificate.', 'driver_fitness', 5, true, 310),
  ('391.45', 'Medical exam not current', 'Driver medically unqualified / expired DOT physical.', 'driver_fitness', 3, false, 320),
  ('383.23(a)', 'Operating without CDL', 'Operating a CMV without a CDL.', 'driver_fitness', 8, true, 330),
  ('383.51(a)', 'Driving while disqualified', 'Operating a CMV while disqualified / suspended.', 'driver_fitness', 8, true, 340),
  ('383.91(a)', 'Wrong CDL group', 'Operating a CMV not matching the CDL group.', 'driver_fitness', 4, true, 350),
  ('383.93', 'Missing endorsement', 'Operating without the required endorsement.', 'driver_fitness', 5, true, 360),
  ('391.15(a)', 'Disqualified driver operating', 'A disqualified driver operating a CMV.', 'driver_fitness', 8, true, 370),
  ('392.5(a)', 'Alcohol possession/use', 'Possession/use/under the influence of alcohol on duty. OOS.', 'controlled_substances', 10, true, 380),
  ('392.4(a)', 'Drugs possession/use', 'Possession/use of a controlled substance on duty. OOS.', 'controlled_substances', 10, true, 390),
  ('382.201', 'BAC 0.04 or greater', 'Driving with alcohol concentration of 0.04 or greater.', 'controlled_substances', 10, true, 400),
  ('382.215', 'Prohibited Clearinghouse status', 'Operating while in ''prohibited'' Clearinghouse status.', 'controlled_substances', 10, true, 410),
  ('382.301(a)', 'No pre-employment test', 'Used before pre-employment test result received.', 'controlled_substances', 5, false, 420),
  ('393.47(e)', 'Brakes out of adjustment', 'Clamp/roto-chamber brake(s) out of adjustment.', 'vehicle_maintenance', 4, true, 430),
  ('393.48(a)', 'Inoperative brakes', 'Inoperative / defective brakes.', 'vehicle_maintenance', 4, true, 440),
  ('396.3(a)(1)BK', '20% defective brakes (OOS)', 'Defective brakes >= 20% of service brakes. Vehicle OOS.', 'vehicle_maintenance', 4, true, 450),
  ('393.45(b)(2)', 'Brake hose/tubing chafing', 'Brake hose/tubing chafing, kinking, improperly secured.', 'vehicle_maintenance', 4, false, 460),
  ('393.45(d)', 'Brake tubing/hose leak', 'Brake tubing/hose leaking / restricting air flow.', 'vehicle_maintenance', 4, true, 470),
  ('393.43(d)', 'No/defective tractor protection', 'Inoperable tractor protection valve / breakaway.', 'vehicle_maintenance', 4, true, 480),
  ('393.51', 'Low air warning defective', 'Inoperative low-air-pressure warning device.', 'vehicle_maintenance', 4, true, 490),
  ('393.47(a)', 'Insufficient brake lining', 'Brake lining/pad worn below allowable limit.', 'vehicle_maintenance', 4, true, 500),
  ('393.75(a)', 'Flat / leaking tire', 'Tire flat or with audible air leak. Vehicle OOS.', 'vehicle_maintenance', 8, true, 510),
  ('393.75(b)', 'Tire tread separation', 'Body ply / belt exposed / tread separation. OOS.', 'vehicle_maintenance', 8, true, 520),
  ('393.75(c)', 'Steer tire tread depth', 'Steer tire tread depth < 4/32 inch. OOS.', 'vehicle_maintenance', 8, true, 530),
  ('393.75(c)(2)', 'Other tire tread depth', 'Non-steer tire tread depth < 2/32 inch. OOS.', 'vehicle_maintenance', 8, true, 540),
  ('393.75(h)', 'Tire underinflated', 'Tire inflation below 50% of max marked pressure. OOS.', 'vehicle_maintenance', 8, true, 550),
  ('393.75(a)(3)', 'Tire cut/exposed cord', 'Tire cut exposing ply/belt/cord. OOS.', 'vehicle_maintenance', 8, true, 560),
  ('393.9', 'Inoperative required lamp', 'Required lamp (head/tail/turn/marker) inoperative.', 'vehicle_maintenance', 6, false, 570),
  ('393.11', 'Missing/defective lighting', 'Required lighting device or reflector missing/defective.', 'vehicle_maintenance', 6, false, 580),
  ('393.3(a)(1)', 'Parts & accessories disrepair', 'Parts/accessories not in safe operating condition.', 'vehicle_maintenance', 3, false, 590),
  ('396.3(a)(1)', 'Inspection/repair/maintenance', 'Failure to systematically inspect, repair, maintain.', 'vehicle_maintenance', 3, false, 600),
  ('393.95(a)', 'No/discharged fire extinguisher', 'Missing/unsecured/discharged fire extinguisher.', 'vehicle_maintenance', 2, false, 610),
  ('393.95(f)', 'No emergency warning devices', 'Missing required warning triangles / flares.', 'vehicle_maintenance', 2, false, 620),
  ('393.45(b)2', 'Fuel leak', 'Liquid fuel system with a dripping leak.', 'vehicle_maintenance', 6, true, 630),
  ('393.201(a)', 'Frame cracked/broken', 'Frame member cracked, broken, loose, or sagging.', 'vehicle_maintenance', 6, false, 640),
  ('393.207(a)', 'Suspension defective', 'Axle positioning / suspension cracked or broken.', 'vehicle_maintenance', 6, true, 650),
  ('393.209(d)', 'Steering defective', 'Steering worn, welded, or with excessive play.', 'vehicle_maintenance', 6, true, 660),
  ('393.100(a)', 'Cargo securement', 'Failure to prevent cargo shifting/falling/leaking.', 'vehicle_maintenance', 7, true, 670),
  ('393.130', 'Cargo securement-heavy', 'Improper securement of heavy vehicles/equipment.', 'vehicle_maintenance', 7, true, 680),
  ('396.17(c)', 'No periodic inspection', 'Operating without proof of current annual inspection.', 'vehicle_maintenance', 4, false, 690),
  ('396.11(a)', 'No DVIR', 'Failure to prepare/submit a DVIR.', 'vehicle_maintenance', 1, false, 700),
  ('396.13(a)', 'Failure to review DVIR', 'Failing to review last DVIR / sign off repairs.', 'vehicle_maintenance', 1, false, 710)
) AS v(violation_code, display_name, description, basic_category, severity_weight, is_oos, sort_order)
WHERE c.deactivated_at IS NULL
ON CONFLICT (operating_company_id, violation_code) DO NOTHING;

COMMIT;

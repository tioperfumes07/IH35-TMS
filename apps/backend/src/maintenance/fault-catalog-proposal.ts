/**
 * E-10 addition — ONE definition, used by every fault reader (fault alerts, truck panel, driver profile):
 *   - faultDescriptionSql: the component + failure mode Samsara itself sent with the fault
 *     (raw_payload.faultCodes.j1939.diagnosticTroubleCodes[].spnDescription / fmiDescription) -- no seeded table;
 *   - faultProposalJoinSql: the owner's fault rule for that code (exact code first, else the whole SPN) and the
 *     catalog service task + labor code it proposes (columns proposed_service_task_id / _name,
 *     proposed_labor_code_id / _name, proposal_rule_id on the join alias).
 */
export function faultDescriptionSql(h: string): string {
  return `(SELECT NULLIF(concat_ws(' — ', d->>'spnDescription', d->>'fmiDescription'), '')
             FROM jsonb_array_elements(COALESCE(${h}.raw_payload->'faultCodes'->'j1939'->'diagnosticTroubleCodes', '[]'::jsonb)) d
            WHERE 'SPN ' || (d->>'spnId') || ' FMI ' || (d->>'fmiId') = ${h}.fault_code
            LIMIT 1)`;
}

export function faultProposalJoinSql(h: string, alias = "fault_proposal"): string {
  return `LEFT JOIN LATERAL (
    SELECT r.id::text AS proposal_rule_id,
           r.service_task_id::text AS proposed_service_task_id, st.display_name AS proposed_service_task_name,
           r.labor_code_id::text AS proposed_labor_code_id, lc.display_name AS proposed_labor_code_name
      FROM maintenance.fault_code_severity_rules r
      LEFT JOIN catalogs.maintenance_service_tasks st ON st.id = r.service_task_id
      LEFT JOIN catalogs.maintenance_labor_codes lc ON lc.id = r.labor_code_id
     WHERE r.operating_company_id = ${h}.operating_company_id AND r.active = true
       AND (r.fault_code = ${h}.fault_code OR ${h}.fault_code LIKE r.fault_code || ' FMI %')
     ORDER BY (r.fault_code = ${h}.fault_code) DESC
     LIMIT 1
  ) ${alias} ON true`;
}

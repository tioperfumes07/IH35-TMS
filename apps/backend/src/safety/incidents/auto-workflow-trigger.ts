import { appendCrudAudit } from "../../audit/crud-audit.js";
import { dispatchNotification, listCompanyUserIdsByRoles } from "../../notifications/dispatcher.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

type DriverIncidentType = "accident" | "damage" | "cargo" | "equipment" | "injury" | "breakdown" | "other";
type IncidentSeverity = "info" | "warning" | "critical";

export type IncidentAutoWorkflowInput = {
  incident_id: string;
  operating_company_id: string;
  driver_id: string;
  unit_id: string | null;
  load_id: string;
  type: DriverIncidentType;
  severity: IncidentSeverity;
  description: string;
  occurred_at: string;
};

export type IncidentAutoWorkflowResult = {
  maintenance_work_order_id: string | null;
  accident_id: string | null;
  cargo_claim_id: string | null;
  workers_comp_claim_id: string | null;
  notified_users: number;
};

const REL_MAINTENANCE_WORK_ORDERS = "maintenance.work_orders";
const REL_SAFETY_ACCIDENTS = "safety.accidents";
const REL_SAFETY_CARGO_CLAIMS = "safety.cargo_claims";
const REL_SAFETY_WORKERS_COMP_CLAIMS = "safety.workers_comp_claims";
const TABLE_SAFETY_ACCIDENTS = "accidents";
const TABLE_SAFETY_CARGO_CLAIMS = "cargo_claims";
const TABLE_SAFETY_WORKERS_COMP_CLAIMS = "workers_comp_claims";

async function relationExists(client: DbClient, qualifiedName: string): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>(`SELECT to_regclass($1::text) IS NOT NULL AS ok`, [qualifiedName]);
  return Boolean(res.rows[0]?.ok);
}

async function tableColumns(client: DbClient, schema: string, table: string): Promise<Set<string>> {
  const res = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
    `,
    [schema, table]
  );
  return new Set(res.rows.map((row) => row.column_name));
}

function pick(existingColumns: Set<string>, candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existingColumns.has(candidate)) return candidate;
  }
  return null;
}

async function spawnMaintenanceDraftWorkOrder(client: DbClient, input: IncidentAutoWorkflowInput): Promise<string | null> {
  if (!input.unit_id) return null;
  if (!(await relationExists(client, REL_MAINTENANCE_WORK_ORDERS))) return null;

  const columns = await tableColumns(client, "maintenance", "work_orders");
  const cols: string[] = [];
  const values: unknown[] = [];
  const placeholders: string[] = [];
  const add = (column: string, value: unknown) => {
    cols.push(column);
    values.push(value);
    placeholders.push(`$${values.length}`);
  };

  const displayIdCol = pick(columns, ["display_id"]);
  const sequenceCol = pick(columns, ["unit_sequence"]);
  let generatedDisplayId: string | null = null;
  let generatedSequence: number | null = null;
  if (displayIdCol || sequenceCol) {
    const nextDisplay = await client
      .query<{ display_id: string | null; sequence: number | null }>(
        `
          SELECT display_id, sequence
          FROM maintenance.next_wo_display_id($1::uuid, $2, COALESCE($3::date, CURRENT_DATE), $4::uuid)
        `,
        [input.unit_id, "RS", input.occurred_at, input.operating_company_id]
      )
      .catch(() => ({ rows: [] as Array<{ display_id: string | null; sequence: number | null }> }));
    generatedDisplayId = nextDisplay.rows[0]?.display_id ?? null;
    generatedSequence = nextDisplay.rows[0]?.sequence ?? null;
  }

  const operatingCompanyCol = pick(columns, ["operating_company_id"]);
  if (!operatingCompanyCol) return null;
  add(operatingCompanyCol, input.operating_company_id);

  const woTypeCol = pick(columns, ["wo_type"]);
  if (woTypeCol) add(woTypeCol, "repair");

  const sourceTypeCol = pick(columns, ["source_type"]);
  if (sourceTypeCol) add(sourceTypeCol, "RS");

  const statusCol = pick(columns, ["status"]);
  if (statusCol) add(statusCol, "open");

  const unitCol = pick(columns, ["unit_id", "equipment_id"]);
  if (unitCol) add(unitCol, input.unit_id);

  const driverCol = pick(columns, ["driver_id"]);
  if (driverCol) add(driverCol, input.driver_id);

  const loadCol = pick(columns, ["load_id"]);
  if (loadCol) add(loadCol, input.load_id);

  const openedCol = pick(columns, ["opened_at"]);
  if (openedCol) add(openedCol, input.occurred_at);

  const locationCol = pick(columns, ["repair_location"]);
  if (locationCol) add(locationCol, "roadside");

  const descriptionCol = pick(columns, ["description"]);
  if (descriptionCol) add(descriptionCol, `[incident_auto_workflow] ${input.type}: ${input.description}`);

  if (displayIdCol) add(displayIdCol, generatedDisplayId);
  if (sequenceCol) add(sequenceCol, generatedSequence);

  const originCol = pick(columns, ["origin"]);
  if (originCol) add(originCol, "incident_full_report");

  const titleCol = pick(columns, ["wo_title"]);
  if (titleCol) add(titleCol, `Draft from incident ${input.incident_id}`);

  const bucketCol = pick(columns, ["bucket"]);
  if (bucketCol) add(bucketCol, "roadside");

  const res = await client
    .query<{ id: string }>(
      `
        INSERT INTO maintenance.work_orders (${cols.join(", ")})
        VALUES (${placeholders.join(", ")})
        RETURNING id
      `,
      values
    )
    .catch(() => ({ rows: [] as Array<{ id: string }> }));
  return res.rows[0]?.id ?? null;
}

async function insertDomainRow(
  client: DbClient,
  schema: string,
  table: string,
  input: IncidentAutoWorkflowInput,
  fixedType: "accident" | "cargo" | "workers_comp"
): Promise<string | null> {
  const qualified = `${schema}.${table}`;
  if (!(await relationExists(client, qualified))) return null;

  const columns = await tableColumns(client, schema, table);
  const cols: string[] = [];
  const values: unknown[] = [];
  const placeholders: string[] = [];
  const add = (column: string, value: unknown) => {
    cols.push(column);
    values.push(value);
    placeholders.push(`$${values.length}`);
  };

  const companyCol = pick(columns, ["operating_company_id", "company_id"]);
  if (companyCol) add(companyCol, input.operating_company_id);

  const incidentCol = pick(columns, ["incident_id", "safety_incident_id"]);
  if (incidentCol) add(incidentCol, input.incident_id);

  const driverCol = pick(columns, ["driver_id"]);
  if (driverCol) add(driverCol, input.driver_id);

  const unitCol = pick(columns, ["unit_id"]);
  if (unitCol) add(unitCol, input.unit_id);

  const loadCol = pick(columns, ["load_id"]);
  if (loadCol) add(loadCol, input.load_id);

  const statusCol = pick(columns, ["status"]);
  if (statusCol) add(statusCol, "open");

  const reportedAtCol = pick(columns, ["reported_at", "occurred_at", "incident_at", "created_at"]);
  if (reportedAtCol) add(reportedAtCol, input.occurred_at);

  const descriptionCol = pick(columns, ["description", "summary", "notes"]);
  if (descriptionCol) add(descriptionCol, input.description);

  const insuranceFlagCol = pick(columns, ["insurance_flag", "insurance_required"]);
  if (fixedType === "accident" && insuranceFlagCol) add(insuranceFlagCol, true);

  const typeCol = pick(columns, ["claim_type", "type"]);
  if (typeCol) add(typeCol, fixedType);

  const draftCol = pick(columns, ["is_draft"]);
  if (draftCol) add(draftCol, true);

  const res = await client
    .query<{ id: string }>(
      `
        INSERT INTO ${qualified} (${cols.join(", ")})
        VALUES (${placeholders.join(", ")})
        RETURNING id
      `,
      values
    )
    .catch(() => ({ rows: [] as Array<{ id: string }> }));
  return res.rows[0]?.id ?? null;
}

async function notifyIncidentStakeholders(input: IncidentAutoWorkflowInput): Promise<number> {
  const recipients = await listCompanyUserIdsByRoles(input.operating_company_id, ["Owner", "Safety"]);
  if (recipients.length === 0) return 0;

  let notified = 0;
  await Promise.all(
    recipients.map(async (userId) => {
      const result = await dispatchNotification({
        user_id: userId,
        event_type: "wo.created",
        actor_user_id: null,
        payload: {
          operating_company_id: input.operating_company_id,
          headline: `Incident ${input.type} reported`,
          bodyText: `Incident ${input.incident_id} was submitted and auto-workflow checks were executed.`,
          whatsapp_skip: true,
        },
      }).catch(() => ({ ok: false } as const));
      if (result.ok) notified += 1;
    })
  );
  return notified;
}

export async function triggerIncidentAutoWorkflow(
  client: DbClient,
  actorUserId: string,
  input: IncidentAutoWorkflowInput
): Promise<IncidentAutoWorkflowResult> {
  let maintenanceWorkOrderId: string | null = null;
  let accidentId: string | null = null;
  let cargoClaimId: string | null = null;
  let workersCompClaimId: string | null = null;

  if (input.type === "equipment" || input.type === "breakdown") {
    maintenanceWorkOrderId = await spawnMaintenanceDraftWorkOrder(client, input);
  }
  if (input.type === "accident") {
    if (await relationExists(client, REL_SAFETY_ACCIDENTS)) {
      accidentId = await insertDomainRow(client, "safety", TABLE_SAFETY_ACCIDENTS, input, "accident");
    }
  }
  if (input.type === "cargo") {
    if (await relationExists(client, REL_SAFETY_CARGO_CLAIMS)) {
      cargoClaimId = await insertDomainRow(client, "safety", TABLE_SAFETY_CARGO_CLAIMS, input, "cargo");
    }
  }
  if (input.type === "injury") {
    if (await relationExists(client, REL_SAFETY_WORKERS_COMP_CLAIMS)) {
      workersCompClaimId = await insertDomainRow(client, "safety", TABLE_SAFETY_WORKERS_COMP_CLAIMS, input, "workers_comp");
    }
  }

  const notifiedUsers = await notifyIncidentStakeholders(input);

  await appendCrudAudit(
    client,
    actorUserId,
    "safety.incident.auto_workflow_triggered",
    {
      resource_type: "safety.incidents",
      resource_id: input.incident_id,
      incident_type: input.type,
      maintenance_work_order_id: maintenanceWorkOrderId,
      accident_id: accidentId,
      cargo_claim_id: cargoClaimId,
      workers_comp_claim_id: workersCompClaimId,
      notified_users: notifiedUsers,
    },
    input.severity === "critical" ? "critical" : "info",
    "WF-048"
  );

  return {
    maintenance_work_order_id: maintenanceWorkOrderId,
    accident_id: accidentId,
    cargo_claim_id: cargoClaimId,
    workers_comp_claim_id: workersCompClaimId,
    notified_users: notifiedUsers,
  };
}

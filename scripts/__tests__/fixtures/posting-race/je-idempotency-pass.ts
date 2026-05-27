export const sql = `
INSERT INTO accounting.journal_entries (
  operating_company_id,
  idempotency_key
)
VALUES ($1, $2)
ON CONFLICT (operating_company_id, idempotency_key)
DO NOTHING
RETURNING id::text;
`;

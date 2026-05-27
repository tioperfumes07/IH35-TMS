export const sql = `
INSERT INTO accounting.posting_batches (
  operating_company_id,
  idempotency_key
)
VALUES ($1, $2)
ON CONFLICT (operating_company_id, idempotency_key)
DO NOTHING;

SELECT id
FROM accounting.posting_batches
FOR UPDATE SKIP LOCKED;
`;

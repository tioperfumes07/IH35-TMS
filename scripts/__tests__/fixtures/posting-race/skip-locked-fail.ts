export const sql = `
INSERT INTO accounting.posting_batches (
  operating_company_id,
  idempotency_key
)
VALUES ($1, $2);
`;

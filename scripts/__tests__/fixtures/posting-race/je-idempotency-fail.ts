export const sql = `
INSERT INTO accounting.journal_entries (
  operating_company_id
)
VALUES ($1)
RETURNING id::text;
`;

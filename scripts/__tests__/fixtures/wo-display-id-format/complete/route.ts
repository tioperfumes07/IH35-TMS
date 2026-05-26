const createWorkOrderSchema = {
  source_type: z.enum(["IS", "ES", "AC", "ET", "RT", "IT", "RS"]),
};

await client.query(`
  SELECT display_id, sequence
  FROM maintenance.next_wo_display_id($1, $2, COALESCE($3::date, CURRENT_DATE), $4)
`);

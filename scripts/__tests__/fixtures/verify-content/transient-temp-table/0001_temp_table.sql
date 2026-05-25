DO $$
BEGIN
  CREATE TEMP TABLE tmp_void_seed (id uuid) ON COMMIT DROP;
END
$$;

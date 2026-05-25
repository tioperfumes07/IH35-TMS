CREATE OR REPLACE FUNCTION qa.__seed_helper()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN;
END
$$;

SELECT qa.__seed_helper();

DROP FUNCTION IF EXISTS qa.__seed_helper();

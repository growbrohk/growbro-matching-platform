-- Database clock for public ticket sales, so the buyer's device clock cannot open sales early.

CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT now();
$$;

REVOKE ALL ON FUNCTION public.get_server_time() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_server_time() TO anon, authenticated;

COMMENT ON FUNCTION public.get_server_time() IS 'Returns the database clock. Public ticket pages use this so scheduled sales open at the saved start time.';

-- The table check constraint calls this validator during server-side inserts.
grant usage on schema private to service_role;
grant execute on function private.rafid_valid_stage_timings(jsonb) to service_role;

notify pgrst, 'reload schema';

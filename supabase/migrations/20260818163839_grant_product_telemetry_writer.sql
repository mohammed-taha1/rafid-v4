-- Allow only the server-side Supabase role to append privacy-safe product events.
grant insert on table public.rafid_product_events to service_role;
grant usage, select on sequence public.rafid_product_events_id_seq to service_role;

notify pgrst, 'reload schema';

-- Signup invokes this function through a trigger, never through the public API.
-- Trigger execution remains available to the Auth service.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

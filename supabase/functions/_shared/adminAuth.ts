export function checkAdminAuth(req: Request): boolean {
  const password = req.headers.get("x-admin-password");
  const expected = Deno.env.get("ADMIN_PASSWORD");
  return Boolean(password) && password === expected;
}

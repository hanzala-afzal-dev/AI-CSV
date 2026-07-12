import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRuntime } from "./runtime";

export async function getCurrentSession() {
  const token = (await cookies()).get(getRuntime().env.SESSION_COOKIE_NAME)?.value;
  return token ? getRuntime().identityService.authenticateSession(token) : null;
}

export async function requireCurrentSession() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

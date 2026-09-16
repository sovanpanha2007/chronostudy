import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { privateResponse } from "@/lib/http";

// Verify the auth user and refresh cookies. Proxy runs on every request including prefetches,
// so anything needing the database (the `onboarded_at` gate) belongs in a
// server component instead.
const PROTECTED_PREFIXES = ["/app", "/onboarding"];
const AUTH_ROUTES = ["/login"];

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !user) {
    return redirectTo("/login", request, response);
  }

  if (user && AUTH_ROUTES.includes(pathname)) {
    return redirectTo("/", request, response);
  }

  return privateResponse(response);
}

// The refreshed auth cookies live on `response`; a bare redirect would drop
// them and force the next request to refresh all over again.
function redirectTo(path: string, request: NextRequest, response: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return privateResponse(redirect);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

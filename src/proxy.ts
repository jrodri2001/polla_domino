import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/jwt";

const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/auth/callback",
  "/forgot-password",
  "/reset-password",
  "/api/events",
];
const ADMIN_ROUTES = ["/admin", "/players"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let public routes through without auth
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    request.nextUrl.host ||
    "polla.juliorodriguez.ca";
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (host.includes("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    const loginUrl = new URL("/login", origin);
    return NextResponse.redirect(loginUrl);
  }

  const payload = await verifySession(token);
  if (!payload) {
    const loginUrl = new URL("/login", origin);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  // Check admin routes
  if (ADMIN_ROUTES.some((r) => pathname.startsWith(r))) {
    if (payload.role !== "admin") {
      return NextResponse.redirect(new URL("/", origin));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
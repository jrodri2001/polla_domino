import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createProxyClient } from "@/lib/supabase/proxy";

const PUBLIC_ROUTES = ["/login", "/signup", "/auth/callback"];
const ADMIN_ROUTES = ["/admin", "/players"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let public routes through without auth
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  const response = NextResponse.next({ request });
  const supabase = createProxyClient(request, response);

  // Refresh the session — this keeps the auth token alive
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Check admin routes
  if (ADMIN_ROUTES.some((r) => pathname.startsWith(r))) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { signSession, SESSION_COOKIE_NAME } from "@/lib/jwt";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    request.nextUrl.host ||
    "polla.juliorodriguez.ca";
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (host.includes("localhost") ? "http" : "https");
  const currentOrigin = `${proto}://${host}`;
  const redirectUri = `${currentOrigin}/auth/callback`;

  if (error || !code) {
    return NextResponse.redirect(`${currentOrigin}/login?error=oauth`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${currentOrigin}/login?error=google_not_configured`);
  }

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Failed to exchange Google token:", tokenData);
      return NextResponse.redirect(`${currentOrigin}/login?error=oauth_token`);
    }

    // Fetch user info from Google
    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await userRes.json();
    if (!profile.email) {
      return NextResponse.redirect(`${currentOrigin}/login?error=oauth_profile`);
    }

    const email = profile.email.toLowerCase().trim();
    const name = profile.name || email.split("@")[0];

    // Find or create player in SQLite
    let player = db
      .prepare("SELECT id, name, email, role, active FROM players WHERE LOWER(email) = LOWER(?)")
      .get(email) as { id: string; name: string; email: string; role: "admin" | "player"; active: number } | undefined;

    if (!player) {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO players (id, name, email, active, role, created_at)
        VALUES (?, ?, ?, 1, 'player', datetime('now'))
      `).run(id, name, email);
      player = { id, name, email, role: "player", active: 1 };
    }

    const token = await signSession({
      userId: player.id,
      email: player.email,
      role: player.role,
      playerId: player.id,
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: currentOrigin.startsWith("https"),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return NextResponse.redirect(`${currentOrigin}/`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(`${currentOrigin}/login?error=server_error`);
  }
}
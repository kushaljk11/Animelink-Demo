import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "rtn_session";

/**
 * Cheap gate for /app/*: no session cookie → /login. The frontend holds no JWT
 * secret; the (app) layout validates the session with the API (GET /auth/me)
 * and redirects if it is expired or revoked.
 */
export function middleware(req: NextRequest) {
  if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/app/:path*"] };

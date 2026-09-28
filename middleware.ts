import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Every page and API route needs the signed session cookie, except the
// unlock page itself and the route that checks the passcode.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/unlock" || pathname === "/api/unlock") {
    if (ok && pathname === "/unlock") return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/unlock", req.url));
}

export const config = {
  // Static files needed to install the app and draw the unlock screen stay public.
  matcher: ["/((?!_next/static|_next/image|icons/|favicon.ico|manifest.webmanifest|sw.js|robots.txt).*)"],
};

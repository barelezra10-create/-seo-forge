import { NextResponse, type NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Pass pathname through to RSC layout via header
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next({ request: { headers } });
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

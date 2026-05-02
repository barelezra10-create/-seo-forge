import { NextResponse } from "next/server";
import { issueSession, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST(req: Request) {
  const formData = await req.formData();
  const password = String(formData.get("password") ?? "");
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected || password !== expected) {
    const url = new URL(req.url);
    url.pathname = "/login";
    url.searchParams.set("error", "1");
    return NextResponse.redirect(url, { status: 303 });
  }

  const token = await issueSession();
  const url = new URL(req.url);
  url.pathname = "/overview";
  url.search = "";
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}

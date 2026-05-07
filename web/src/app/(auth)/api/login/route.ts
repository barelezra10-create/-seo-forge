import { NextResponse } from "next/server";
import { issueSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { publicUrl } from "@/lib/redirect";

export async function POST(req: Request) {
  const formData = await req.formData();
  const password = String(formData.get("password") ?? "");
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected || password !== expected) {
    return NextResponse.redirect(publicUrl(req, "/login", "?error=1"), { status: 303 });
  }

  const token = await issueSession();
  const res = NextResponse.redirect(publicUrl(req, "/overview"), { status: 303 });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}

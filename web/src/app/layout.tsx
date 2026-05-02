import type { Metadata } from "next";
import { headers } from "next/headers";
import { Sidebar } from "@/components/layout/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Forge",
  description: "SEO automation control plane",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? "/";
  const isAuthLayout = pathname === "/login";

  return (
    <html lang="en">
      <body className="bg-zinc-50">
        {isAuthLayout ? (
          children
        ) : (
          <div className="min-h-screen flex">
            <Sidebar pathname={pathname} />
            <div className="flex-1 flex flex-col">{children}</div>
          </div>
        )}
      </body>
    </html>
  );
}

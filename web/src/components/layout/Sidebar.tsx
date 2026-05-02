import Link from "next/link";
import { LayoutGrid, Globe, FileText, TrendingUp, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutGrid },
  { href: "/sites", label: "Sites", icon: Globe },
  { href: "/articles", label: "Articles", icon: FileText },
  { href: "/opportunities", label: "Opportunities", icon: TrendingUp },
  { href: "/jobs", label: "Jobs", icon: ListChecks },
] as const;

export function Sidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="w-56 shrink-0 border-r border-zinc-200 bg-white">
      <div className="px-6 py-5 border-b border-zinc-200">
        <Link href="/overview" className="text-lg font-bold tracking-tight">
          SEO Forge
        </Link>
      </div>
      <nav className="p-3">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm",
                active ? "bg-zinc-100 font-medium" : "text-zinc-600 hover:bg-zinc-100",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

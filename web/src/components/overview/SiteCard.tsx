import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkline, type SparklinePoint } from "./Sparkline";
import { formatNumber } from "@/lib/utils";

export type SiteCardData = {
  id: string;
  name: string;
  domain: string;
  killSwitch: boolean;
  articleCount: number;
  gscClicks28d: number;
  gscImpressions28d: number;
  domainRating: number;
  trend: SparklinePoint[];
};

export function SiteCard({ data }: { data: SiteCardData }) {
  return (
    <Link href={`/sites/${data.id}`}>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{data.name}</h3>
              <p className="text-xs text-zinc-500">{data.domain}</p>
            </div>
            {data.killSwitch && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">paused</span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-xs text-zinc-500">Clicks 28d</p>
              <p className="font-semibold">{formatNumber(data.gscClicks28d)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Impr. 28d</p>
              <p className="font-semibold">{formatNumber(data.gscImpressions28d)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">DR</p>
              <p className="font-semibold">{data.domainRating.toFixed(1)}</p>
            </div>
          </div>
          <div>
            <Sparkline data={data.trend} />
          </div>
          <p className="text-xs text-zinc-500">{formatNumber(data.articleCount)} articles indexed</p>
        </CardContent>
      </Card>
    </Link>
  );
}

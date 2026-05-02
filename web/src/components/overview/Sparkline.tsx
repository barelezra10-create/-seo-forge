"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

export type SparklinePoint = { date: string; value: number };

export function Sparkline({ data, color = "#2952ff" }: { data: SparklinePoint[]; color?: string }) {
  if (data.length === 0) {
    return <div className="text-xs text-zinc-400 italic">no data yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={data}>
        <YAxis hide domain={[0, "dataMax + 1"]} />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

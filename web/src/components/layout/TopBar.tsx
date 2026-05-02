export function TopBar({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <header className="border-b border-zinc-200 bg-white px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex items-center gap-2">{actions}</div>
    </header>
  );
}

export function Stat({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="p-3 text-center">
      <div className="text-xs text-white/45">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${active ? "text-lime-200" : "text-white"}`}>{value}</div>
    </div>
  );
}

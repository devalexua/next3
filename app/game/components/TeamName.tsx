export function TeamName({ name, align }: { name: string; align: "left" | "right" }) {
  return <div className={`min-w-0 text-base font-semibold text-white ${align === "right" ? "text-right" : "text-left"}`}>{name}</div>;
}

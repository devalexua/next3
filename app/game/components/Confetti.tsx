export function Confetti() {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {Array.from({ length: 24 }).map((_, index) => (
        <span key={index} className="confetti-piece" style={{ left: `${(index * 37) % 100}%`, animationDelay: `${(index % 8) * 80}ms` }} />
      ))}
    </div>
  );
}

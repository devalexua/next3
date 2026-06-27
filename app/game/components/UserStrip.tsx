import { ShieldCheck } from "lucide-react";
import type { User } from "../types.js";

export function UserStrip({ user }: { user: User }) {
  return (
    <section className="mb-5 flex items-center gap-3 rounded-lg border border-lime-300/20 bg-lime-300/10 p-3">
      <ShieldCheck className="text-lime-200" size={22} />
      <div>
        <div className="text-sm text-white/60">Signed in as</div>
        <div className="font-semibold text-white">{user.username}</div>
      </div>
    </section>
  );
}

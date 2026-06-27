import type React from "react";

export function AuthPanel(props: {
  authMode: "login" | "register";
  setAuthMode: (mode: "login" | "register") => void;
  username: string;
  setUsername: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  error: string;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <section className="mb-5 rounded-lg border border-white/10 bg-black/25 p-4 shadow-2xl shadow-black/20">
      <div className="mb-4 flex rounded-md bg-black/35 p-1">
        {(["login", "register"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => props.setAuthMode(mode)}
            className={`h-10 flex-1 rounded text-sm font-medium capitalize ${props.authMode === mode ? "bg-lime-300 text-black" : "text-white/70"}`}
          >
            {mode}
          </button>
        ))}
      </div>
      <form onSubmit={props.onSubmit} className="space-y-3">
        <input value={props.username} onChange={(event) => props.setUsername(event.target.value)} placeholder="Username" className="h-12 w-full rounded-md border border-white/10 bg-black/30 px-3 text-white outline-none focus:border-lime-300" />
        <input value={props.password} onChange={(event) => props.setPassword(event.target.value)} placeholder="Password" type="password" className="h-12 w-full rounded-md border border-white/10 bg-black/30 px-3 text-white outline-none focus:border-lime-300" />
        {props.error ? <p className="text-sm text-red-300">{props.error}</p> : null}
        <button className="h-12 w-full rounded-md bg-lime-300 font-semibold text-black">Continue</button>
      </form>
    </section>
  );
}

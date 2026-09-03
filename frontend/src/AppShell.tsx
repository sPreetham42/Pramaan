import { createContext, useContext, useState, type ReactNode } from "react";
import { navigate, type Route } from "./router";
import type { Role } from "./types";

const ROLE_KEY = "pramaan-role";

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue>({
  role: "government",
  setRole: () => undefined,
});

export function useRole(): RoleContextValue {
  return useContext(RoleContext);
}

const NAV: { route: string; label: string; active: (r: Route) => boolean }[] = [
  { route: "/overview", label: "Overview", active: (r) => r.name === "overview" },
  { route: "/challenges", label: "Challenges", active: (r) => r.name === "challenges" || r.name === "challenge" },
  { route: "/startups", label: "Startups", active: (r) => r.name === "startups" || r.name === "startup" },
  { route: "/evidence", label: "Evidence", active: (r) => r.name === "evidence" },
  { route: "/records", label: "Verified records", active: (r) => r.name === "records" || r.name === "record" },
];

const ROLES: { value: Role; label: string }[] = [
  { value: "government", label: "Government" },
  { value: "startup", label: "Startup" },
  { value: "validator", label: "Validator" },
];

export default function AppShell({
  route,
  children,
}: {
  route: Route;
  children: ReactNode;
}) {
  const [role, setRoleState] = useState<Role>(
    () => (localStorage.getItem(ROLE_KEY) as Role) || "government",
  );
  const setRole = (next: Role) => {
    localStorage.setItem(ROLE_KEY, next);
    setRoleState(next);
  };

  return (
    <RoleContext.Provider value={{ role, setRole }}>
      <div className="min-h-screen bg-paper text-ink">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-8 gap-y-3 px-6 py-3.5 lg:px-8">
            <button
              type="button"
              className="text-left"
              onClick={() => navigate("/overview")}
              aria-label="PRAMAAN overview"
            >
              <span className="block text-16 font-bold tracking-[0.22em] text-ink">
                PRAMAAN
              </span>
              <span className="block text-11 tracking-wide text-muted">
                Prove once. Reuse the proof.
              </span>
            </button>

            <nav className="order-3 flex w-full items-center gap-6 border-t border-line pt-2.5 text-13 lg:order-none lg:w-auto lg:border-t-0 lg:pt-0">
              {NAV.map((item) => (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => navigate(item.route)}
                  className={
                    item.active(route)
                      ? "border-b-2 border-accent pb-0.5 font-semibold text-ink"
                      : "border-b-2 border-transparent pb-0.5 text-muted hover:text-ink"
                  }
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-3">
              <span className="hidden border border-line px-1.5 py-0.5 text-11 font-semibold uppercase tracking-[0.12em] text-muted sm:inline">
                SIH prototype
              </span>
              <div className="flex border border-line" role="group" aria-label="Demo role">
                {ROLES.map((r, i) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={`px-3 py-1.5 text-12 font-medium ${
                      i > 0 ? "border-l border-line" : ""
                    } ${
                      role === r.value
                        ? "bg-ink text-paper"
                        : "text-muted hover:bg-paper hover:text-ink"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-content px-6 py-8 lg:px-8">{children}</main>

        <footer className="mx-auto max-w-content border-t border-line px-6 py-6 text-12 leading-relaxed text-muted lg:px-8">
          <p>
            PRAMAAN demonstration for the Smart India Hackathon. Criteria are
            locked before outcomes, evidence is verifiable, validation is
            independent, verdicts are deterministic, and verified results are
            reusable. All case-study data is simulated demonstration data.
          </p>
        </footer>
      </div>
    </RoleContext.Provider>
  );
}

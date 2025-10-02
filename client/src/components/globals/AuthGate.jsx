// client/src/components/AuthGate.tsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";

type Status = "loading" | "ok" | "nope";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<Status>("loading");
  const loc = useLocation();

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/me", { credentials: "include" });
        if (!alive) return;
        setStatus(res.ok ? "ok" : "nope");
      } catch {
        if (alive) setStatus("nope");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (status === "loading") return null; // or a spinner
  if (status === "nope") {
    // keep where the user tried to go, so we can come back after login
    const to = "/login-aptos";
    return <Navigate to={to} state={{ from: loc }} replace />;
  }

  return <>{children}</>;
}

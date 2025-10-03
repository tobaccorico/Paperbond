// client/src/components/globals/AuthGate.jsx
import React from "react";
import useSocket from "../../hooks/useSocket";
import LoginAptos from "../../pages/LoginAptos"; // we’ll render this directly if unauth'd

export default function AuthGate({ children }) {
  const [status, setStatus] = React.useState("loading"); // "loading" | "ok" | "nope"
  const { socket } = useSocket();

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/me", { credentials: "include" });
        if (!alive) return;
        const ok = res.ok;
        setStatus(ok ? "ok" : "nope");
        if (ok && socket && !socket.connected) socket.connect(); // connect socket only after auth
      } catch {
        if (alive) setStatus("nope");
      }
    })();
    return () => { alive = false; };
  }, [socket]);

  if (status === "loading") return null;      // or a spinner
  if (status === "nope") return <LoginAptos />; // no router dependency at all
  return <>{children}</>;
}

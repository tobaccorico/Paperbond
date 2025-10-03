// client/src/components/globals/AuthGate.jsx
import React from "react";
import { useDispatch } from "react-redux";
import useSocket from "../../hooks/useSocket";
import { userActions } from "../../store/userSlice";
import LoginAptos from "../../pages/LoginAptos";
import Spinner from "./Spinner";

export default function AuthGate({ children }) {
  const [status, setStatus] = React.useState("loading");
  const { socket } = useSocket();
  const dispatch = useDispatch();

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/me", { credentials: "include" });
        if (!alive) return;
        
        if (res.ok) {
          const data = await res.json();
          // Store user data in Redux
          dispatch(userActions.setUser({ user: data.user }));
          setStatus("ok");
          // Connect socket after successful auth
          if (socket && !socket.connected) socket.connect();
        } else {
          setStatus("nope");
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        if (alive) setStatus("nope");
      }
    })();
    return () => { alive = false; };
  }, [socket, dispatch]);

  if (status === "loading") {
    return (
      <div className="w-full h-full flex items-center justify-center bg-primary">
        <Spinner className="w-12 h-12" />
      </div>
    );
  }
  
  if (status === "nope") return <LoginAptos />;
  
  return <>{children}</>;
}
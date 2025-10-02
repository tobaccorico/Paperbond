// client/src/hooks/useSocket.jsx
import { useSelector } from "react-redux";
import { io } from "socket.io-client";

// CRA uses process.env and requires REACT_APP_ prefix.
// If you don't set REACT_APP_API_BASE, we'll default to same-origin.
const rawBase = process.env.REACT_APP_API_BASE || ""; // e.g. http://localhost:5000
const baseURL = rawBase.replace(/\/$/, "") || undefined;

// Good for both same-origin and cross-origin; harmless if same-origin.
const socket = io(baseURL, {
  withCredentials: true,
});

// Optional: basic diagnostics
socket.on("connect_error", (err) => {
  // eslint-disable-next-line no-console
  console.warn("socket connect_error:", err?.message || err);
});

const useSocket = () => {
  const userId = useSelector((state) => state.userReducer?.user?._id);

  const socketEmit = (event, payload, ack) => {
    socket.emit(event, payload, ack);
  };

  // Return an unsubscribe so components can clean up
  const socketListen = (event, handler) => {
    socket.on(event, handler);
    return () => socket.off(event, handler);
  };

  return { socketEmit, socketListen, userId, socket };
};

export default useSocket;

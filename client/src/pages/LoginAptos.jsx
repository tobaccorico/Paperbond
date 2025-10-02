// client/src/pages/LoginAptos.tsx
import React from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { ConnectWalletButton } from "../wallet/WalletProvider";
import { useLocation, useNavigate } from "react-router-dom";

export default function LoginAptos() {
  const { connected, account, signMessage } = useWallet();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>("");
  const nav = useNavigate();
  type LocState = { from?: { pathname?: string } };
  const loc = useLocation() as unknown as { state?: LocState };


  async function handleLogin() {
    try {
      setError("");
      if (!connected || !account?.address) {
        setError("Connect your Aptos wallet first.");
        return;
      }
      setLoading(true);

      const nonceRes = await fetch("/api/auth/nonce", { method: "POST" });
      const { nonce } = await nonceRes.json();

      const payload = {
        message: "Sign in to Telegram Clone",
        nonce,
        address: true,
        application: "Telegram-Clone",
        chainId: 1,
      } as const;

      const signed = await signMessage(payload);

      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          address: account.address,
          publicKey: signed.publicKey,
          signature: signed.signature,
          fullMessage: signed.fullMessage,
          nonce,
        }),
      });

      if (!verifyRes.ok) throw new Error(await verifyRes.text());

      // Go back to where the user tried to go, else home
      const dest = loc.state?.from?.pathname || "/";
      nav(dest, { replace: true });
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Sign in with Aptos</h1>
      <ConnectWalletButton />
      <button
        onClick={handleLogin}
        disabled={!connected || loading}
        className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
      >
        {loading ? "Signing..." : "Sign Message to Continue"}
      </button>
      {!!error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
}

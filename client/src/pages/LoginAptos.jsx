import React from "react";
import { connectWallet, getAddress, signLoginMessage } from "../hooks/useAptos";

export default function LoginAptos() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [address, setAddress] = React.useState("");

  async function handleConnect() {
    try {
      setError("");
      setLoading(true);
      const addr = await connectWallet();
      setAddress(addr);
    } catch (e) {
      setError(e?.message || "Wallet connect failed");
    } finally {
      setLoading(false);
    }
  }

  function isHexString(s) {
    return typeof s === "string" && /^[0-9a-fA-F]+$/.test(s);
  }
  function toHex0xFromBytes(u8) {
    return "0x" + Array.from(u8).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function tryBase64ToHex0x(s) {
    try {
      const bin = atob(s);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return toHex0xFromBytes(u8);
    } catch (_) {
      return null;
    }
  }

  async function handleLogin() {
    try {
      setError("");
      setLoading(true);

      // 1) get nonce
      const nonceRes = await fetch("/api/auth/nonce", { method: "POST" });
      if (!nonceRes.ok) throw new Error("Failed to get nonce");
      const { nonce } = await nonceRes.json();

      // 2) sign canonical message
      const signed = await signLoginMessage({
        message: "Sign in to Telegram Clone",
        nonce,
        application: "Telegram-Clone",
        chainId: 1,
      });

      // 2a) normalize signature to 0x-hex
      let sig = signed?.signature;
      if (sig instanceof Uint8Array) {
        sig = toHex0xFromBytes(sig);
      } else if (typeof sig === "string") {
        if (sig.startsWith("0x")) {
          // ok
        } else if (isHexString(sig)) {
          sig = "0x" + sig;
        } else {
          const asHex = tryBase64ToHex0x(sig);
          if (asHex) sig = asHex;
        }
      }

      // 2b) get public key and normalize to 0x-hex
      // some wallets don't return pk in signMessage; pull from account()
      let pk = signed?.publicKey;
      if (!pk && window.aptos?.account) {
        try {
          const acc = await window.aptos.account();
          pk = acc?.publicKey;
        } catch {}
      }
      if (pk && typeof pk === "string" && !pk.startsWith("0x") && isHexString(pk)) {
        pk = "0x" + pk;
      }

      const addr = signed?.address || address;

      console.log("verify payload preview:", {
        address: addr,
        publicKeyLen: pk?.length,
        signatureLen: sig?.length,
        signatureStarts: typeof sig === "string" ? sig.slice(0, 6) : "(non-string)",
        hasFullMessage: !!signed?.fullMessage,
        nonce,
      });

      // 3) verify on server
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          address: addr,
          publicKey: pk,
          signature: sig,
          fullMessage: signed?.fullMessage,
          nonce,
        }),
      });

      if (!verifyRes.ok) {
        const txt = await verifyRes.text();
        throw new Error(txt || "Verify failed");
      }

      window.location.href = "/";
    } catch (e) {
      setError(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Sign in with Aptos</h1>

      <button
        onClick={handleConnect}
        className="px-4 py-2 rounded bg-blue-600 text-white"
        disabled={loading}
      >
        {address ? `Connected: ${address.slice(0, 6)}…${address.slice(-4)}` : "Connect Wallet"}
      </button>

      <button
        onClick={handleLogin}
        disabled={!address || loading}
        className="px-4 py-2 rounded bg-green-600 text-white disabled:opacity-50"
      >
        {loading ? "Signing..." : "Sign Message to Continue"}
      </button>

      {!!error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
}

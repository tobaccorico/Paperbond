// src/hooks/useAptosAuth.jsx
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useState } from "react";

export function useAptosAuth() {
  const { connect, account, connected, disconnect, signMessage } = useWallet();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Full authentication flow:
   * 1. Connect wallet
   * 2. Request nonce from server
   * 3. Sign message with wallet
   * 4. Verify signature on server
   * 5. Receive JWT cookie
   */
  const authenticateWithAptos = async () => {
    setIsAuthenticating(true);
    setError(null);

    try {
      // Don't try to connect here - assume already connected
      // Just wait for account to be available
      let attempts = 0;
      while (!account?.address && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        attempts++;
      }

      if (!account?.address) {
        throw new Error("Wallet connected but no account available");
      }

      const address = account.address;
      const publicKey = account.publicKey;

      // Step 2: Request nonce from server
      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });

      if (!nonceRes.ok) {
        const errData = await nonceRes.json();
        throw new Error(errData.error || "Failed to get nonce");
      }

      const { nonce } = await nonceRes.json();

      // Step 3: Sign message with wallet
      const message = `Welcome to Paperbond!\n\nSign this message to authenticate.\n\nNonce: ${nonce}`;
      
      const response = await signMessage({
        message,
        nonce,
      });

      // Step 4: Verify signature on server
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Important: send/receive cookies
        body: JSON.stringify({
          address,
          publicKey,
          signature: response.signature,
          message: response.fullMessage || message,
          nonce,
        }),
      });

      if (!verifyRes.ok) {
        const errData = await verifyRes.json();
        throw new Error(errData.error || "Authentication failed");
      }

      const { user } = await verifyRes.json();
      
      setIsAuthenticating(false);
      return user;

    } catch (err) {
      console.error("Authentication error:", err);
      setError(err.message);
      setIsAuthenticating(false);
      throw err;
    }
  };

  const logout = async () => {
    await disconnect();
    // Clear auth cookie by calling logout endpoint (you'll need to create this)
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  };

  return {
    authenticateWithAptos,
    isAuthenticating,
    error,
    connected,
    account,
    logout,
  };
}
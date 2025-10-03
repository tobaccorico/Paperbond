import React, { useEffect } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useDispatch } from "react-redux";
import { authActions } from "../store/authSlice";
import Spinner from "../components/globals/Spinner";

export default function LoginAptos() {
  const { wallets, connect, account, connected, signMessage } = useWallet();
  const dispatch = useDispatch();
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  const [error, setError] = React.useState(null);

  useEffect(() => {
    console.log("Wallet state changed:", {
      connected,
      hasAccount: !!account,
      address: account?.address,
      publicKey: account?.publicKey,
    });
  }, [connected, account]);

  useEffect(() => {
    if (connected && account?.address && !isAuthenticating) {
      console.log("Triggering authentication flow...");
      handleAuthentication();
    }
  }, [connected, account]);

  const handleAuthentication = async () => {
    console.log("Starting authentication...");
    setIsAuthenticating(true);
    setError(null);

    try {
      const address = account.address.toString();
      const publicKey = account.publicKey.toString();
      
      console.log("1. Getting nonce for address:", address);

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
      console.log("2. Received nonce:", nonce);

      const message = `Welcome to Paperbond!\n\nSign this message to authenticate.\n\nNonce: ${nonce}`;
      
      console.log("3. Using Petra native API for signing...");
      
      // Use Petra's native signMessage instead of wallet adapter
      if (!window.aptos) {
        throw new Error("Petra wallet not found");
      }      

      const signResponse = await window.aptos.signMessage({
        message,
        nonce,
      });

      console.log("4. Full signature response:", signResponse);
      console.log("4a. fullMessage:", signResponse.fullMessage);
      console.log("4b. fullMessage length:", signResponse.fullMessage?.length);
      console.log("4c. Original message:", message);
      console.log("4d. Original message length:", message.length);

      console.log("5. Verifying signature with backend...");
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          address,
          publicKey,
          signature: signResponse.signature,
          message: signResponse.fullMessage, // Use fullMessage, not the original message
          nonce,
        }),
      });

      if (!verifyRes.ok) {
        const errData = await verifyRes.json();
        throw new Error(errData.error || "Authentication failed");
      }

      const { user } = await verifyRes.json();
      console.log("6. Authentication successful! User:", user);

      dispatch(authActions.login());
    } catch (err) {
      console.error("Authentication error:", err);
      setError(err.message);
      setIsAuthenticating(false);
    }
  };

  const handleWalletClick = async (walletName) => {
    console.log("Connecting to wallet:", walletName);
    try {
      setError(null);
      await connect(walletName);
      console.log("Connect call completed");
    } catch (err) {
      console.error("Connection error:", err);
      setError(err.message);
    }
  };

  console.log("Rendering LoginAptos. Available wallets:", wallets?.length);

  return (
    <div className="chat-bg w-full h-full flex items-center justify-center px-[1rem]">
      <div className="basis-[35rem] bg-primary p-8 rounded-xl shadow-lg">
        <h1 className="text-cta-icon font-semibold text-[2rem] uppercase mb-[2rem]">
          Connect Wallet
        </h1>
        
        <p className="text-secondary-text mb-6">
          Connect your Aptos wallet to sign in to Paperbond
        </p>

        {error && (
          <div className="bg-danger/10 border border-danger text-danger p-4 rounded-lg mb-4">
            {error}
          </div>
        )}

        {isAuthenticating && (
          <div className="text-center py-8">
            <Spinner className="w-12 h-12 mx-auto mb-4" />
            <p className="text-secondary-text">Authenticating...</p>
          </div>
        )}

        {!isAuthenticating && (
          <div className="flex flex-col gap-3">
            {wallets?.map((wallet) => (
              <button
                key={wallet.name}
                onClick={() => handleWalletClick(wallet.name)}
                disabled={isAuthenticating}
                className="bg-secondary hover:bg-secondary/80 p-4 rounded-xl flex items-center gap-4 transition-all disabled:opacity-50"
              >
                {wallet.icon && (
                  <img src={wallet.icon} alt={wallet.name} className="w-10 h-10 rounded-lg" />
                )}
                <div className="flex-1 text-left">
                  <div className="font-semibold text-primary-text">{wallet.name}</div>
                </div>
              </button>
            ))}

            {(!wallets || wallets.length === 0) && (
              <div className="text-center py-8">
                <p className="text-secondary-text mb-4">No Aptos wallets detected</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
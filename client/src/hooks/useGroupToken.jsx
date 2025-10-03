import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useState, useCallback } from "react";
import { useDispatch } from "react-redux";
import { notificationActions } from "../store/notificationSlice";

export function useGroupToken() {
  const { signAndSubmitTransaction, account } = useWallet();
  console.log("Wallet state:", { 
    hasAccount: !!account, 
    address: account?.address 
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [tokenInfo, setTokenInfo] = useState(null);
  const dispatch = useDispatch();

  const initializeGroupToken = useCallback(async (groupChatId) => {
    setIsProcessing(true);
    try {
      console.log("Calling backend with groupChatId:", groupChatId);
      
      const res = await fetch("/api/group-token/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ groupChatId }),
      });

      console.log("Backend response status:", res.status);
      
      if (!res.ok) {
        const err = await res.json();
        console.error("Backend error:", err);
        throw new Error(err.message || "Failed to prepare initialization");
      }

      const { data } = await res.json();
      console.log("Full response data:", data);
      console.log("Type of data.transaction:", typeof data.transaction);
      console.log("Is data.transaction an object?", data.transaction && typeof data.transaction === 'object');

      if (!data.transaction) {
        throw new Error("No transaction in response");
      }

      console.log("About to call signAndSubmitTransaction with:", data.transaction);
      const response = await signAndSubmitTransaction(data.transaction);
      console.log("Transaction submitted:", response);

      // Changed: no longer passing moduleAddress, backend gets it from factory
      await fetch("/api/group-token/confirm-initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          groupChatId,
          txHash: response.hash,
        }),
      });

      dispatch(
        notificationActions.addNotification({
          message: "Group token initialized!",
          type: "success",
        })
      );

      return response;
    } catch (error) {
      dispatch(
        notificationActions.addNotification({
          message: error.message || "Failed to initialize token",
          type: "error",
        })
      );
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [account, signAndSubmitTransaction, dispatch]);

  const buyTokens = useCallback(async (groupChatId, usdcAmount) => {
    setIsProcessing(true);
    try {
      const res = await fetch("/api/group-token/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ groupChatId, usdcAmount }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to prepare buy");
      }

      const { data } = await res.json();
      const response = await signAndSubmitTransaction(data.transaction);

      dispatch(
        notificationActions.addNotification({
          message: "Successfully joined group!",
          type: "success",
        })
      );

      return response;
    } catch (error) {
      dispatch(
        notificationActions.addNotification({
          message: error.message || "Failed to join group",
          type: "error",
        })
      );
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [signAndSubmitTransaction, dispatch]);

  const sellTokens = useCallback(async (groupChatId, tokenAmount) => {
    setIsProcessing(true);
    try {
      const res = await fetch("/api/group-token/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ groupChatId, tokenAmount }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to prepare sell");
      }

      const { data } = await res.json();
      const response = await signAndSubmitTransaction(data.transaction);

      dispatch(
        notificationActions.addNotification({
          message: "Successfully left group",
          type: "success",
        })
      );

      return response;
    } catch (error) {
      dispatch(
        notificationActions.addNotification({
          message: error.message || "Failed to leave group",
          type: "error",
        })
      );
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [signAndSubmitTransaction, dispatch]);

  const fetchTokenInfo = useCallback(async (groupChatId) => {
    try {
      const res = await fetch(`/api/group-token/${groupChatId}`, {
        credentials: "include",
      });

      if (!res.ok) return null;

      const { data } = await res.json();
      setTokenInfo(data);
      return data;
    } catch (error) {
      console.error("Failed to fetch token info:", error);
      return null;
    }
  }, []);

  const registerAndMintUSDC = useCallback(async () => {
    try {
      const regRes = await fetch("/api/group-token/register-usdc", {
        method: "POST",
        credentials: "include",
      });
      
      if (regRes.ok) {
        const { data } = await regRes.json();
        await signAndSubmitTransaction(data.transaction);
      }
      
      await fetch("/api/group-token/mint-usdc", {
        method: "POST",
        credentials: "include",
      });
      
      dispatch(
        notificationActions.addNotification({
          message: "Mock USDC received!",
          type: "success",
        })
      );
    } catch (error) {
      dispatch(
        notificationActions.addNotification({
          message: error.message || "Failed to get USDC",
          type: "error",
        })
      );
    }
  }, [signAndSubmitTransaction, dispatch]);

  return {
    initializeGroupToken,
    buyTokens,
    sellTokens,
    fetchTokenInfo,
    registerAndMintUSDC,
    isProcessing,
    tokenInfo,
  };
}
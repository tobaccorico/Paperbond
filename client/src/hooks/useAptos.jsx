import React from "react";
import {
  AptosWalletAdapterProvider,
  useWallet,
} from "@aptos-labs/wallet-adapter-react";
// Basic modal UI; swap to your own if you prefer
import { WalletSelector } from "@aptos-labs/wallet-adapter-ant-design";

// If you want specific legacy wallets, import their plugins and pass in `plugins`.
// Modern AIP-62 wallets work without plugins.

export default function WalletProvider({ children }) {
  return (
    <AptosWalletAdapterProvider autoConnect={true}>
      {children}
    </AptosWalletAdapterProvider>
  );
}

// Small header component you can put on your login screen
export function ConnectWalletButton() {
  return <WalletSelector />;
}

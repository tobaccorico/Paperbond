// src/providers/AptosProvider.jsx
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

export function AptosProvider({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AptosWalletAdapterProvider
        autoConnect={true}
        dappConfig={{
          network: Network.TESTNET,
          // Disable Aptos Connect (social logins)
          aptosConnect: {
            dappId: undefined, // This disables Aptos Connect
          },
        }}
        onError={(error) => {
          console.error("Wallet adapter error:", error);
        }}
      >
        {children}
      </AptosWalletAdapterProvider>
    </QueryClientProvider>
  );
}
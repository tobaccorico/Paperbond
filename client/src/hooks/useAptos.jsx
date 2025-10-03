// Minimal Petra-compatible bridge without adapter deps (pure JS)

/** Wait briefly for wallet injection (Petra injects window.aptos) */
function waitForWallet(timeoutMs = 3000, intervalMs = 100) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (window.aptos) return resolve();
      if (Date.now() - started > timeoutMs) return resolve();
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

export async function ensureWallet() {
  await waitForWallet();
  if (!window.aptos) {
    throw new Error(
      "No Aptos wallet detected. Install Petra (https://petra.app/) and refresh."
    );
  }
}

export async function connectWallet() {
  await ensureWallet();
  try {
    if (await window.aptos.isConnected()) {
      const acc = await window.aptos.account();
      return acc.address;
    }
  } catch (_) {}
  // Most wallets accept connect() with no args; Petra does.
  const res = await window.aptos.connect();
  return res.address;
}

export async function getAddress() {
  await ensureWallet();
  const acc = await window.aptos.account();
  return acc.address;
}

/**
 * Sign the canonical login message returned by the wallet.
 * Returns { publicKey, signature, fullMessage, ... } as expected by your server.
 */
export async function signLoginMessage({
  message,
  nonce,
  application = "Paperbond", // <-- keep this in sync with server if you ever validate it
  chainId = 1,
}) {
  await ensureWallet();
  if (typeof window.aptos.signMessage !== "function") {
    throw new Error("This wallet does not support signMessage.");
  }
  return window.aptos.signMessage({
    message,
    nonce,
    address: true,
    application,
    chainId,
  });
}

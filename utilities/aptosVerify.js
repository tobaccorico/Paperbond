const { sha3_256 } = require("@noble/hashes/sha3");
const { ed25519 } = require("@noble/ed25519");

/**
 * Verifies an Aptos Wallet Standard message signature.
 * We receive:
 *  - publicKey: 0x.. hex (32 bytes)
 *  - signature: 0x.. hex (64 bytes)
 *  - message:   the exact `fullMessage` string returned by the wallet adapter
 *
 * According to the standard, wallets sign the UTF-8 bytes of `fullMessage`.
 */
exports.verifyAptosSignature = async ({ publicKey, signature, message }) => {
  try {
    const pub = hexToBytes(publicKey);
    const sig = hexToBytes(signature);
    const msgBytes = new TextEncoder().encode(message);

    // Ed25519 verify (no prehash; message is raw bytes)
    return await ed25519.verify(sig, msgBytes, pub);
  } catch {
    return false;
  }
};

function hexToBytes(h) {
  let s = h.startsWith("0x") ? h.slice(2) : h;
  if (s.length % 2 !== 0) s = "0" + s;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

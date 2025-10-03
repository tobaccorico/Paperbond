// utilities/aptosVerify.js
// Use ESM-only noble from CommonJS via dynamic import
let _ed25519Promise;
function getEd25519() {
  if (!_ed25519Promise) _ed25519Promise = import("@noble/ed25519");
  return _ed25519Promise;
}

function isHex(s) {
  return typeof s === "string" && /^[0-9a-fA-F]+$/.test(s);
}

function hexToBytes(h) {
  let s = (h || "").trim();
  if (s.startsWith("0x") || s.startsWith("0X")) s = s.slice(2);
  if (!isHex(s)) throw new Error("not-hex");
  if (s.length % 2) s = "0" + s;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function b64ToBytes(b64) {
  // tolerate base64url
  let s = String(b64).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  if (typeof atob === "function") {
    const bin = atob(s);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  } else {
    // node
    return new Uint8Array(Buffer.from(s, "base64"));
  }
}

function toBytes(any) {
  if (!any && any !== 0) throw new Error("empty");
  if (any instanceof Uint8Array) return any;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(any)) return new Uint8Array(any);
  if (Array.isArray(any)) return new Uint8Array(any);
  if (typeof any === "string") {
    const s = any.trim();
    try {
      if (s.startsWith("0x") || s.startsWith("0X") || isHex(s)) return hexToBytes(s);
    } catch (_) {}
    // fall back to base64/base64url
    return b64ToBytes(s);
  }
  throw new Error("unsupported type");
}

/**
 * Verify Ed25519 over the EXACT UTF-8 bytes of `message`.
 * Accepts publicKey/signature as hex (0x-ok or bare), base64/base64url, or byte arrays.
 */
exports.verifyEd25519Flexible = async ({ publicKey, signature, message }) => {
  const { ed25519 } = await getEd25519();
  const pub = toBytes(publicKey);
  const sig = toBytes(signature);
  const msgBytes = new TextEncoder().encode(message);
  if (pub.length !== 32) return false;   // 32-byte Ed25519 public key
  if (sig.length !== 64) return false;   // 64-byte signature
  return ed25519.verify(sig, msgBytes, pub);
};

import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function deriveEncryptionKey(secret: string): Uint8Array {
  const buf = crypto.createHash("sha256").update(secret).digest();
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export function encryptKey(plaintext: string, secret: string): string {
  const key = deriveEncryptionKey(secret);
  const iv = new Uint8Array(crypto.randomBytes(IV_LEN));
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const a = new Uint8Array(cipher.update(plaintext, "utf8"));
  const b = new Uint8Array(cipher.final());
  const tag = new Uint8Array(cipher.getAuthTag());
  const out = new Uint8Array(iv.length + tag.length + a.length + b.length);
  out.set(iv, 0);
  out.set(tag, iv.length);
  out.set(a, iv.length + tag.length);
  out.set(b, iv.length + tag.length + a.length);
  return Buffer.from(out).toString("base64");
}

export function decryptKey(blob: string, secret: string): string {
  const key = deriveEncryptionKey(secret);
  const raw = Buffer.from(blob, "base64");
  const buf = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const iv = buf.slice(0, IV_LEN);
  const tag = buf.slice(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = buf.slice(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const a = new Uint8Array(decipher.update(encrypted));
  const b = new Uint8Array(decipher.final());
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  return Buffer.from(merged).toString("utf8");
}

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_LEN = 16;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SCRYPT_SALT_LEN);
  const derived = crypto.scryptSync(password, new Uint8Array(salt), SCRYPT_KEYLEN);
  return salt.toString("hex") + ":" + (derived as Buffer).toString("hex");
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(Buffer.from(saltHex, "hex"));
  const expected = new Uint8Array(Buffer.from(hashHex, "hex"));
  const derived = new Uint8Array(crypto.scryptSync(password, salt, SCRYPT_KEYLEN));
  return crypto.timingSafeEqual(derived, expected);
}

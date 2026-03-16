import type { VercelRequest, VercelResponse } from "@vercel/node";
import { encryptKey } from "./_lib/crypto";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "ENCRYPTION_SECRET not configured" });
  }

  try {
    const { key } = req.body ?? {};
    if (!key || typeof key !== "string") {
      return res.status(400).json({ error: "Missing key" });
    }

    const encrypted = encryptKey(key.trim(), secret);
    return res.status(200).json({ encrypted });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Encryption failed",
    });
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { decryptKey } from "./_lib/crypto";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "ENCRYPTION_SECRET not configured" });
  }

  try {
    const { encrypted } = req.body ?? {};
    if (!encrypted || typeof encrypted !== "string") {
      return res.status(400).json({ error: "Missing encrypted key" });
    }

    const plaintext = decryptKey(encrypted, secret);
    return res.status(200).json({ key: plaintext });
  } catch {
    return res
      .status(400)
      .json({ error: "Failed to decrypt — key may be corrupted" });
  }
}

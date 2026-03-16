import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyPassword } from "../_lib/crypto";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { password, hash } = req.body ?? {};
    if (!password || !hash) {
      return res.status(400).json({ error: "Missing password or hash" });
    }

    const valid = verifyPassword(password, hash);
    return res.status(200).json({ valid });
  } catch {
    return res.status(200).json({ valid: false });
  }
}

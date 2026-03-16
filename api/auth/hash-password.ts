import type { VercelRequest, VercelResponse } from "@vercel/node";
import { hashPassword } from "../_lib/crypto";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { password } = req.body ?? {};
    if (!password || typeof password !== "string") {
      return res.status(400).json({ error: "Missing password" });
    }

    const hash = hashPassword(password);
    return res.status(200).json({ hash });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Hash failed",
    });
  }
}

import { defineConfig, loadEnv, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import type { Connect } from "vite";
import {
  decryptKey,
  encryptKey,
  hashPassword,
  verifyPassword,
} from "../api/_lib/crypto";

function muxUploadPlugin(): PluginOption {
  let muxTokenId: string;
  let muxTokenSecret: string;

  return {
    name: "mux-upload-api",
    configResolved(config) {
      const env = loadEnv(config.mode, path.resolve(__dirname, ".."), "");
      muxTokenId = env.MUX_TOKEN_ID ?? "";
      muxTokenSecret = env.MUX_TOKEN_SECRET ?? "";
    },
    configureServer(server) {
      const muxAuth = () =>
        "Basic " +
        Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString("base64");

      server.middlewares.use("/api/mux/upload", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        if (!muxTokenId || !muxTokenSecret) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error: "MUX_TOKEN_ID or MUX_TOKEN_SECRET not set",
            })
          );
          return;
        }

        try {
          const muxRes = await fetch(
            "https://api.mux.com/video/v1/uploads",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: muxAuth(),
              },
              body: JSON.stringify({
                cors_origin: "*",
                new_asset_settings: {
                  playback_policies: ["public"],
                  video_quality: "basic",
                  static_renditions: [{ resolution: "highest" }],
                },
              }),
            }
          );

          const body = await muxRes.json();

          res.setHeader("Content-Type", "application/json");
          if (!muxRes.ok) {
            res.statusCode = muxRes.status;
            res.end(JSON.stringify({ error: body }));
            return;
          }

          res.statusCode = 200;
          res.end(
            JSON.stringify({
              upload_url: body.data.url,
              upload_id: body.data.id,
              asset_id: body.data.asset_id,
            })
          );
        } catch (err) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Unknown error",
            })
          );
        }
      });

      server.middlewares.use("/api/mux/ingest", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const { source_url, start_time, end_time } = JSON.parse(
            Buffer.concat(chunks).toString()
          );

          const input: Record<string, unknown> = { url: source_url };
          if (start_time != null) input.start_time = start_time;
          if (end_time != null) input.end_time = end_time;

          const muxRes = await fetch(
            "https://api.mux.com/video/v1/assets",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: muxAuth(),
              },
              body: JSON.stringify({
                input: [input],
                playback_policies: ["public"],
                static_renditions: [{ resolution: "highest" }],
              }),
            }
          );

          const body = await muxRes.json();
          res.setHeader("Content-Type", "application/json");

          if (!muxRes.ok) {
            res.statusCode = muxRes.status;
            res.end(JSON.stringify({ error: body }));
            return;
          }

          res.statusCode = 200;
          res.end(JSON.stringify({ asset_id: body.data.id }));
        } catch (err) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Unknown error",
            })
          );
        }
      });

      server.middlewares.use("/api/mux/asset-status", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const { asset_id } = JSON.parse(Buffer.concat(chunks).toString());

          const assetRes = await fetch(
            `https://api.mux.com/video/v1/assets/${asset_id}`,
            { headers: { Authorization: muxAuth() } }
          );
          const assetBody = await assetRes.json();
          const asset = assetBody.data;

          res.setHeader("Content-Type", "application/json");

          if (asset?.status === "errored") {
            res.statusCode = 200;
            res.end(JSON.stringify({ status: "errored" }));
            return;
          }

          if (asset?.status !== "ready") {
            res.statusCode = 200;
            res.end(JSON.stringify({ status: asset?.status ?? "preparing" }));
            return;
          }

          const sr2 = asset.static_renditions;
          const srList2: Array<{ status: string; name: string }> = Array.isArray(sr2)
            ? sr2
            : sr2?.files ?? [];
          const mp4Rendition = srList2.find(
            (r: { name: string }) => r.name?.endsWith(".mp4")
          );

          const playbackId = asset.playback_ids?.[0]?.id ?? null;
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              status: "ready",
              playback_id: playbackId,
              duration: asset.duration ?? null,
              mp4_rendition_name: mp4Rendition?.name ?? null,
              mp4_rendition_status: mp4Rendition?.status ?? (Array.isArray(sr2) ? null : sr2?.status ?? null),
            })
          );
        } catch (err) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Unknown error",
            })
          );
        }
      });

      server.middlewares.use("/api/mux/resolve", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const { upload_id } = JSON.parse(Buffer.concat(chunks).toString());

          const uploadRes = await fetch(
            `https://api.mux.com/video/v1/uploads/${upload_id}`,
            { headers: { Authorization: muxAuth() } }
          );
          const uploadBody = await uploadRes.json();
          const assetId = uploadBody.data?.asset_id;
          if (!assetId) {
            res.setHeader("Content-Type", "application/json");
            res.statusCode = 200;
            res.end(JSON.stringify({ status: "waiting" }));
            return;
          }

          const assetRes = await fetch(
            `https://api.mux.com/video/v1/assets/${assetId}`,
            { headers: { Authorization: muxAuth() } }
          );
          const assetBody = await assetRes.json();
          const asset = assetBody.data;

          if (asset?.status !== "ready") {
            res.setHeader("Content-Type", "application/json");
            res.statusCode = 200;
            res.end(JSON.stringify({ status: "preparing", asset_id: assetId }));
            return;
          }

          const sr = asset.static_renditions;
          const srList: Array<{ status: string; name: string }> = Array.isArray(sr)
            ? sr
            : sr?.files ?? [];
          const srStatus: string | undefined = Array.isArray(sr) ? undefined : sr?.status;
          const mp4Rendition = srList.find(
            (r: { name: string }) => r.name?.endsWith(".mp4")
          );

          const renditionPending =
            (srStatus && srStatus !== "ready") ||
            (mp4Rendition && mp4Rendition.status !== "ready");
          if (renditionPending) {
            res.setHeader("Content-Type", "application/json");
            res.statusCode = 200;
            res.end(
              JSON.stringify({
                status: "preparing",
                asset_id: assetId,
                detail: "static_rendition_pending",
              })
            );
            return;
          }

          const playbackId = asset.playback_ids?.[0]?.id ?? null;
          const duration = asset.duration ?? null;
          const mp4Name = mp4Rendition?.name ?? null;

          res.setHeader("Content-Type", "application/json");
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              status: "ready",
              asset_id: assetId,
              playback_id: playbackId,
              duration,
              mp4_rendition_name: mp4Name,
            })
          );
        } catch (err) {
          console.error("[mux/resolve] Error:", err);
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Unknown error",
            })
          );
        }
      });
    },
  };
}

function registerAuthApiMiddleware(middlewares: Connect.Server) {
  middlewares.use("/api/auth/hash-password", async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const { password } = JSON.parse(Buffer.concat(chunks).toString());
      if (!password || typeof password !== "string") {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Missing password" }));
        return;
      }
      const hash = hashPassword(password);
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 200;
      res.end(JSON.stringify({ hash }));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Hash failed" }));
    }
  });

  middlewares.use("/api/auth/verify-password", async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const { password, hash } = JSON.parse(Buffer.concat(chunks).toString());
      if (!password || !hash) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Missing password or hash" }));
        return;
      }
      const valid = verifyPassword(password, hash);
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 200;
      res.end(JSON.stringify({ valid }));
    } catch {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 200;
      res.end(JSON.stringify({ valid: false }));
    }
  });
}

function flowstageProxyPlugin(): PluginOption {
  let encryptionSecret: string;

  return {
    name: "flowstage-proxy",
    configResolved(config) {
      const env = loadEnv(config.mode, path.resolve(__dirname, ".."), "");
      encryptionSecret = env.ENCRYPTION_SECRET ?? "";
    },
    configureServer(server) {
      server.middlewares.use("/api/encrypt-key", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        if (!encryptionSecret) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "ENCRYPTION_SECRET not configured" }));
          return;
        }
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const { key } = JSON.parse(Buffer.concat(chunks).toString());
          if (!key || typeof key !== "string") {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Missing key" }));
            return;
          }
          const encrypted = encryptKey(key.trim(), encryptionSecret);
          res.setHeader("Content-Type", "application/json");
          res.statusCode = 200;
          res.end(JSON.stringify({ encrypted }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Encryption failed" }));
        }
      });

      server.middlewares.use("/api/decrypt-key", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        if (!encryptionSecret) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "ENCRYPTION_SECRET not configured" }));
          return;
        }
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const { encrypted } = JSON.parse(Buffer.concat(chunks).toString());
          if (!encrypted || typeof encrypted !== "string") {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Missing encrypted key" }));
            return;
          }
          const plaintext = decryptKey(encrypted, encryptionSecret);
          res.setHeader("Content-Type", "application/json");
          res.statusCode = 200;
          res.end(JSON.stringify({ key: plaintext }));
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Failed to decrypt — key may be corrupted" }));
        }
      });

      registerAuthApiMiddleware(server.middlewares);

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/flowstage/")) return next();

        const encryptedKey = req.headers["x-flowstage-key"] as string | undefined;
        if (!encryptedKey) {
          res.statusCode = 401;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ detail: "No Flowstage API key provided. Add your key in Settings." }));
          return;
        }

        if (!encryptionSecret) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ detail: "ENCRYPTION_SECRET not configured on server." }));
          return;
        }

        let apiKey: string;
        try {
          apiKey = decryptKey(encryptedKey, encryptionSecret);
        } catch {
          res.statusCode = 401;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ detail: "Invalid or corrupted API key. Re-enter your key in Settings." }));
          return;
        }

        const upstream = req.url.replace(
          "/api/flowstage/",
          "https://api.theflowstage.com/"
        );

        const headers: Record<string, string> = {
          "X-API-Key": apiKey,
        };

        let body: string | undefined;
        if (req.method === "POST" || req.method === "PATCH" || req.method === "PUT") {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          body = Buffer.concat(chunks).toString();
          headers["Content-Type"] = "application/json";
        }

        try {
          const upstreamRes = await fetch(upstream, {
            method: req.method,
            headers,
            body,
          });

          const responseBody = await upstreamRes.text();
          res.statusCode = upstreamRes.status;
          res.setHeader("Content-Type", upstreamRes.headers.get("content-type") ?? "application/json");
          res.end(responseBody);
        } catch (err) {
          console.error("[flowstage-proxy] Upstream fetch failed:", err);
          res.statusCode = 502;
          res.end(JSON.stringify({ detail: err instanceof Error ? err.message : "Proxy error" }));
        }
      });
    },
    configurePreviewServer(server) {
      registerAuthApiMiddleware(server.middlewares);
    },
  };
}

function bundleSocialProxyPlugin(): PluginOption {
  let encryptionSecret: string;

  return {
    name: "bundle-social-proxy",
    configResolved(config) {
      const env = loadEnv(config.mode, path.resolve(__dirname, ".."), "");
      encryptionSecret = env.ENCRYPTION_SECRET ?? "";
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/bundle/")) return next();

        const encryptedKey = req.headers["x-bundle-key"] as string | undefined;
        if (!encryptedKey) {
          res.statusCode = 401;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ detail: "No Bundle API key provided. Add your key in Settings." }));
          return;
        }

        if (!encryptionSecret) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ detail: "ENCRYPTION_SECRET not configured on server." }));
          return;
        }

        let apiKey: string;
        try {
          apiKey = decryptKey(encryptedKey, encryptionSecret);
        } catch {
          res.statusCode = 401;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ detail: "Invalid or corrupted Bundle API key. Re-enter your key in Settings." }));
          return;
        }

        if (!apiKey || apiKey.trim().length === 0) {
          res.statusCode = 401;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ detail: "Decrypted Bundle API key is empty. Re-enter your key in Settings." }));
          return;
        }

        const upstream = req.url.replace(
          "/api/bundle/",
          "https://api.bundle.social/api/v1/"
        );

        const headers: Record<string, string> = {
          "x-api-key": apiKey,
        };

        let body: string | Buffer | undefined;
        if (req.method === "POST" || req.method === "PATCH" || req.method === "PUT" || req.method === "DELETE") {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const rawBody = Buffer.concat(chunks);
          if (rawBody.length > 0) {
            const incomingCt = req.headers["content-type"] ?? "";
            if (incomingCt.includes("multipart/")) {
              body = rawBody;
              headers["Content-Type"] = incomingCt;
            } else {
              body = rawBody.toString();
              headers["Content-Type"] = "application/json";
            }
          }
        }

        console.log(`[bundle-proxy] ${req.method} ${upstream} | key=${apiKey.slice(0, 8)}…`);

        try {
          const upstreamRes = await fetch(upstream, {
            method: req.method,
            headers,
            body,
            redirect: "manual",
          });

          if ([301, 302, 307, 308].includes(upstreamRes.status)) {
            const location = upstreamRes.headers.get("location");
            console.log(`[bundle-proxy] Redirect ${upstreamRes.status} -> ${location}`);
            if (location) {
              const followRes = await fetch(location, {
                method: req.method,
                headers,
                body,
                redirect: "manual",
              });
              const followBody = await followRes.text();
              console.log(`[bundle-proxy] Follow-up ${followRes.status}: ${followBody.slice(0, 200)}`);
              res.statusCode = followRes.status;
              res.setHeader("Content-Type", followRes.headers.get("content-type") ?? "application/json");
              res.end(followBody);
              return;
            }
          }

          const responseBody = await upstreamRes.text();
          console.log(`[bundle-proxy] Response ${upstreamRes.status}: ${responseBody.slice(0, 200)}`);
          res.statusCode = upstreamRes.status;
          res.setHeader("Content-Type", upstreamRes.headers.get("content-type") ?? "application/json");
          res.end(responseBody);
        } catch (err) {
          console.error("[bundle-social-proxy] Upstream fetch failed:", err);
          res.statusCode = 502;
          res.end(JSON.stringify({ detail: err instanceof Error ? err.message : "Proxy error" }));
        }
      });
    },
  };
}

function fetchProxyPlugin(): PluginOption {
  return {
    name: "fetch-proxy",
    configureServer(server) {
      server.middlewares.use("/api/fetch-proxy", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const { url } = JSON.parse(Buffer.concat(chunks).toString());

          const upstream = await fetch(url);
          if (!upstream.ok) {
            res.statusCode = upstream.status;
            res.end(JSON.stringify({ error: `Upstream fetch failed (${upstream.status})` }));
            return;
          }

          const ct = upstream.headers.get("content-type") ?? "application/octet-stream";
          res.setHeader("Content-Type", ct);
          res.statusCode = 200;
          const buffer = Buffer.from(await upstream.arrayBuffer());
          res.end(buffer);
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Proxy error" }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), muxUploadPlugin(), flowstageProxyPlugin(), bundleSocialProxyPlugin(), fetchProxyPlugin()],
  envDir: "..",
  server: {
    port: 3000,
  },
});

import { defineConfig, loadEnv, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

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

function flowstageProxyPlugin(): PluginOption {
  let flowstageKey: string;

  return {
    name: "flowstage-proxy",
    configResolved(config) {
      const env = loadEnv(config.mode, path.resolve(__dirname, ".."), "");
      flowstageKey = env.VITE_FLOWSTAGE_KEY ?? "";
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/flowstage/")) return next();

        const upstream = req.url.replace(
          "/api/flowstage/",
          "https://api.theflowstage.com/"
        );

        const headers: Record<string, string> = {
          "X-API-Key": flowstageKey,
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
  };
}

function bundleSocialProxyPlugin(): PluginOption {
  let bundleApiKey: string;

  return {
    name: "bundle-social-proxy",
    configResolved(config) {
      const env = loadEnv(config.mode, path.resolve(__dirname, ".."), "");
      bundleApiKey = env.BUNDLE_API_KEY ?? "";
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/bundle/")) return next();

        const upstream = req.url.replace(
          "/api/bundle/",
          "https://api.bundle.social/api/v1/"
        );

        const headers: Record<string, string> = {
          "x-api-key": bundleApiKey,
        };

        let body: string | Buffer | undefined;
        if (req.method === "POST" || req.method === "PATCH" || req.method === "PUT" || req.method === "DELETE") {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const rawBody = Buffer.concat(chunks);
          const incomingCt = req.headers["content-type"] ?? "";
          if (incomingCt.includes("multipart/")) {
            body = rawBody;
            headers["Content-Type"] = incomingCt;
          } else {
            body = rawBody.toString();
            headers["Content-Type"] = "application/json";
          }
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
});

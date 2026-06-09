import { useState, useCallback, useEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import NodeShell from "../NodeShell";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useAuth } from "../../context/AuthContext";
import {
  addAudioToFlowstageAesthetic,
  createFlowstageAesthetic,
  createVideoEdit,
  fetchAllFlowstageAudios,
  getFlowstageAesthetics,
  getFlowstageAestheticDetail,
  getVideoEdit,
  setFlowstageKey,
} from "../../lib/flowstage";

interface EditsNodeData {
  dbId: number;
  label: string;
  kindName: "edits";
}

interface EditRow {
  id: number;
  nodeEditId: number;
  name: string;
  renderUrl: string | null;
  flowstageEditId: string | null;
  isApproved: boolean | null;
}

export default function EditsNode({ data }: { data: EditsNodeData }) {
  const [edits, setEdits] = useState<EditRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [editCountRaw, setEditCountRaw] = useState("1");
  const parsedCount = parseInt(editCountRaw);
  const editCountValid = !isNaN(parsedCount) && parsedCount >= 1 && parsedCount <= 20 && String(parsedCount) === editCountRaw.trim();
  const editCount = editCountValid ? parsedCount : 0;
  const { dbCurrents, dbNodes, getKindName, loadWorkspace, postingNodeIds } = useWorkspace();
  const { user } = useAuth();
  const pollingRef = useRef<Map<number, ReturnType<typeof setInterval>>>(
    new Map()
  );

  const loadEdits = useCallback(async () => {
    const { data: rows } = await supabase
      .from("node_edits")
      .select("id, edit_id, edits(id, name, render_url, is_approved, flowstage_edit_id)")
      .eq("node_id", data.dbId)
      .order("id");

    if (!rows) return;

    const editIds = rows.map((r: any) => r.edit_id).filter(Boolean);
    let postedIds = new Set<number>();
    if (editIds.length > 0) {
      const { data: posted } = await supabase
        .from("posts")
        .select("edit_id")
        .in("edit_id", editIds);
      postedIds = new Set((posted ?? []).map((r) => r.edit_id));
    }

    setEdits(
      rows
        .filter((r: any) => !postedIds.has(r.edit_id))
        .map((r: any) => ({
          id: r.edit_id,
          nodeEditId: r.id,
          name: r.edits?.name ?? "Untitled edit",
          renderUrl: r.edits?.render_url ?? null,
          flowstageEditId: r.edits?.flowstage_edit_id ?? null,
          isApproved: r.edits?.is_approved ?? null,
        }))
    );
  }, [data.dbId]);

  useEffect(() => {
    loadEdits();
  }, [loadEdits]);

  const connectedAccountGroupIds = dbCurrents
    .filter((c) => c.from_node_id === data.dbId)
    .map((c) => c.to_node_id)
    .filter((id) => {
      const n = dbNodes.find((node) => node.id === id);
      return n && getKindName(n.kind_id) === "account_group";
    });
  const anyConnectedPosting = connectedAccountGroupIds.some((id) => postingNodeIds.has(id));
  const prevPostingRef = useRef(false);
  useEffect(() => {
    if (prevPostingRef.current && !anyConnectedPosting) {
      loadEdits();
    }
    prevPostingRef.current = anyConnectedPosting;
  }, [anyConnectedPosting, loadEdits]);

  useEffect(() => {
    return () => {
      pollingRef.current.forEach((interval) => clearInterval(interval));
      pollingRef.current.clear();
    };
  }, []);

  const findConnectedAesthetic = useCallback((): {
    flowstageId: string | null;
    nodeId: number;
    name: string;
  } | null => {
    const inbound = dbCurrents.filter((c) => c.to_node_id === data.dbId);
    for (const edge of inbound) {
      const src = dbNodes.find((n) => n.id === edge.from_node_id);
      if (!src) continue;
      if (getKindName(src.kind_id) === "aesthetic") {
        return {
          flowstageId: src.flowstage_uuid ?? null,
          nodeId: src.id,
          name: src.name ?? "Aesthetic",
        };
      }
    }
    return null;
  }, [dbCurrents, dbNodes, data.dbId, getKindName]);

  const findAestheticInputNodes = useCallback(
    (aestheticNodeId: number) => {
      const inbound = dbCurrents.filter(
        (c) => c.to_node_id === aestheticNodeId
      );
      const audioNodeIds: number[] = [];
      const textHookNodeIds: number[] = [];

      for (const edge of inbound) {
        const src = dbNodes.find((n) => n.id === edge.from_node_id);
        if (!src) continue;
        const kind = getKindName(src.kind_id);
        if (kind === "audios") audioNodeIds.push(src.id);
        else if (kind === "text_hooks") textHookNodeIds.push(src.id);
      }
      return { audioNodeIds, textHookNodeIds };
    },
    [dbCurrents, dbNodes, getKindName]
  );

  const startPolling = useCallback(
    (editDbId: number, flowstageEditId: string) => {
      if (!flowstageEditId || pollingRef.current.has(editDbId)) return;

      const interval = setInterval(async () => {
        try {
          const result = await getVideoEdit(flowstageEditId);
          if (result.render_url) {
            clearInterval(interval);
            pollingRef.current.delete(editDbId);

            await supabase
              .from("edits")
              .update({ render_url: result.render_url })
              .eq("id", editDbId);

            setEdits((prev) =>
              prev.map((e) =>
                e.id === editDbId ? { ...e, renderUrl: result.render_url! } : e
              )
            );
            setPreviewId(editDbId);
          }
        } catch (err) {
          console.error("[Edits] Poll failed for edit", editDbId, err);
        }
      }, 3000);

      pollingRef.current.set(editDbId, interval);
    },
    []
  );

  const refreshRenderUrl = useCallback(
    async (editDbId: number, flowstageEditId: string): Promise<string | null> => {
      try {
        const result = await getVideoEdit(flowstageEditId);
        if (!result.render_url) return null;

        await supabase
          .from("edits")
          .update({ render_url: result.render_url })
          .eq("id", editDbId);

        setEdits((prev) =>
          prev.map((e) =>
            e.id === editDbId ? { ...e, renderUrl: result.render_url! } : e
          )
        );
        return result.render_url;
      } catch (err) {
        console.error("[Edits] Failed to refresh render URL:", err);
        return null;
      }
    },
    []
  );

  const handleTogglePreview = useCallback(
    async (edit: EditRow) => {
      if (previewId === edit.id) {
        setPreviewId(null);
        return;
      }

      if (edit.flowstageEditId) {
        await refreshRenderUrl(edit.id, edit.flowstageEditId);
      }

      if (!edit.renderUrl && !edit.flowstageEditId) return;
      setPreviewId(edit.id);
    },
    [previewId, refreshRenderUrl]
  );

  useEffect(() => {
    for (const edit of edits) {
      if (!edit.renderUrl && edit.flowstageEditId) {
        startPolling(edit.id, edit.flowstageEditId);
      }
    }
  }, [edits, startPolling]);

  const handleCreateEdit = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);

    try {
      const aesthetic = findConnectedAesthetic();
      if (!aesthetic) {
        console.warn("[Edits] No connected aesthetic");
        setCreateError("Connect an Aesthetic node first.");
        return;
      }

      if (!user?.flowstage_key) {
        setCreateError("Add your Flowstage API key in Settings before creating edits.");
        return;
      }

      let activeFlowstageKey = user.flowstage_key;
      setFlowstageKey(activeFlowstageKey);

      const saveFlowstageAestheticId = async (id: string) => {
        const { error } = await supabase
          .from("nodes")
          .update({ flowstage_uuid: id })
          .eq("id", aesthetic.nodeId);
        if (error) {
          console.error("[Edits] Failed to store Flowstage aesthetic ID:", error.message);
        }
        await loadWorkspace();
      };

    const createOrReuseFlowstageAesthetic = async () => {
      try {
        const created = await createFlowstageAesthetic(aesthetic.name);
        return created.id;
      } catch (err) {
        console.warn("[Edits] Could not create Flowstage aesthetic, reusing existing one:", err);
        const aesthetics = await getFlowstageAesthetics();
        const match =
          aesthetics.find((a) => a.name?.toLowerCase() === aesthetic.name.toLowerCase()) ??
          aesthetics[0];
        if (!match) {
          throw err;
        }
        return match.id;
      }
    };

      let flowstageAestheticId = aesthetic.flowstageId;
      if (flowstageAestheticId) {
      try {
        await getFlowstageAestheticDetail(flowstageAestheticId);
      } catch (err) {
        const message = err instanceof Error ? err.message.toLowerCase() : "";
        if (!message.includes("not found")) {
          setCreateError(err instanceof Error ? err.message : "Could not load Flowstage aesthetic.");
          return;
        }
        console.warn("[Edits] Stored Flowstage aesthetic was not found; creating/reusing one.");
        try {
          flowstageAestheticId = await createOrReuseFlowstageAesthetic();
          await saveFlowstageAestheticId(flowstageAestheticId);
        } catch (createErr) {
          setCreateError(
            createErr instanceof Error
              ? createErr.message
              : "Could not create or reuse Flowstage aesthetic."
          );
          return;
        }
      }
      } else {
        try {
          flowstageAestheticId = await createOrReuseFlowstageAesthetic();
          await saveFlowstageAestheticId(flowstageAestheticId);
        } catch (err) {
          setCreateError(
            err instanceof Error
              ? err.message
              : "Could not create or reuse Flowstage aesthetic."
          );
          return;
        }
      }

      let fsAestheticId = flowstageAestheticId;

      const { audioNodeIds, textHookNodeIds } = findAestheticInputNodes(
        aesthetic.nodeId
      );

    let audioId: string | null = null;
    let sectionStart = 0;
    let sectionEnd = 0;

    if (audioNodeIds.length > 0) {
      const { data: naRows } = await supabase
        .from("node_audios")
        .select("id, node_id, audio_id, audios(flowstage_uuid, start_time, end_time, user_id)")
        .in("node_id", audioNodeIds)
        .order("id", { ascending: false });

      const latestByAudioNode = new Map<number, any>();
      for (const row of ((naRows ?? []) as any[])) {
        if (!latestByAudioNode.has(row.node_id)) {
          latestByAudioNode.set(row.node_id, row);
        }
      }

      const localAudioRows = Array.from(latestByAudioNode.values())
        .map((r: any) => ({
          ...r,
          audio: Array.isArray(r?.audios) ? r.audios[0] : r?.audios,
        }))
        .filter((r: any) => r.audio?.flowstage_uuid)
        .sort((a: any, b: any) => {
          const aNodeIdx = audioNodeIds.indexOf(a.node_id);
          const bNodeIdx = audioNodeIds.indexOf(b.node_id);
          if (aNodeIdx !== bNodeIdx) return aNodeIdx - bNodeIdx;
          return (b.id ?? 0) - (a.id ?? 0);
        });

      const connectedAudioIds = Array.from(
        new Set(localAudioRows.map((r: any) => r.audio.flowstage_uuid as string))
      );

      if (connectedAudioIds.length === 0 && (naRows ?? []).length > 0) {
        setCreateError("Connected audio is missing a Flowstage ID. Sync from Flowstage first.");
        return;
      }

      for (const id of connectedAudioIds) {
        try {
          await addAudioToFlowstageAesthetic(fsAestheticId, id);
        } catch (err) {
          const msg = err instanceof Error ? err.message.toLowerCase() : "";
          if (!msg.includes("already")) {
            console.error("[Edits] Could not add audio to Flowstage aesthetic:", err);
          }
        }
      }

      let detail: Awaited<ReturnType<typeof getFlowstageAestheticDetail>>;
      try {
        detail = await getFlowstageAestheticDetail(fsAestheticId);
      } catch (e) {
        console.error("[Edits] Could not load aesthetic from Flowstage:", e);
        setCreateError(e instanceof Error ? e.message : "Could not load Flowstage aesthetic.");
        return;
      }

      let fsAudioIds = new Set(detail.audios.map((a) => a.id));
      let rows = localAudioRows.filter((r: any) =>
        fsAudioIds.has(r.audio.flowstage_uuid)
      );

      if (rows.length === 0 && localAudioRows.length > 0) {
        const targetAudioId = connectedAudioIds[0];
        const { data: usersWithKeys } = await supabase
          .from("users")
          .select("id, flowstage_key")
          .not("flowstage_key", "is", null);

        const ownerUserId = localAudioRows[0]?.audio?.user_id;
        const candidates = [
          { id: user.id, flowstage_key: user.flowstage_key },
          ...((usersWithKeys ?? []) as Array<{ id: number; flowstage_key: string }>).filter(
            (u) => u.id === ownerUserId && u.id !== user.id
          ),
          ...((usersWithKeys ?? []) as Array<{ id: number; flowstage_key: string }>).filter(
            (u) => u.id !== user.id && u.id !== ownerUserId
          ),
        ];

        let selectedCandidateKey: string | null = null;
        for (const candidate of candidates) {
          if (!candidate.flowstage_key) continue;
          setFlowstageKey(candidate.flowstage_key);
          try {
            const keyAudios = await fetchAllFlowstageAudios();
            if (!keyAudios.some((audio) => audio.id === targetAudioId)) continue;

            const keyAesthetics = await getFlowstageAesthetics();
            let keyAesthetic =
              keyAesthetics.find(
                (a) => a.name?.toLowerCase() === aesthetic.name.toLowerCase()
              ) ?? keyAesthetics[0];

            if (!keyAesthetic) {
              keyAesthetic = await createFlowstageAesthetic(aesthetic.name);
            }

            flowstageAestheticId = keyAesthetic.id;
            fsAestheticId = keyAesthetic.id;
            const { error } = await supabase
              .from("nodes")
              .update({ flowstage_uuid: keyAesthetic.id })
              .eq("id", aesthetic.nodeId);
            if (error) {
              console.error("[Edits] Failed to store fallback Flowstage aesthetic ID:", error.message);
            }

            for (const id of connectedAudioIds) {
              try {
                await addAudioToFlowstageAesthetic(keyAesthetic.id, id);
              } catch (err) {
                const msg = err instanceof Error ? err.message.toLowerCase() : "";
                if (!msg.includes("already")) {
                  console.error("[Edits] Could not add fallback audio to Flowstage aesthetic:", err);
                }
              }
            }

            detail = await getFlowstageAestheticDetail(keyAesthetic.id);
            fsAudioIds = new Set(detail.audios.map((a) => a.id));
            rows = localAudioRows.filter((r: any) =>
              fsAudioIds.has(r.audio.flowstage_uuid)
            );
            if (rows.length > 0) {
              selectedCandidateKey = candidate.flowstage_key;
              break;
            }
          } catch (err) {
            console.error("[Edits] Could not test saved Flowstage key for audio:", err);
          } finally {
            // Never leak a probe key into subsequent API calls unless this probe succeeded.
            if (!selectedCandidateKey) {
              setFlowstageKey(activeFlowstageKey);
            }
          }
        }

        if (selectedCandidateKey) {
          activeFlowstageKey = selectedCandidateKey;
          setFlowstageKey(activeFlowstageKey);
        } else {
          setFlowstageKey(activeFlowstageKey);
        }
      }

      const row = rows[0] as any;
      const rowAudio = row?.audio ?? localAudioRows[0]?.audio;

      if (rowAudio?.flowstage_uuid) {
        audioId = rowAudio.flowstage_uuid;
        const fsAudio = detail.audios.find((a) => a.id === audioId);
        const firstSection = fsAudio?.sections?.[0];
        sectionStart =
          rowAudio.start_time ?? firstSection?.start_time ?? 0;
        sectionEnd = rowAudio.end_time ?? firstSection?.end_time ?? 0;
      } else if ((naRows ?? []).length > 0) {
        console.warn(
          "[Edits] Local audio is not registered on this aesthetic in Flowstage. Use Sync from Flowstage or reconnect the audio to the aesthetic."
        );
        setCreateError("Connected audio is not available on this Flowstage aesthetic.");
        return;
      }
    }

      if (!audioId) {
        console.warn("[Edits] No audio found on connected aesthetic");
        setCreateError("Connect an Audio node with at least one audio.");
        return;
      }

    let hook = "";
    if (textHookNodeIds.length > 0) {
      const { data: thRows } = await supabase
        .from("node_text_hooks")
        .select("hook")
        .in("node_id", textHookNodeIds)
        .not("hook", "is", null)
        .limit(1);
      if (thRows?.[0]?.hook) {
        hook = thRows[0].hook;
      }
    }

      if (!hook) {
        console.warn("[Edits] No text hook found on connected aesthetic");
        setCreateError("Connect a Text Hooks node with at least one hook.");
        return;
      }

      setFlowstageKey(activeFlowstageKey);
      const currentLen = edits.length;
      for (let i = 0; i < editCount; i++) {
        const fsEdit = await createVideoEdit({
          aesthetic_id: fsAestheticId,
          audio_id: audioId,
          section_start_time: sectionStart,
          section_end_time: sectionEnd,
          hook,
          name: `Edit ${currentLen + 1 + i}`,
          render: true,
        });

        const { data: editRow, error } = await supabase
          .from("edits")
          .insert({
            name: fsEdit.name ?? `Edit ${currentLen + 1 + i}`,
            flowstage_edit_id: fsEdit.id,
          })
          .select("id, name, render_url, is_approved, flowstage_edit_id")
          .single();

        if (error || !editRow) {
          console.error("[Edits] Failed to insert edit:", error?.message);
          continue;
        }

        const { error: linkErr } = await supabase
          .from("node_edits")
          .insert({ node_id: data.dbId, edit_id: editRow.id });

        if (linkErr) {
          console.error("[Edits] Failed to link edit:", linkErr.message);
          continue;
        }

        if (fsEdit.render_url) {
          await supabase
            .from("edits")
            .update({ render_url: fsEdit.render_url })
            .eq("id", editRow.id);
        } else if (fsEdit.id) {
          startPolling(editRow.id, fsEdit.id);
        } else {
          console.error("[Edits] No flowstage edit ID returned from API");
        }
      }

      await loadEdits();
      await loadWorkspace();
    } catch (err) {
      console.error("[Edits] Create video edit failed:", err);
      setCreateError(err instanceof Error ? err.message : "Create video edit failed.");
    } finally {
      setCreating(false);
    }
  }, [creating, findConnectedAesthetic, findAestheticInputNodes, edits.length, editCount, data.dbId, loadEdits, loadWorkspace, startPolling, user?.flowstage_key]);

  const removeEdit = useCallback(
    async (nodeEditId: number, editId: number) => {
      const interval = pollingRef.current.get(editId);
      if (interval) {
        clearInterval(interval);
        pollingRef.current.delete(editId);
      }

      await supabase.from("node_edits").delete().eq("id", nodeEditId);
      await supabase.from("edits").delete().eq("id", editId);
      setEdits((prev) => prev.filter((e) => e.id !== editId));
      if (previewId === editId) setPreviewId(null);
      loadWorkspace();
    },
    [loadWorkspace, previewId]
  );

  const hasAesthetic = findConnectedAesthetic() !== null;
  const previewEdit = previewId != null ? edits.find((e) => e.id === previewId) : null;

  return (
    <NodeShell nodeId={data.dbId} kindName="edits" title={data.label}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: "#5856D6" }}
      />

      <div className="min-h-[48px]">
        <div className="flex items-center gap-1.5 mb-2">
          <input
            type="number"
            min={1}
            max={20}
            value={editCountRaw}
            onChange={(e) => setEditCountRaw(e.target.value)}
            onBlur={() => { if (editCountValid) setEditCountRaw(String(parsedCount)); }}
            className={`nopan nodrag w-12 h-[38px] text-center text-[12px] font-semibold rounded-lg border bg-white outline-none transition-colors flex-shrink-0 ${
              editCountValid ? "border-gray-200 focus:border-[#5856D6]" : "border-red-400 text-red-500"
            }`}
          />
          <button
            type="button"
            onClick={handleCreateEdit}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={creating || !hasAesthetic || !editCountValid}
            className="relative flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-semibold text-white transition-all duration-150 disabled:opacity-60 nopan nodrag"
            style={{ backgroundColor: creating ? "#9CA3AF" : "#5856D6" }}
            title={
              !hasAesthetic
                ? "Connect an Aesthetic node first"
                : "Create video edit"
            }
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M4 2l10 6-10 6z" />
            </svg>
            Create edit
            {creating && (
              <span className="absolute inset-0 rounded-lg bg-gray-500/40 flex items-center justify-center">
                <svg
                  className="w-4 h-4 animate-spin text-white"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="6.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    opacity="0.3"
                  />
                  <path
                    d="M14.5 8a6.5 6.5 0 00-6.5-6.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            )}
          </button>
        </div>
        {createError && (
          <div className="text-[10px] text-red-500 mb-2 px-1">
            {createError}
          </div>
        )}

        {edits.length === 0 ? (
          <div className="text-[11px] text-gray-400 text-center py-3">
            {hasAesthetic
              ? "Click play to create a video edit"
              : "Connect an Aesthetic node to create edits"}
          </div>
        ) : (
          <>
            <div
              className="overflow-y-auto nopan nodrag nowheel"
              style={{ maxHeight: 210 }}
            >
              <div className="grid grid-cols-3 gap-1.5">
                {edits.map((e) => (
                  <div
                    key={e.id}
                    className="aspect-square bg-gray-100 rounded-md flex items-center justify-center relative group overflow-hidden cursor-pointer"
                    onClick={() => {
                      void handleTogglePreview(e);
                    }}
                  >
                    {e.renderUrl ? (
                      <>
                        <video
                          src={e.renderUrl}
                          preload="metadata"
                          muted
                          playsInline
                          className="w-full h-full object-cover pointer-events-none"
                          onLoadedMetadata={(ev) => { (ev.target as HTMLVideoElement).currentTime = 0.5; }}
                          onError={() => {
                            if (e.flowstageEditId) {
                              void refreshRenderUrl(e.id, e.flowstageEditId);
                            }
                          }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white text-[14px] opacity-0 group-hover:opacity-100 transition-opacity">
                          {previewId === e.id ? "■" : "▶"}
                        </span>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <svg
                          className="w-4 h-4 animate-spin"
                          viewBox="0 0 16 16"
                          fill="none"
                          style={{ color: "#5856D6" }}
                        >
                          <circle
                            cx="8"
                            cy="8"
                            r="6.5"
                            stroke="currentColor"
                            strokeWidth="2"
                            opacity="0.3"
                          />
                          <path
                            d="M14.5 8a6.5 6.5 0 00-6.5-6.5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="text-[8px] text-gray-400">
                          Rendering
                        </span>
                      </div>
                    )}
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        removeEdit(e.nodeEditId, e.id);
                      }}
                      className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center text-[9px] bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                    <span className="absolute bottom-0.5 left-0.5 text-[8px] text-gray-600 bg-white/70 px-1 rounded truncate max-w-[90%]">
                      {e.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {previewEdit?.renderUrl && (
              <div className="mt-2 rounded-md overflow-hidden bg-black">
                <video
                  key={previewEdit.id}
                  src={previewEdit.renderUrl}
                  controls
                  playsInline
                  className="w-full max-h-[160px] object-contain"
                  onError={() => {
                    if (previewEdit.flowstageEditId) {
                      void refreshRenderUrl(previewEdit.id, previewEdit.flowstageEditId);
                    }
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="edits-out"
        style={{ background: "#5856D6" }}
      />
    </NodeShell>
  );
}

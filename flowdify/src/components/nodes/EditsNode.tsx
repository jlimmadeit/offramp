import { useState, useCallback, useEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import NodeShell from "../NodeShell";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../context/WorkspaceContext";
import { createVideoEdit, getVideoEdit } from "../../lib/flowstage";

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
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [editCountRaw, setEditCountRaw] = useState("1");
  const parsedCount = parseInt(editCountRaw);
  const editCountValid = !isNaN(parsedCount) && parsedCount >= 0 && parsedCount <= 20 && String(parsedCount) === editCountRaw.trim();
  const editCount = editCountValid ? parsedCount : 0;
  const { dbCurrents, dbNodes, getKindName, loadWorkspace, postingNodeIds } = useWorkspace();
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
    flowstageId: string;
    nodeId: number;
  } | null => {
    const inbound = dbCurrents.filter((c) => c.to_node_id === data.dbId);
    for (const edge of inbound) {
      const src = dbNodes.find((n) => n.id === edge.from_node_id);
      if (!src) continue;
      if (getKindName(src.kind_id) === "aesthetic" && src.flowstage_uuid) {
        return { flowstageId: src.flowstage_uuid, nodeId: src.id };
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

  useEffect(() => {
    for (const edit of edits) {
      if (!edit.renderUrl && edit.flowstageEditId) {
        startPolling(edit.id, edit.flowstageEditId);
      }
    }
  }, [edits, startPolling]);

  const handleCreateEdit = useCallback(async () => {
    const aesthetic = findConnectedAesthetic();
    if (!aesthetic) {
      console.warn("[Edits] No connected aesthetic with flowstage_uuid");
      return;
    }

    const { audioNodeIds, textHookNodeIds } = findAestheticInputNodes(
      aesthetic.nodeId
    );

    let audioId: string | null = null;
    let sectionStart = 0;
    let sectionEnd = 0;

    if (audioNodeIds.length > 0) {
      const { data: naRows } = await supabase
        .from("node_audios")
        .select("audio_id, audios(flowstage_uuid, start_time, end_time)")
        .in("node_id", audioNodeIds)
        .limit(1);

      const row = (naRows as any)?.[0];
      if (row?.audios?.flowstage_uuid) {
        audioId = row.audios.flowstage_uuid;
        sectionStart = row.audios.start_time ?? 0;
        sectionEnd = row.audios.end_time ?? 0;
      }
    }

    if (!audioId) {
      console.warn("[Edits] No audio found on connected aesthetic");
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
      return;
    }

    setCreating(true);
    try {
      const currentLen = edits.length;
      for (let i = 0; i < editCount; i++) {
        const fsEdit = await createVideoEdit({
          aesthetic_id: aesthetic.flowstageId,
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
    } finally {
      setCreating(false);
    }
  }, [findConnectedAesthetic, findAestheticInputNodes, edits.length, editCount, data.dbId, loadEdits, loadWorkspace, startPolling]);

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
            min={0}
            max={20}
            value={editCountRaw}
            onChange={(e) => setEditCountRaw(e.target.value)}
            onBlur={() => { if (editCountValid) setEditCountRaw(String(parsedCount)); }}
            className={`nopan nodrag w-12 h-[38px] text-center text-[12px] font-semibold rounded-lg border bg-white outline-none transition-colors flex-shrink-0 ${
              editCountValid ? "border-gray-200 focus:border-[#5856D6]" : "border-red-400 text-red-500"
            }`}
          />
          <button
            onClick={handleCreateEdit}
            disabled={creating || !hasAesthetic || !editCountValid}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-semibold text-white transition-all duration-150 disabled:opacity-40"
            style={{ backgroundColor: "#5856D6" }}
            title={
              !hasAesthetic
                ? "Connect an Aesthetic node first"
                : "Create video edit"
            }
          >
            {creating ? (
              <>
                <svg
                  className="w-3.5 h-3.5 animate-spin"
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
                Creating…
              </>
            ) : (
              <>
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M4 2l10 6-10 6z" />
                </svg>
                Create edit
              </>
            )}
          </button>
        </div>

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
                    onClick={() =>
                      e.renderUrl &&
                      setPreviewId(previewId === e.id ? null : e.id)
                    }
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

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import {
  updateFlowstageAesthetic,
  addVideoToFlowstageAesthetic,
  removeVideoFromFlowstageAesthetic,
  addAudioToFlowstageAesthetic,
  removeAudioFromFlowstageAesthetic,
  addTextHookToFlowstageAesthetic,
  removeTextHookFromFlowstageAesthetic,
  copyPresetToAesthetic,
  removePresetFromAesthetic,
} from "../lib/flowstage";
import type {
  NodeKind,
  DbNode,
  DbCurrent,
  DbNodeTextHook,
  NodeKindName,
} from "../lib/types";

interface AssetCounts {
  clips: number;
  audio: number;
  text: number;
  editStyle: number;
}

export interface AccountMember {
  memberId: number;
  accountId: number;
  username: string | null;
  displayName: string | null;
  platform: string | null;
  profilePictureUrl: string | null;
  followerCt: number | null;
}

interface WorkspaceState {
  nodeKinds: NodeKind[];
  nodeKindsLoaded: boolean;
  getKindName: (kindId: number) => NodeKindName | undefined;
  getKindId: (name: NodeKindName) => number | undefined;

  dbNodes: DbNode[];
  dbCurrents: DbCurrent[];
  nodeVideoCounts: Record<number, number>;
  nodeAudioCounts: Record<number, number>;
  nodeTextHookCounts: Record<number, number>;
  nodeEditCounts: Record<number, number>;
  nodeEditStyleCounts: Record<number, number>;
  nodeCaptionCounts: Record<number, number>;

  loadWorkspace: () => Promise<void>;

  insertNode: (
    name: string,
    x: number,
    y: number,
    kindId: number,
    flowstageId?: string
  ) => Promise<DbNode | null>;
  updateNodePosition: (id: number, x: number, y: number) => Promise<void>;
  updateNodeName: (id: number, name: string) => Promise<void>;
  deleteNode: (id: number) => Promise<void>;

  insertCurrent: (
    fromId: number,
    toId: number
  ) => Promise<DbCurrent | null>;
  deleteCurrent: (id: number) => Promise<void>;

  getAestheticAssetCounts: (aestheticNodeId: number) => AssetCounts;
  isAccountConnected: (accountNodeId: number) => boolean;

  removeNodeVideo: (nodeVideoId: number) => Promise<void>;
  removeNodeAudio: (nodeAudioId: number) => Promise<void>;
  addNodeTextHook: (nodeId: number, hook: string) => Promise<{ id: number; hook: string } | null>;
  removeNodeTextHook: (textHookId: number) => Promise<void>;
  removeNodeEdit: (nodeEditId: number, editId: number) => Promise<void>;
  removeNodeEditStyle: (nodeEditStyleId: number) => Promise<void>;

  syncingCurrentIds: Set<number>;

  dropVersion: number;
  handleBucketFileDrop: (
    nodeId: number,
    kindName: NodeKindName,
    bucketFile: { name: string; type: string; muxUploadId?: string; muxAssetId?: string; muxPlaybackId?: string; dbVideoId?: number; dbAudioId?: number; dbEditStyleId?: number }
  ) => Promise<void>;

  postingNodeIds: Set<number>;
  addPostingNode: (id: number) => void;
  removePostingNode: (id: number) => void;

  accountGroupMembers: Record<number, AccountMember[]>;
  handleAccountDrop: (
    nodeId: number,
    account: { accountId: number; username: string | null; displayName: string | null; platform: string | null; profilePictureUrl: string | null; followerCt: number | null }
  ) => Promise<void>;
  removeAccountGroupMember: (memberId: number) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be inside WorkspaceProvider");
  return ctx;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [nodeKinds, setNodeKinds] = useState<NodeKind[]>([]);
  const [nodeKindsLoaded, setNodeKindsLoaded] = useState(false);
  const [dbNodes, setDbNodes] = useState<DbNode[]>([]);
  const [dbCurrents, setDbCurrents] = useState<DbCurrent[]>([]);
  const [nodeVideoCounts, setNodeVideoCounts] = useState<
    Record<number, number>
  >({});
  const [nodeAudioCounts, setNodeAudioCounts] = useState<
    Record<number, number>
  >({});
  const [nodeTextHookCounts, setNodeTextHookCounts] = useState<
    Record<number, number>
  >({});
  const [nodeEditCounts, setNodeEditCounts] = useState<
    Record<number, number>
  >({});
  const [nodeEditStyleCounts, setNodeEditStyleCounts] = useState<
    Record<number, number>
  >({});
  const [nodeCaptionCounts, setNodeCaptionCounts] = useState<
    Record<number, number>
  >({});
  const [dropVersion, setDropVersion] = useState(0);
  const [accountGroupMembers, setAccountGroupMembers] = useState<Record<number, AccountMember[]>>({});
  const [syncingCurrentIds, setSyncingCurrentIds] = useState<Set<number>>(
    new Set()
  );
  const [postingNodeIds, setPostingNodeIds] = useState<Set<number>>(new Set());

  const addPostingNode = useCallback((id: number) => {
    setPostingNodeIds((prev) => new Set(prev).add(id));
  }, []);
  const removePostingNode = useCallback((id: number) => {
    setPostingNodeIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const addSyncing = useCallback((id: number) => {
    setSyncingCurrentIds((prev) => new Set(prev).add(id));
  }, []);
  const removeSyncing = useCallback((id: number) => {
    setSyncingCurrentIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const getKindName = useCallback(
    (kindId: number): NodeKindName | undefined => {
      const kind = nodeKinds.find((k) => k.id === kindId);
      return kind?.name as NodeKindName | undefined;
    },
    [nodeKinds]
  );

  const getKindId = useCallback(
    (name: NodeKindName): number | undefined => {
      return nodeKinds.find((k) => k.name === name)?.id;
    },
    [nodeKinds]
  );

  const loadWorkspace = useCallback(async () => {
    const [kindsRes, nodesRes, currentsRes, nvRes, nsRes, nthRes, neRes, nesRes, agmRes, ncRes] =
      await Promise.all([
        supabase.from("node_kinds").select("*"),
        supabase.from("nodes").select("*"),
        supabase.from("currents").select("*"),
        supabase.from("node_videos").select("id, node_id"),
        supabase.from("node_audios").select("id, node_id"),
        supabase.from("node_text_hooks").select("id, node_id"),
        supabase.from("node_edits").select("id, node_id"),
        supabase.from("node_edit_styles").select("id, node_id"),
        supabase.from("account_group_members").select("id, account_id, account_group_id, accounts(username, display_name, platform, profile_picture_url, follower_ct)"),
        supabase.from("node_captions").select("id, node_id"),
      ]);

    if (kindsRes.data) {
      setNodeKinds(kindsRes.data);
      setNodeKindsLoaded(true);
    }
    if (nodesRes.data) setDbNodes(nodesRes.data);
    if (currentsRes.data) setDbCurrents(currentsRes.data);

    const vc: Record<number, number> = {};
    (nvRes.data ?? []).forEach((r) => {
      vc[r.node_id] = (vc[r.node_id] ?? 0) + 1;
    });
    setNodeVideoCounts(vc);

    const sc: Record<number, number> = {};
    (nsRes.data ?? []).forEach((r) => {
      sc[r.node_id] = (sc[r.node_id] ?? 0) + 1;
    });
    setNodeAudioCounts(sc);

    const tc: Record<number, number> = {};
    (nthRes.data ?? []).forEach((r) => {
      tc[r.node_id] = (tc[r.node_id] ?? 0) + 1;
    });
    setNodeTextHookCounts(tc);

    const ec: Record<number, number> = {};
    (neRes.data ?? []).forEach((r) => {
      ec[r.node_id] = (ec[r.node_id] ?? 0) + 1;
    });
    setNodeEditCounts(ec);

    const esc: Record<number, number> = {};
    (nesRes.data ?? []).forEach((r) => {
      esc[r.node_id] = (esc[r.node_id] ?? 0) + 1;
    });
    setNodeEditStyleCounts(esc);

    const cc: Record<number, number> = {};
    (ncRes.data ?? []).forEach((r) => {
      cc[r.node_id] = (cc[r.node_id] ?? 0) + 1;
    });
    setNodeCaptionCounts(cc);

    const agm: Record<number, AccountMember[]> = {};
    const allNodes = nodesRes.data ?? [];
    for (const row of agmRes.data ?? []) {
      const acc = row.accounts as unknown as {
        username: string | null;
        display_name: string | null;
        platform: string | null;
        profile_picture_url: string | null;
        follower_ct: number | null;
      } | null;
      if (!acc) continue;
      const groupId = row.account_group_id as number;
      const nodeForGroup = allNodes.find((n: DbNode) => n.account_group_id === groupId);
      if (!nodeForGroup) continue;
      if (!agm[nodeForGroup.id]) agm[nodeForGroup.id] = [];
      agm[nodeForGroup.id]!.push({
        memberId: row.id,
        accountId: row.account_id as number,
        username: acc.username,
        displayName: acc.display_name,
        platform: acc.platform,
        profilePictureUrl: acc.profile_picture_url,
        followerCt: acc.follower_ct,
      });
    }
    setAccountGroupMembers(agm);
  }, []);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const insertNode = useCallback(
    async (
      name: string,
      x: number,
      y: number,
      kindId: number,
      flowstageUuid?: string
    ): Promise<DbNode | null> => {
      const row: Record<string, unknown> = {
        name,
        x_position: x,
        y_position: y,
        kind_id: kindId,
      };
      if (flowstageUuid) row.flowstage_uuid = flowstageUuid;

      const { data, error } = await supabase
        .from("nodes")
        .insert(row)
        .select()
        .single();
      if (error) {
        console.error("insertNode error:", error);
        return null;
      }
      setDbNodes((prev) => [...prev, data]);
      return data;
    },
    []
  );

  const updateNodePosition = useCallback(
    async (id: number, x: number, y: number) => {
      await supabase
        .from("nodes")
        .update({ x_position: x, y_position: y })
        .eq("id", id);
      setDbNodes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, x_position: x, y_position: y } : n
        )
      );
    },
    []
  );

  const updateNodeName = useCallback(
    async (id: number, name: string) => {
      await supabase.from("nodes").update({ name }).eq("id", id);
      setDbNodes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, name } : n))
      );

      const node = dbNodes.find((n) => n.id === id);
      if (node && getKindName(node.kind_id) === "aesthetic" && node.flowstage_uuid) {
        updateFlowstageAesthetic(node.flowstage_uuid, name).catch((err) =>
          console.error("Flowstage rename failed:", err)
        );
      }
    },
    [dbNodes, getKindName]
  );

  const findConnectedAestheticFromDb = useCallback(
    async (videoNodeId: number): Promise<{ flowstageId: string; currentId: number } | null> => {
      const { data: edges } = await supabase
        .from("currents")
        .select("id, to_node_id")
        .eq("from_node_id", videoNodeId);
      if (!edges || edges.length === 0) return null;

      for (const edge of edges) {
        const { data: target } = await supabase
          .from("nodes")
          .select("kind_id, flowstage_uuid")
          .eq("id", edge.to_node_id)
          .single();
        if (!target) continue;
        const kindName = getKindName(target.kind_id);
        if (kindName === "aesthetic" && target.flowstage_uuid) {
          return { flowstageId: target.flowstage_uuid, currentId: edge.id };
        }
      }
      return null;
    },
    [getKindName]
  );

  const removeFlowstageVideos = useCallback(
    async (videoNodeId: number) => {
      const aesthetic = await findConnectedAestheticFromDb(videoNodeId);
      if (!aesthetic) return;

      const { data: nvRows } = await supabase
        .from("node_videos")
        .select("flowstage_uuid")
        .eq("node_id", videoNodeId)
        .not("flowstage_uuid", "is", null);

      if (!nvRows || nvRows.length === 0) return;

      await Promise.all(
        nvRows.map(async (nv) => {
          try {
            await removeVideoFromFlowstageAesthetic(aesthetic.flowstageId, nv.flowstage_uuid!);
          } catch (err) {
            console.error("[Flowstage] Remove video failed:", err);
          }
        })
      );
    },
    [findConnectedAestheticFromDb]
  );

  const removeFlowstageAudios = useCallback(
    async (audioNodeId: number) => {
      const aesthetic = await findConnectedAestheticFromDb(audioNodeId);
      if (!aesthetic) return;

      const { data: naRows } = await supabase
        .from("node_audios")
        .select("audio_id, audios(flowstage_uuid)")
        .eq("node_id", audioNodeId);

      if (!naRows || naRows.length === 0) return;

      const withUuid = (naRows as any[]).filter((r) => r.audios?.flowstage_uuid);
      if (withUuid.length === 0) return;

      await Promise.all(
        withUuid.map(async (na) => {
          try {
            await removeAudioFromFlowstageAesthetic(aesthetic.flowstageId, na.audios.flowstage_uuid);
          } catch (err) {
            console.error("[Flowstage] Remove audio failed:", err);
          }
        })
      );
    },
    [findConnectedAestheticFromDb]
  );

  const removeNodeVideo = useCallback(
    async (nodeVideoId: number) => {
      const { data: nv } = await supabase
        .from("node_videos")
        .select("node_id, flowstage_uuid")
        .eq("id", nodeVideoId)
        .single();

      if (nv?.flowstage_uuid) {
        const aesthetic = await findConnectedAestheticFromDb(nv.node_id);
        if (aesthetic) {
          try {
            await removeVideoFromFlowstageAesthetic(aesthetic.flowstageId, nv.flowstage_uuid);
          } catch (err) {
            console.error("[Flowstage] Remove video failed:", err);
          }
        }
      }

      await supabase.from("node_videos").delete().eq("id", nodeVideoId);
    },
    [findConnectedAestheticFromDb]
  );

  const removeNodeAudio = useCallback(
    async (nodeAudioId: number) => {
      const { data: na } = await supabase
        .from("node_audios")
        .select("node_id, audio_id, audios(flowstage_uuid)")
        .eq("id", nodeAudioId)
        .single();

      const fsUuid = (na as any)?.audios?.flowstage_uuid;
      if (fsUuid) {
        const aesthetic = await findConnectedAestheticFromDb(na!.node_id);
        if (aesthetic) {
          try {
            await removeAudioFromFlowstageAesthetic(aesthetic.flowstageId, fsUuid);
          } catch (err) {
            console.error("[Flowstage] Remove audio failed:", err);
          }
        }
      }

      await supabase.from("node_audios").delete().eq("id", nodeAudioId);
    },
    [findConnectedAestheticFromDb]
  );

  const removeFlowstageTextHooks = useCallback(
    async (textHookNodeId: number) => {
      const aesthetic = await findConnectedAestheticFromDb(textHookNodeId);
      if (!aesthetic) return;

      const { data: thRows } = await supabase
        .from("node_text_hooks")
        .select("flowstage_uuid")
        .eq("node_id", textHookNodeId)
        .not("flowstage_uuid", "is", null);

      if (!thRows || thRows.length === 0) return;

      await Promise.all(
        thRows.map(async (th) => {
          try {
            await removeTextHookFromFlowstageAesthetic(aesthetic.flowstageId, th.flowstage_uuid!);
          } catch (err) {
            console.error("[Flowstage] Remove text hook failed:", err);
          }
        })
      );
    },
    [findConnectedAestheticFromDb]
  );

  const removeNodeTextHook = useCallback(
    async (textHookId: number) => {
      const { data: th } = await supabase
        .from("node_text_hooks")
        .select("node_id, flowstage_uuid")
        .eq("id", textHookId)
        .single();

      if (th?.flowstage_uuid) {
        const aesthetic = await findConnectedAestheticFromDb(th.node_id);
        if (aesthetic) {
          try {
            await removeTextHookFromFlowstageAesthetic(aesthetic.flowstageId, th.flowstage_uuid);
          } catch (err) {
            console.error("[Flowstage] Remove text hook failed:", err);
          }
        }
      }

      await supabase.from("node_text_hooks").delete().eq("id", textHookId);
    },
    [findConnectedAestheticFromDb]
  );

  const removeNodeEdit = useCallback(
    async (nodeEditId: number, editId: number) => {
      await supabase.from("node_edits").delete().eq("id", nodeEditId);
      await supabase.from("edits").delete().eq("id", editId);
    },
    []
  );

  const removeFlowstagePresets = useCallback(
    async (editStyleNodeId: number) => {
      const aesthetic = await findConnectedAestheticFromDb(editStyleNodeId);
      if (!aesthetic) return;

      const { data: nesRows } = await supabase
        .from("node_edit_styles")
        .select("edit_style_id, edit_styles(name)")
        .eq("node_id", editStyleNodeId);

      if (!nesRows || nesRows.length === 0) return;

      const withName = (nesRows as any[]).filter((r) => r.edit_styles?.name);
      await Promise.all(
        withName.map(async (r) => {
          try {
            await removePresetFromAesthetic(aesthetic.flowstageId, r.edit_styles.name);
          } catch (err) {
            console.error("[Flowstage] Remove preset failed:", err);
          }
        })
      );
    },
    [findConnectedAestheticFromDb]
  );

  const removeNodeEditStyle = useCallback(
    async (nodeEditStyleId: number) => {
      const { data: nes } = await supabase
        .from("node_edit_styles")
        .select("node_id, edit_style_id, edit_styles(name, flowstage_aesthetic_id)")
        .eq("id", nodeEditStyleId)
        .single();

      const presetName = (nes as any)?.edit_styles?.name;
      if (presetName) {
        const aesthetic = await findConnectedAestheticFromDb(nes!.node_id);
        if (aesthetic) {
          try {
            await removePresetFromAesthetic(aesthetic.flowstageId, presetName);
          } catch (err) {
            console.error("[Flowstage] Remove preset failed:", err);
          }
        }
      }

      await supabase.from("node_edit_styles").delete().eq("id", nodeEditStyleId);
    },
    [findConnectedAestheticFromDb]
  );

  const addNodeTextHook = useCallback(
    async (nodeId: number, hook: string): Promise<{ id: number; hook: string } | null> => {
      const { data: row, error } = await supabase
        .from("node_text_hooks")
        .insert({ node_id: nodeId, hook })
        .select("id, hook")
        .single();
      if (error || !row) {
        console.error("Failed to insert text hook:", error?.message);
        return null;
      }

      const aesthetic = await findConnectedAestheticFromDb(nodeId);
      if (aesthetic) {
        try {
          const fsHook = await addTextHookToFlowstageAesthetic(aesthetic.flowstageId, hook);
          await supabase
            .from("node_text_hooks")
            .update({ flowstage_uuid: fsHook.id })
            .eq("id", row.id);
          console.log("[Flowstage] Text hook synced, uuid:", fsHook.id);
        } catch (err) {
          console.error("[Flowstage] Add text hook failed:", err);
        }
      }

      return { id: row.id, hook: row.hook ?? "" };
    },
    [findConnectedAestheticFromDb]
  );

  const deleteNode = useCallback(
    async (id: number) => {
      const node = dbNodes.find((n) => n.id === id);
      const kindName = node ? getKindName(node.kind_id) : undefined;

      if (kindName === "videos") {
        await removeFlowstageVideos(id);
        await supabase.from("node_videos").delete().eq("node_id", id);
      } else if (kindName === "audios") {
        await removeFlowstageAudios(id);
        await supabase.from("node_audios").delete().eq("node_id", id);
      } else if (kindName === "text_hooks") {
        await removeFlowstageTextHooks(id);
        await supabase.from("node_text_hooks").delete().eq("node_id", id);
      } else if (kindName === "edit_styles") {
        await removeFlowstagePresets(id);
        await supabase.from("node_edit_styles").delete().eq("node_id", id);
      } else if (kindName === "captions") {
        await supabase.from("node_captions").delete().eq("node_id", id);
      } else if (kindName === "edits") {
        const { data: neRows } = await supabase
          .from("node_edits")
          .select("id, edit_id")
          .eq("node_id", id);
        if (neRows && neRows.length > 0) {
          const editIds = neRows.map((r) => r.edit_id);
          await supabase.from("node_edits").delete().eq("node_id", id);
          await supabase.from("edits").delete().in("id", editIds);
        }
      }

      await supabase.from("currents").delete().or(
        `from_node_id.eq.${id},to_node_id.eq.${id}`
      );

      await supabase.from("nodes").delete().eq("id", id);
      setDbNodes((prev) => prev.filter((n) => n.id !== id));
      setDbCurrents((prev) =>
        prev.filter((c) => c.from_node_id !== id && c.to_node_id !== id)
      );
    },
    [dbNodes, getKindName, removeFlowstageVideos, removeFlowstageAudios, removeFlowstageTextHooks, removeFlowstagePresets]
  );

  const insertCurrent = useCallback(
    async (
      fromId: number,
      toId: number
    ): Promise<DbCurrent | null> => {
      const { data, error } = await supabase
        .from("currents")
        .insert({ from_node_id: fromId, to_node_id: toId })
        .select()
        .single();
      if (error) {
        console.error("insertCurrent error:", error);
        return null;
      }
      setDbCurrents((prev) => [...prev, data]);

      const sourceNode = dbNodes.find((n) => n.id === fromId);
      const targetNode = dbNodes.find((n) => n.id === toId);
      if (sourceNode && targetNode) {
        const sourceKind = getKindName(sourceNode.kind_id);
        const targetKind = getKindName(targetNode.kind_id);

        const videoNode = sourceKind === "videos" ? sourceNode : targetKind === "videos" ? targetNode : null;
        const aestheticNode = sourceKind === "aesthetic" ? sourceNode : targetKind === "aesthetic" ? targetNode : null;

        if (videoNode && aestheticNode?.flowstage_uuid) {
          const { data: nodeVids } = await supabase
            .from("node_videos")
            .select("id, video_id")
            .eq("node_id", videoNode.id);
          if (nodeVids && nodeVids.length > 0) {
            const videoIds = nodeVids.map((nv) => nv.video_id);
            const { data: videos } = await supabase
              .from("videos")
              .select("id, name, url, duration, thumbnail_url")
              .in("id", videoIds);
            if (videos) {
              const fsId = aestheticNode.flowstage_uuid;
              const currentId = data.id;
              const videosWithUrl = videos.filter((v) => v.url);
              if (videosWithUrl.length > 0) {
                addSyncing(currentId);
                try {
                  await Promise.all(
                    videosWithUrl.map(async (v) => {
                      try {
                        const fsVideo = await addVideoToFlowstageAesthetic(fsId, {
                          url: v.url!,
                          name: v.name ?? "Untitled",
                          duration: v.duration ?? undefined,
                          thumbnailUrl: v.thumbnail_url ?? undefined,
                        });
                        const nvRow = nodeVids.find((nv) => nv.video_id === v.id);
                        if (nvRow) {
                          const { error } = await supabase
                            .from("node_videos")
                            .update({ flowstage_uuid: fsVideo.id })
                            .eq("id", nvRow.id);
                          if (error) {
                            console.error("Failed to store flowstage_uuid:", error.message);
                          }
                        }
                      } catch (err) {
                        console.error("Flowstage add video on connect failed:", err);
                      }
                    })
                  );
                } finally {
                  removeSyncing(currentId);
                }
              }
            }
          }
        }

        const audioNode = sourceKind === "audios" ? sourceNode : targetKind === "audios" ? targetNode : null;
        if (audioNode && aestheticNode?.flowstage_uuid) {
          await syncAllNodeAudiosToAesthetic(audioNode.id, aestheticNode.flowstage_uuid, data.id);
        }

        const textHookNode = sourceKind === "text_hooks" ? sourceNode : targetKind === "text_hooks" ? targetNode : null;
        if (textHookNode && aestheticNode?.flowstage_uuid) {
          await syncAllNodeTextHooksToAesthetic(textHookNode.id, aestheticNode.flowstage_uuid, data.id);
        }

        const editStyleNode = sourceKind === "edit_styles" ? sourceNode : targetKind === "edit_styles" ? targetNode : null;
        if (editStyleNode && aestheticNode?.flowstage_uuid) {
          await syncAllNodePresetsToAesthetic(editStyleNode.id, aestheticNode.flowstage_uuid, data.id);
        }

      }

      return data;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dbNodes, getKindName, addSyncing, removeSyncing]
  );

  const deleteCurrent = useCallback(
    async (id: number) => {
      const { data: edgeRow } = await supabase
        .from("currents")
        .select("id, from_node_id, to_node_id")
        .eq("id", id)
        .single();

      if (edgeRow) {
        const { data: nodeA } = await supabase
          .from("nodes")
          .select("id, kind_id, flowstage_uuid")
          .eq("id", edgeRow.from_node_id)
          .single();
        const { data: nodeB } = await supabase
          .from("nodes")
          .select("id, kind_id, flowstage_uuid")
          .eq("id", edgeRow.to_node_id)
          .single();

        if (nodeA && nodeB) {
          const kindA = getKindName(nodeA.kind_id);
          const kindB = getKindName(nodeB.kind_id);

          const videoNode = kindA === "videos" ? nodeA : kindB === "videos" ? nodeB : null;
          const aestheticNode = kindA === "aesthetic" ? nodeA : kindB === "aesthetic" ? nodeB : null;

          if (videoNode && aestheticNode?.flowstage_uuid) {
            const { data: nvRows } = await supabase
              .from("node_videos")
              .select("flowstage_uuid")
              .eq("node_id", videoNode.id)
              .not("flowstage_uuid", "is", null);

            console.log("[Flowstage] Removing", nvRows?.length ?? 0, "videos from aesthetic", aestheticNode.flowstage_uuid);

            if (nvRows && nvRows.length > 0) {
              await Promise.all(
                nvRows.map(async (nv) => {
                  try {
                    await removeVideoFromFlowstageAesthetic(
                      aestheticNode.flowstage_uuid!,
                      nv.flowstage_uuid!
                    );
                    console.log("[Flowstage] Removed video", nv.flowstage_uuid);
                  } catch (err) {
                    console.error("[Flowstage] Remove video on disconnect failed:", err);
                  }
                })
              );

              await supabase
                .from("node_videos")
                .update({ flowstage_uuid: null })
                .eq("node_id", videoNode.id);
            }
          }

          const audioNode = kindA === "audios" ? nodeA : kindB === "audios" ? nodeB : null;
          if (audioNode && aestheticNode?.flowstage_uuid) {
            const { data: naRows } = await supabase
              .from("node_audios")
              .select("audio_id, audios(flowstage_uuid)")
              .eq("node_id", audioNode.id);

            const withUuid = (naRows as any[] ?? []).filter((r) => r.audios?.flowstage_uuid);
            console.log("[Flowstage] Removing", withUuid.length, "audios from aesthetic", aestheticNode.flowstage_uuid);

            if (withUuid.length > 0) {
              await Promise.all(
                withUuid.map(async (na) => {
                  try {
                    await removeAudioFromFlowstageAesthetic(
                      aestheticNode.flowstage_uuid!,
                      na.audios.flowstage_uuid
                    );
                    console.log("[Flowstage] Removed audio", na.audios.flowstage_uuid);
                  } catch (err) {
                    console.error("[Flowstage] Remove audio on disconnect failed:", err);
                  }
                })
              );
            }
          }

          const textHookNode = kindA === "text_hooks" ? nodeA : kindB === "text_hooks" ? nodeB : null;
          if (textHookNode && aestheticNode?.flowstage_uuid) {
            const { data: thRows } = await supabase
              .from("node_text_hooks")
              .select("flowstage_uuid")
              .eq("node_id", textHookNode.id)
              .not("flowstage_uuid", "is", null);

            console.log("[Flowstage] Removing", thRows?.length ?? 0, "text hooks from aesthetic", aestheticNode.flowstage_uuid);

            if (thRows && thRows.length > 0) {
              await Promise.all(
                thRows.map(async (th) => {
                  try {
                    await removeTextHookFromFlowstageAesthetic(
                      aestheticNode.flowstage_uuid!,
                      th.flowstage_uuid!
                    );
                    console.log("[Flowstage] Removed text hook", th.flowstage_uuid);
                  } catch (err) {
                    console.error("[Flowstage] Remove text hook on disconnect failed:", err);
                  }
                })
              );

              await supabase
                .from("node_text_hooks")
                .update({ flowstage_uuid: null })
                .eq("node_id", textHookNode.id);
            }
          }

          const editStyleNode = kindA === "edit_styles" ? nodeA : kindB === "edit_styles" ? nodeB : null;
          if (editStyleNode && aestheticNode?.flowstage_uuid) {
            const { data: nesRows } = await supabase
              .from("node_edit_styles")
              .select("edit_style_id, edit_styles(name)")
              .eq("node_id", editStyleNode.id);

            const withName = (nesRows as any[] ?? []).filter((r) => r.edit_styles?.name);
            console.log("[Flowstage] Removing", withName.length, "presets from aesthetic", aestheticNode.flowstage_uuid);

            if (withName.length > 0) {
              await Promise.all(
                withName.map(async (r) => {
                  try {
                    await removePresetFromAesthetic(
                      aestheticNode.flowstage_uuid!,
                      r.edit_styles.name
                    );
                    console.log("[Flowstage] Removed preset", r.edit_styles.name);
                  } catch (err) {
                    console.error("[Flowstage] Remove preset on disconnect failed:", err);
                  }
                })
              );
            }
          }

        }
      }

      await supabase.from("currents").delete().eq("id", id);
      setDbCurrents((prev) => prev.filter((c) => c.id !== id));
    },
    [getKindName]
  );

  const getAestheticAssetCounts = useCallback(
    (aestheticNodeId: number): AssetCounts => {
      const inbound = dbCurrents.filter(
        (c) => c.to_node_id === aestheticNodeId
      );
      let clips = 0;
      let audio = 0;
      let text = 0;
      let editStyle = 0;

      for (const edge of inbound) {
        const sourceNode = dbNodes.find((n) => n.id === edge.from_node_id);
        if (!sourceNode) continue;
        const kindName = getKindName(sourceNode.kind_id);
        switch (kindName) {
          case "videos":
            clips += nodeVideoCounts[sourceNode.id] ?? 0;
            break;
          case "audios":
            audio += nodeAudioCounts[sourceNode.id] ?? 0;
            break;
          case "text_hooks":
            text += nodeTextHookCounts[sourceNode.id] ?? 0;
            break;
          case "edit_styles":
            editStyle += nodeEditStyleCounts[sourceNode.id] ?? 0;
            break;
        }
      }
      return { clips, audio, text, editStyle };
    },
    [dbCurrents, dbNodes, getKindName, nodeVideoCounts, nodeAudioCounts, nodeTextHookCounts, nodeEditStyleCounts]
  );

  const syncVideoToFlowstage = useCallback(
    async (
      flowstageId: string,
      currentId: number,
      nodeVideoId: number,
      video: { url: string; name: string; duration?: number; thumbnailUrl?: string }
    ): Promise<boolean> => {
      addSyncing(currentId);
      try {
        const fsVideo = await addVideoToFlowstageAesthetic(flowstageId, video);
        const { error } = await supabase
          .from("node_videos")
          .update({ flowstage_uuid: fsVideo.id })
          .eq("id", nodeVideoId);
        if (error) {
          console.error("[Flowstage] Failed to store flowstage_uuid in node_videos:", error.message);
          return false;
        }
        console.log("[Flowstage] Video synced, uuid:", fsVideo.id);
        return true;
      } catch (err) {
        console.error("[Flowstage] Add video failed:", err);
        return false;
      } finally {
        removeSyncing(currentId);
      }
    },
    [addSyncing, removeSyncing]
  );

  const syncAudioToFlowstage = useCallback(
    async (
      flowstageId: string,
      currentId: number,
      audioFsUuid: string
    ): Promise<boolean> => {
      addSyncing(currentId);
      try {
        const fsAudio = await addAudioToFlowstageAesthetic(flowstageId, audioFsUuid);
        console.log("[Flowstage] Audio synced, uuid:", fsAudio.id);
        return true;
      } catch (err) {
        console.error("[Flowstage] Add audio failed:", err);
        return false;
      } finally {
        removeSyncing(currentId);
      }
    },
    [addSyncing, removeSyncing]
  );

  const syncAllNodeAudiosToAesthetic = useCallback(
    async (audioNodeId: number, fsAestheticId: string, currentId: number) => {
      const { data: nodeAuds } = await supabase
        .from("node_audios")
        .select("id, audio_id, audios(flowstage_uuid)")
        .eq("node_id", audioNodeId);
      if (!nodeAuds || nodeAuds.length === 0) return;

      const withUuid = (nodeAuds as any[]).filter((r) => r.audios?.flowstage_uuid);
      if (withUuid.length === 0) return;

      addSyncing(currentId);
      try {
        await Promise.all(
          withUuid.map(async (r) => {
            try {
              await addAudioToFlowstageAesthetic(fsAestheticId, r.audios.flowstage_uuid);
            } catch (err) {
              console.error("Flowstage add audio on connect failed:", err);
            }
          })
        );
      } finally {
        removeSyncing(currentId);
      }
    },
    [addSyncing, removeSyncing]
  );

  const syncAllNodeTextHooksToAesthetic = useCallback(
    async (textHookNodeId: number, fsAestheticId: string, currentId: number) => {
      const { data: hooks } = await supabase
        .from("node_text_hooks")
        .select("id, hook")
        .eq("node_id", textHookNodeId);
      if (!hooks || hooks.length === 0) return;

      const withText = hooks.filter((h) => h.hook);
      if (withText.length === 0) return;

      addSyncing(currentId);
      try {
        await Promise.all(
          withText.map(async (h) => {
            try {
              const fsHook = await addTextHookToFlowstageAesthetic(fsAestheticId, h.hook!);
              await supabase
                .from("node_text_hooks")
                .update({ flowstage_uuid: fsHook.id })
                .eq("id", h.id);
            } catch (err) {
              console.error("Flowstage add text hook on connect failed:", err);
            }
          })
        );
      } finally {
        removeSyncing(currentId);
      }
    },
    [addSyncing, removeSyncing]
  );

  const syncAllNodePresetsToAesthetic = useCallback(
    async (editStyleNodeId: number, fsAestheticId: string, currentId: number) => {
      const { data: nesRows } = await supabase
        .from("node_edit_styles")
        .select("id, edit_style_id, edit_styles(name, flowstage_aesthetic_id)")
        .eq("node_id", editStyleNodeId);

      console.log("[Flowstage] syncAllNodePresets: node", editStyleNodeId, "rows:", nesRows?.length ?? 0);

      if (!nesRows || nesRows.length === 0) return;

      const withData = (nesRows as any[]).filter(
        (r) => r.edit_styles?.name && r.edit_styles?.flowstage_aesthetic_id
      );
      console.log("[Flowstage] syncAllNodePresets: withData:", withData.length, "of", nesRows.length);
      if (withData.length === 0) return;

      addSyncing(currentId);
      try {
        await Promise.all(
          withData.map(async (r) => {
            try {
              await copyPresetToAesthetic(
                fsAestheticId,
                r.edit_styles.flowstage_aesthetic_id,
                r.edit_styles.name
              );
            } catch (err) {
              console.error("[Flowstage] Copy preset on connect failed:", err);
            }
          })
        );
      } finally {
        removeSyncing(currentId);
      }
    },
    [addSyncing, removeSyncing]
  );

  const handleBucketFileDrop = useCallback(
    async (
      nodeId: number,
      kindName: NodeKindName,
      bucketFile: {
        name: string;
        type: string;
        muxUploadId?: string;
        muxAssetId?: string;
        muxPlaybackId?: string;
        dbVideoId?: number;
        dbAudioId?: number;
        dbEditStyleId?: number;
      }
    ) => {
      if (kindName === "audios" && bucketFile.type === "audio" && bucketFile.dbAudioId) {
        const { data: linkRow, error: linkErr } = await supabase
          .from("node_audios")
          .insert({ node_id: nodeId, audio_id: bucketFile.dbAudioId })
          .select("id")
          .single();
        if (linkErr || !linkRow) {
          console.error("Failed to link audio:", linkErr?.message);
          return;
        }

        const aestheticEdge = await findConnectedAestheticFromDb(nodeId);
        if (!aestheticEdge) {
          console.log("[Flowstage] No connected aesthetic with flowstage_uuid for audio node", nodeId);
        } else {
          const { data: aud } = await supabase
            .from("audios")
            .select("flowstage_uuid")
            .eq("id", bucketFile.dbAudioId)
            .single();

          if (aud?.flowstage_uuid) {
            console.log("[Flowstage] Syncing audio to aesthetic", aestheticEdge.flowstageId, "uuid:", aud.flowstage_uuid);
            await syncAudioToFlowstage(
              aestheticEdge.flowstageId,
              aestheticEdge.currentId,
              aud.flowstage_uuid
            );
          } else {
            console.warn("[Flowstage] No flowstage_uuid on audio to sync");
          }
        }
      } else if (kindName === "videos" && bucketFile.type === "video") {
        let videoId = bucketFile.dbVideoId;
        const playbackId = bucketFile.muxPlaybackId ?? bucketFile.muxAssetId;
        const muxUrl = playbackId
          ? `https://stream.mux.com/${playbackId}/highest.mp4`
          : null;
        if (!videoId) {
          let thumbUrl: string | null = null;
          if (playbackId) {
            thumbUrl = `https://image.mux.com/${playbackId}/thumbnail.jpg?width=640&height=360&fit_mode=smartcrop`;
          }
          const { data: video, error: vidErr } = await supabase
            .from("videos")
            .insert({ name: bucketFile.name, url: muxUrl, thumbnail_url: thumbUrl })
            .select("id")
            .single();
          if (vidErr || !video) {
            console.error("Failed to insert video:", vidErr?.message);
            return;
          }
          videoId = video.id;
        }
        const { data: linkRow, error: linkErr } = await supabase
          .from("node_videos")
          .insert({ node_id: nodeId, video_id: videoId })
          .select("id")
          .single();
        if (linkErr || !linkRow) {
          console.error("Failed to link video:", linkErr?.message);
          return;
        }

        const aestheticEdge = await findConnectedAestheticFromDb(nodeId);
        if (!aestheticEdge) {
          console.log("[Flowstage] No connected aesthetic with flowstage_uuid for video node", nodeId);
        } else {
          const { data: vid } = await supabase
            .from("videos")
            .select("url, name, duration, thumbnail_url")
            .eq("id", videoId)
            .single();

          const videoUrl = vid?.url ?? muxUrl;
          const videoName = vid?.name ?? bucketFile.name;
          const videoDuration = vid?.duration ?? undefined;
          const videoThumb = vid?.thumbnail_url ?? undefined;

          if (videoUrl) {
            console.log("[Flowstage] Syncing video to aesthetic", aestheticEdge.flowstageId, "url:", videoUrl);
            await syncVideoToFlowstage(
              aestheticEdge.flowstageId,
              aestheticEdge.currentId,
              linkRow.id,
              { url: videoUrl, name: videoName, duration: videoDuration, thumbnailUrl: videoThumb }
            );
          } else {
            console.warn("[Flowstage] No video URL available to sync");
          }
        }
      } else if (kindName === "edit_styles" && bucketFile.type === "edit_style" && bucketFile.dbEditStyleId) {
        const { error: linkErr } = await supabase
          .from("node_edit_styles")
          .insert({ node_id: nodeId, edit_style_id: bucketFile.dbEditStyleId });
        if (linkErr) {
          console.error("Failed to link edit style:", linkErr.message);
          return;
        }

        const aestheticEdge = await findConnectedAestheticFromDb(nodeId);
        if (aestheticEdge) {
          const { data: es } = await supabase
            .from("edit_styles")
            .select("name, flowstage_aesthetic_id")
            .eq("id", bucketFile.dbEditStyleId)
            .single();

          if (es?.name && es?.flowstage_aesthetic_id) {
            addSyncing(aestheticEdge.currentId);
            try {
              await copyPresetToAesthetic(
                aestheticEdge.flowstageId,
                es.flowstage_aesthetic_id,
                es.name
              );
              console.log("[Flowstage] Preset copied:", es.name);
            } catch (err) {
              console.error("[Flowstage] Copy preset failed:", err);
            } finally {
              removeSyncing(aestheticEdge.currentId);
            }
          }
        }
      } else {
        return;
      }
      setDropVersion((v) => v + 1);
      await loadWorkspace();
    },
    [loadWorkspace, findConnectedAestheticFromDb, syncVideoToFlowstage, syncAudioToFlowstage, addSyncing, removeSyncing]
  );

  const handleAccountDrop = useCallback(
    async (
      nodeId: number,
      account: {
        accountId: number;
        username: string | null;
        displayName: string | null;
        platform: string | null;
        profilePictureUrl: string | null;
        followerCt: number | null;
      }
    ) => {
      const node = dbNodes.find((n) => n.id === nodeId);
      if (!node) return;

      let groupId = node.account_group_id;

      if (!groupId) {
        const { data: group, error: gErr } = await supabase
          .from("account_groups")
          .insert({ name: node.name })
          .select("id")
          .single();
        if (gErr || !group) {
          console.error("Failed to create account_group:", gErr?.message);
          return;
        }
        groupId = group.id;

        await supabase
          .from("nodes")
          .update({ account_group_id: groupId })
          .eq("id", nodeId);
        setDbNodes((prev) =>
          prev.map((n) => (n.id === nodeId ? { ...n, account_group_id: groupId } : n))
        );
      }

      const { data: existing } = await supabase
        .from("account_group_members")
        .select("id")
        .eq("account_group_id", groupId)
        .eq("account_id", account.accountId)
        .maybeSingle();
      if (existing) return;

      const { data: member, error: mErr } = await supabase
        .from("account_group_members")
        .insert({ account_group_id: groupId, account_id: account.accountId, is_active: true })
        .select("id")
        .single();
      if (mErr || !member) {
        console.error("Failed to insert account_group_member:", mErr?.message);
        return;
      }

      setAccountGroupMembers((prev) => ({
        ...prev,
        [nodeId]: [
          ...(prev[nodeId] ?? []),
          {
            memberId: member.id,
            accountId: account.accountId,
            username: account.username,
            displayName: account.displayName,
            platform: account.platform,
            profilePictureUrl: account.profilePictureUrl,
            followerCt: account.followerCt,
          },
        ],
      }));
    },
    [dbNodes]
  );

  const removeAccountGroupMember = useCallback(
    async (memberId: number) => {
      await supabase.from("account_group_members").delete().eq("id", memberId);
      setAccountGroupMembers((prev) => {
        const next: Record<number, AccountMember[]> = {};
        for (const [key, members] of Object.entries(prev)) {
          const filtered = members.filter((m) => m.memberId !== memberId);
          if (filtered.length > 0) next[Number(key)] = filtered;
        }
        return next;
      });
    },
    []
  );

  const isAccountConnected = useCallback(
    (accountNodeId: number): boolean => {
      return dbCurrents.some((c) => {
        if (c.to_node_id !== accountNodeId) return false;
        const src = dbNodes.find((n) => n.id === c.from_node_id);
        if (!src) return false;
        const kind = getKindName(src.kind_id);
        return kind === "edits" || kind === "aesthetic";
      });
    },
    [dbCurrents, dbNodes, getKindName]
  );

  return (
    <WorkspaceContext.Provider
      value={{
        nodeKinds,
        nodeKindsLoaded,
        getKindName,
        getKindId,
        dbNodes,
        dbCurrents,
        nodeVideoCounts,
        nodeAudioCounts,
        nodeTextHookCounts,
        nodeEditCounts,
        nodeEditStyleCounts,
        nodeCaptionCounts,
        loadWorkspace,
        insertNode,
        updateNodePosition,
        updateNodeName,
        deleteNode,
        insertCurrent,
        deleteCurrent,
        removeNodeVideo,
        removeNodeAudio,
        addNodeTextHook,
        removeNodeTextHook,
        removeNodeEdit,
        removeNodeEditStyle,
        getAestheticAssetCounts,
        isAccountConnected,
        syncingCurrentIds,
        postingNodeIds,
        addPostingNode,
        removePostingNode,
        dropVersion,
        handleBucketFileDrop,
        accountGroupMembers,
        handleAccountDrop,
        removeAccountGroupMember,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export interface NodeKind {
  id: number;
  name: string;
  display_name: string | null;
}

export interface DbNode {
  id: number;
  name: string | null;
  created_at: string;
  x_position: number;
  y_position: number;
  kind_id: number;
  artist_id: number | null;
  audio_id: number | null;
  account_group_id: number | null;
  flowstage_uuid: string | null;
}

export interface DbCurrent {
  id: number;
  created_at: string;
  from_node_id: number;
  to_node_id: number;
}

export interface DbVideo {
  id: number;
  created_at: string;
  name: string | null;
  url: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  thumbnail_url: string | null;
}

export interface DbAudio {
  id: number;
  name: string;
  artist_id: number | null;
  tiktok_sound_id: string | null;
  url: string | null;
  flowstage_uuid: string | null;
  song_name: string | null;
  song_uuid: string | null;
  song_duration: number | null;
  start_time: number | null;
  end_time: number | null;
}

export interface DbNodeVideo {
  id: number;
  node_id: number;
  video_id: number;
  flowstage_uuid: string | null;
}

export interface DbNodeAudio {
  id: number;
  node_id: number;
  audio_id: number;
}

export interface DbNodeTextHook {
  id: number;
  node_id: number;
  hook: string | null;
  flowstage_uuid: string | null;
}

export interface DbAccount {
  id: number;
  username: string | null;
  display_name: string | null;
  platform: string | null;
}

export interface DbAccountGroup {
  id: number;
  name: string | null;
}

export interface DbEdit {
  id: number;
  created_at: string;
  name: string | null;
  is_approved: boolean | null;
  render_url: string | null;
}

export interface DbNodeEdit {
  id: number;
  node_id: number;
  edit_id: number;
}

export interface DbEditStyle {
  id: number;
  created_at: string;
  name: string | null;
  flowstage_aesthetic_id: string | null;
}

export interface DbNodeEditStyle {
  id: number;
  node_id: number;
  edit_style_id: number;
}

export type NodeKindName =
  | "videos"
  | "audios"
  | "text_hooks"
  | "edits"
  | "edit_styles"
  | "aesthetic"
  | "account_group"
  | "captions";

export const ACCENT_COLORS: Record<NodeKindName, string> = {
  videos: "#AF52DE",
  audios: "#5AC8FA",
  text_hooks: "#FF9500",
  edits: "#5856D6",
  edit_styles: "#FF2D55",
  aesthetic: "#007AFF",
  account_group: "#FF3B30",
  captions: "#30D158",
};

export const KIND_ICONS: Record<NodeKindName, string> = {
  videos: "▶",
  audios: "♫",
  text_hooks: "T",
  edits: "◆",
  edit_styles: "◇",
  aesthetic: "◎",
  account_group: "●",
  captions: "C",
};

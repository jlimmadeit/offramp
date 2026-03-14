-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.account_group_members (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  account_id bigint,
  account_group_id bigint,
  is_active boolean,
  CONSTRAINT account_group_members_pkey PRIMARY KEY (id),
  CONSTRAINT account_group_accounts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id),
  CONSTRAINT account_group_accounts_account_group_id_fkey FOREIGN KEY (account_group_id) REFERENCES public.account_groups(id)
);
CREATE TABLE public.account_groups (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  name text,
  max_post_per_account_per_day bigint DEFAULT '3'::bigint,
  CONSTRAINT account_groups_pkey PRIMARY KEY (id)
);
CREATE TABLE public.accounts (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  username text,
  display_name text,
  platform text,
  bundle_team_name text,
  bundle_team_id text,
  profile_picture_url text,
  follower_ct bigint,
  average_views bigint,
  bundle_id text,
  CONSTRAINT accounts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.artists (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name character varying NOT NULL,
  CONSTRAINT artists_pkey PRIMARY KEY (id)
);
CREATE TABLE public.audios (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name character varying NOT NULL,
  artist_id bigint,
  tiktok_sound_id character varying,
  url text,
  flowstage_uuid text,
  song_name text,
  song_uuid text,
  song_duration double precision,
  start_time double precision,
  end_time double precision,
  CONSTRAINT audios_pkey PRIMARY KEY (id),
  CONSTRAINT audios_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES public.artists(id)
);
CREATE TABLE public.currents (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  from_node_id bigint,
  to_node_id bigint,
  CONSTRAINT currents_pkey PRIMARY KEY (id),
  CONSTRAINT currents_from_node_id_fkey FOREIGN KEY (from_node_id) REFERENCES public.nodes(id),
  CONSTRAINT currents_to_node_id_fkey FOREIGN KEY (to_node_id) REFERENCES public.nodes(id)
);
CREATE TABLE public.edit_styles (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  name text,
  flowstage_aesthetic_id text,
  CONSTRAINT edit_styles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.edits (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  name text,
  is_approved boolean,
  render_url text,
  flowstage_edit_id text,
  CONSTRAINT edits_pkey PRIMARY KEY (id)
);
CREATE TABLE public.node_audios (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  node_id bigint,
  audio_id bigint,
  CONSTRAINT node_audios_pkey PRIMARY KEY (id),
  CONSTRAINT node_songs_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id),
  CONSTRAINT node_songs_song_id_fkey FOREIGN KEY (audio_id) REFERENCES public.audios(id)
);
CREATE TABLE public.node_captions (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  caption text,
  node_id bigint,
  CONSTRAINT node_captions_pkey PRIMARY KEY (id),
  CONSTRAINT node_captions_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id)
);
CREATE TABLE public.node_edit_styles (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  node_id bigint,
  edit_style_id bigint,
  CONSTRAINT node_edit_styles_pkey PRIMARY KEY (id),
  CONSTRAINT node_edit_styles_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id),
  CONSTRAINT node_edit_styles_edit_style_id_fkey FOREIGN KEY (edit_style_id) REFERENCES public.edit_styles(id)
);
CREATE TABLE public.node_edits (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  node_id bigint,
  edit_id bigint,
  CONSTRAINT node_edits_pkey PRIMARY KEY (id),
  CONSTRAINT node_edits_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id),
  CONSTRAINT node_edits_edit_id_fkey FOREIGN KEY (edit_id) REFERENCES public.edits(id)
);
CREATE TABLE public.node_kinds (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  display_name text,
  CONSTRAINT node_kinds_pkey PRIMARY KEY (id)
);
CREATE TABLE public.node_text_hooks (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  hook text,
  node_id bigint,
  flowstage_uuid text,
  CONSTRAINT node_text_hooks_pkey PRIMARY KEY (id),
  CONSTRAINT node_text_hooks_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id)
);
CREATE TABLE public.node_videos (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  node_id bigint,
  video_id bigint,
  flowstage_uuid text,
  CONSTRAINT node_videos_pkey PRIMARY KEY (id),
  CONSTRAINT node_videos_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id),
  CONSTRAINT node_videos_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id)
);
CREATE TABLE public.nodes (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  x_position bigint,
  y_position bigint,
  kind_id bigint,
  artist_id bigint,
  audio_id bigint,
  account_group_id bigint,
  flowstage_uuid text,
  CONSTRAINT nodes_pkey PRIMARY KEY (id),
  CONSTRAINT nodes_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES public.artists(id),
  CONSTRAINT nodes_song_id_fkey FOREIGN KEY (audio_id) REFERENCES public.audios(id),
  CONSTRAINT nodes_kind_id_fkey FOREIGN KEY (kind_id) REFERENCES public.node_kinds(id),
  CONSTRAINT nodes_account_group_id_fkey FOREIGN KEY (account_group_id) REFERENCES public.account_groups(id)
);
CREATE TABLE public.post_statistics (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  stat_date date,
  post_id bigint,
  views bigint,
  likes bigint,
  shares bigint,
  comments bigint,
  saves bigint,
  CONSTRAINT post_statistics_pkey PRIMARY KEY (id),
  CONSTRAINT post_statistics_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id),
  CONSTRAINT post_statistics_post_id_stat_date_key UNIQUE (post_id, stat_date)
);
CREATE TABLE public.posts (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  account_id bigint,
  edit_id bigint UNIQUE,
  bundle_post_id text,
  platform_post_id text,
  platform_caption text,
  platform text,
  scheduled_time timestamp with time zone,
  post_url text,
  CONSTRAINT posts_pkey PRIMARY KEY (id),
  CONSTRAINT posts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id),
  CONSTRAINT posts_edit_id_fkey FOREIGN KEY (edit_id) REFERENCES public.edits(id)
);
CREATE TABLE public.videos (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  name text,
  url text,
  duration double precision,
  width bigint,
  height bigint,
  thumbnail_url text,
  static_rendition_url text,
  CONSTRAINT videos_pkey PRIMARY KEY (id)
);
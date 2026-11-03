// Shared row shapes for the community backend API. These mirror the tables
// and SQL functions in db/schema.sql.

export type PermissionRole = "member" | "officer" | "admin";
export type GameRank = "r1" | "r2" | "r3" | "r4" | "r5";
export type AllianceTitle =
  | "diplomat"
  | "recruiter"
  | "goddess"
  | "god_of_war"
  | "alliance_leader";

export type ReactionType = "fire" | "skull" | "heart" | "clap";

export type SessionInfo = {
  user: { id: string; email: string } | null;
  profile: ProfileRow | null;
};

export type ProfileRow = {
  id: string;
  alliance: string | null;
  display_name: string | null;
  in_game_name: string;
  display_rank: string | null;
  permission_role: PermissionRole;
  created_at: string;
  name_changed_at: string | null;
};

export type ChannelRow = {
  id: string;
  alliance: string | null;
  slug: string;
  name: string;
  topic: string | null;
  min_role: PermissionRole;
  sort_order: number;
  scope: "community" | "alliance";
  category_id: string | null;
  slow_mode_seconds: number;
  is_archived: boolean;
  allow_threads: boolean;
};

export type ChatMessageRow = {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  parent_message_id: string | null;
  thread_root_id: string | null;
  identity_label: string;
  reactions: Record<string, number>;
};

export type ChatAttachmentInfo = {
  id: string;
  message_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  url: string;
};

export type ChannelMessagesPayload = {
  messages: ChatMessageRow[];
  pinned_message_ids: string[];
  attachments: ChatAttachmentInfo[];
};

export type SearchResultRow = {
  id: string;
  body: string;
  created_at: string;
  identity_label: string;
};

export type MentionCandidate = {
  user_id: string;
  identity_label: string;
  mention_text: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type AllianceInvitationRow = {
  id: string;
  alliance: string;
  invitee_id: string;
  invited_by: string;
  game_rank: GameRank;
  alliance_title: AllianceTitle | null;
  permission_role: PermissionRole;
  status: string;
  expires_at: string;
  created_at: string;
  responded_at: string | null;
};

export type AccountPayload = {
  email: string;
  identity_label: string;
  has_alliance: boolean;
  notifications: NotificationRow[];
  invitations: AllianceInvitationRow[];
};

export type GuideCommentRow = {
  id: string;
  body: string;
  identity_label: string;
  created_at: string;
};

export type GuideReactionsPayload = {
  counts: Record<ReactionType, number>;
  reacted: Record<ReactionType, boolean>;
  signed_in: boolean;
};

// Realtime events delivered over the channel SSE stream.
export type ChatStreamEvent =
  | { type: "message" }
  | { type: "typing"; user_id: string; identity_label: string; typing: boolean }
  | { type: "presence"; users: { user_id: string; identity_label: string }[] };

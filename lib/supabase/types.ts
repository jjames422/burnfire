// `type`, not `interface` — an interface never satisfies an index-signature
// type like Record<string, unknown>, which is exactly what supabase-js's
// generic Database constraints (GenericTable/GenericSchema) require. With
// `interface` here, every table generic silently collapsed to `never`.
export type CommentRow = {
  id: string;
  author_id: string | null;
  alliance: string;
  guide_slug: string;
  author_name: string;
  author_rank: string | null;
  body: string;
  status: "approved" | "pending" | "rejected";
  created_at: string;
};

export type GuideCommentRow = {
  id: string;
  body: string;
  identity_label: string;
  created_at: string;
};

export type ReactionType = "fire" | "skull" | "heart" | "clap";

export type ReactionRow = {
  id: string;
  alliance: string;
  guide_slug: string;
  reaction_type: ReactionType;
  count: number;
  updated_at: string;
};

export type GuideReactionRow = {
  id: string;
  alliance: string;
  guide_slug: string;
  reaction_type: ReactionType;
  user_id: string;
  created_at: string;
};

export type PermissionRole = "member" | "officer" | "admin";
export type GameRank = "r1" | "r2" | "r3" | "r4" | "r5";
export type AllianceTitle =
  "diplomat" | "recruiter" | "goddess" | "god_of_war" | "alliance_leader";

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

export type AllianceMemberRow = {
  // Database primary key: one membership per authenticated account.
  alliance: string;
  user_id: string;
  permission_role: PermissionRole;
  game_rank: GameRank;
  alliance_title: AllianceTitle | null;
  verified_at: string | null;
  verified_by: string | null;
  joined_at: string;
};

export type AllianceRow = {
  slug: string;
  name: string;
  code: string;
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

export type MessageRow = {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
  edited_at: string | null;
  parent_message_id: string | null;
  thread_root_id: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
};

export type ChatMessageRow = Pick<
  MessageRow,
  | "id"
  | "channel_id"
  | "author_id"
  | "body"
  | "created_at"
  | "edited_at"
  | "parent_message_id"
  | "thread_root_id"
> & {
  identity_label: string;
  reactions: Record<string, number>;
};

export type MessageReactionRow = {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};
export type PinnedMessageRow = { channel_id: string; message_id: string; pinned_by: string; pinned_at: string };
export type ContentReportRow = { id: string; reporter_id: string; target_type: "comment" | "message" | "fan_art"; target_id: string; reason: string; status: "open" | "resolved" | "dismissed"; created_at: string };
export type ChatAttachmentRow = { id: string; message_id: string; uploader_id: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number; created_at: string };
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

export type Database = {
  public: {
    Tables: {
      alliances: {
        Row: AllianceRow;
        Insert: AllianceRow;
        Update: Partial<AllianceRow>;
        Relationships: [];
      };
      comments: {
        Row: CommentRow;
        Insert: Pick<CommentRow, "alliance" | "guide_slug" | "body"> &
          Partial<
            Pick<
              CommentRow,
              "author_id" | "author_name" | "author_rank" | "status"
            >
          >;
        Update: Partial<CommentRow>;
        Relationships: [];
      };
      reactions: {
        Row: ReactionRow;
        Insert: Pick<ReactionRow, "alliance" | "guide_slug" | "reaction_type"> &
          Partial<Pick<ReactionRow, "count">>;
        Update: Partial<ReactionRow>;
        Relationships: [];
      };
      guide_reactions: {
        Row: GuideReactionRow;
        Insert: Pick<
          GuideReactionRow,
          "alliance" | "guide_slug" | "reaction_type" | "user_id"
        >;
        Update: never;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Pick<ProfileRow, "id" | "in_game_name"> &
          Partial<
            Pick<
              ProfileRow,
              "alliance" | "display_name" | "display_rank" | "permission_role"
            >
          >;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      alliance_members: {
        Row: AllianceMemberRow;
        Insert: Pick<AllianceMemberRow, "alliance" | "user_id"> &
          Partial<
            Pick<
              AllianceMemberRow,
              "permission_role" | "game_rank" | "alliance_title"
            >
          >;
        Update: Partial<AllianceMemberRow>;
        Relationships: [];
      };
      channels: {
        Row: ChannelRow;
        Insert: Pick<ChannelRow, "alliance" | "slug" | "name"> &
          Partial<Pick<ChannelRow, "topic" | "min_role" | "sort_order">>;
        Update: Partial<ChannelRow>;
        Relationships: [];
      };
      message_reactions: {
        Row: MessageReactionRow;
        Insert: Pick<MessageReactionRow, "message_id" | "user_id" | "emoji">;
        Update: never;
        Relationships: [];
      };
      pinned_messages: {
        Row: PinnedMessageRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      content_reports: {
        Row: ContentReportRow;
        Insert: Pick<ContentReportRow, "reporter_id" | "target_type" | "target_id" | "reason">;
        Update: never;
        Relationships: [];
      };
      chat_attachments: {
        Row: ChatAttachmentRow;
        Insert: Pick<ChatAttachmentRow, "message_id" | "uploader_id" | "storage_path" | "file_name" | "mime_type" | "size_bytes">;
        Update: never;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      alliance_invitations: {
        Row: AllianceInvitationRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      messages: {
        Row: MessageRow;
        Insert: Pick<MessageRow, "channel_id" | "author_id" | "body">;
        Update: Partial<MessageRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_guide_comments: {
        Args: { p_alliance: string; p_guide_slug: string };
        Returns: GuideCommentRow[];
      };
      update_in_game_name: {
        Args: { p_in_game_name: string };
        Returns: ProfileRow;
      };
      get_channel_messages: {
        Args: { p_channel_id: string; p_limit?: number };
        Returns: ChatMessageRow[];
      };
      post_channel_message: {
        Args: {
          p_channel_id: string;
          p_body: string;
          p_parent_message_id?: string | null;
          p_mentioned_user_ids?: string[];
        };
        Returns: string;
      };
      get_my_chat_identity: {
        Args: Record<string, never>;
        Returns: string;
      };
      get_channel_mention_candidates: {
        Args: { p_channel_id: string; p_query?: string; p_limit?: number };
        Returns: { user_id: string; identity_label: string; mention_text: string }[];
      };
      edit_message: {
        Args: { p_message_id: string; p_body: string };
        Returns: MessageRow;
      };
      delete_message: {
        Args: { p_message_id: string };
        Returns: undefined;
      };
      pin_message: {
        Args: { p_message_id: string; p_pin: boolean };
        Returns: undefined;
      };
      search_channel_messages: {
        Args: { p_channel_id: string; p_query: string };
        Returns: { id: string; body: string; created_at: string; identity_label: string }[];
      };
      mark_notification_read: {
        Args: { p_notification_id: string };
        Returns: undefined;
      };
      respond_to_alliance_invitation: {
        Args: { p_invitation_id: string; p_accept: boolean };
        Returns: AllianceInvitationRow;
      };
    };
  };
};

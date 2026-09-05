// `type`, not `interface` — an interface never satisfies an index-signature
// type like Record<string, unknown>, which is exactly what supabase-js's
// generic Database constraints (GenericTable/GenericSchema) require. With
// `interface` here, every table generic silently collapsed to `never`.
export type CommentRow = {
  id: string;
  alliance: string;
  guide_slug: string;
  author_name: string;
  author_rank: string | null;
  body: string;
  status: "approved" | "pending" | "rejected";
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

export type PermissionRole = "member" | "officer" | "admin";

export type ProfileRow = {
  id: string;
  alliance: string;
  display_name: string;
  display_rank: string | null;
  permission_role: PermissionRole;
  created_at: string;
};

export type ChannelRow = {
  id: string;
  alliance: string;
  slug: string;
  name: string;
  topic: string | null;
  min_role: PermissionRole;
  sort_order: number;
};

export type MessageRow = {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      comments: {
        Row: CommentRow;
        Insert: Pick<CommentRow, "alliance" | "guide_slug" | "author_name" | "body"> &
          Partial<Pick<CommentRow, "author_rank" | "status">>;
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
      profiles: {
        Row: ProfileRow;
        Insert: Pick<ProfileRow, "id" | "alliance" | "display_name"> &
          Partial<Pick<ProfileRow, "display_rank" | "permission_role">>;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      channels: {
        Row: ChannelRow;
        Insert: Pick<ChannelRow, "alliance" | "slug" | "name"> &
          Partial<Pick<ChannelRow, "topic" | "min_role" | "sort_order">>;
        Update: Partial<ChannelRow>;
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
      increment_reaction: {
        Args: {
          p_alliance: string;
          p_guide_slug: string;
          p_reaction_type: string;
        };
        Returns: ReactionRow;
      };
    };
  };
};

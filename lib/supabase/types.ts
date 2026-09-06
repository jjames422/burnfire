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
    };
  };
};

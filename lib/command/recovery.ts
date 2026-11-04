export const RECOVERY_ACTIONS = {
  academy_reset: {
    label: "Reset quiz and academy progress",
    description: "Deletes all quiz attempts, training acknowledgments and section progress, and returns this member to the welcome step. Keeps their game ID, verification, rank, preferences and follow-up issues.",
  },
  resolve_followups: {
    label: "Resolve selected officer issues",
    description: "Marks only the selected open follow-ups as resolved. Preserves their notes and history. Does not pass quizzes or complete training.",
  },
  revoke_sessions: {
    label: "Sign out of all sessions",
    description: "Signs this user out on every browser and cancels pending passkey setup. They can sign back in through email or a saved passkey. If this is your account, you will also be signed out.",
  },
  remove_passkeys: {
    label: "Remove all passkeys",
    description: "Deletes this user's saved passkeys and cancels pending passkey setup. Email sign-in remains available. Existing sessions stay signed in; use sign-out separately if needed.",
  },
  reset_identity: {
    label: "Reset identity verification",
    description: "Returns identity verification to pending, suspending rank-based private chat and officer access until approved again. Keeps the game ID, rank and training. Independent site-admin access is unchanged.",
  },
} as const;

export type RecoveryAction = keyof typeof RECOVERY_ACTIONS;

export function isRecoveryAction(value: unknown): value is RecoveryAction {
  return typeof value === "string" && Object.hasOwn(RECOVERY_ACTIONS, value);
}

export type UserRecoveryData = {
  user: {
    id: string; email: string; in_game_name: string; enrolled: boolean;
    identity_status: string | null; game_rank: string | null;
    sessions: number; passkeys: number; quiz_attempts: number; acknowledgments: number;
  };
  followups: { id: string; reason: string; status: string; training_title: string | null }[];
  history: {
    id: string; action: RecoveryAction; reason: string; actor_name: string | null;
    created_at: string;
  }[];
};

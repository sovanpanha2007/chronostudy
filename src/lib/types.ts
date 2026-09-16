export type Profile = {
  id: string;
  display_name: string;
  daily_goal_minutes: number;
  timezone: string;
  onboarded_at: string | null;
};

export type StudySession = {
  id: string;
  user_id: string;
  session_date: string;
  duration_seconds: number;
  subject: string | null;
  goal_minutes_at_time: number;
  started_at: string;
  timezone: string;
  revision: number;
  finalized_at: string | null;
  deleted_at: string | null;
};

export type DayTotal = { session_date: string; total_seconds: number; goal_fraction: number; session_count: number };
export type StudySummary = {
  today: string;
  total_seconds: number;
  session_count: number;
  days: DayTotal[];
  recent: StudySession[];
  badges: string[];
  subjects: string[];
};
export type SaveReceipt = { session: StudySession; awards: string[]; summary: StudySummary | null };

export interface User {
  id: string;
  phone: string | null;
  nickname: string;
  avatar: string | null;
  role: 'user' | 'admin';
  tzOffset: number;
  weeklyGoal: number;
  defaultSessionVisibility: string;
  defaultPostVisibility: string;
  notifyCheckin: boolean;
  notifyWeekly: boolean;
  notifyInteraction: boolean;
  reminderTime: string;
  privacyAcceptedAt: string | null;
  status: string;
  deleteRequestedAt: string | null;
  createdAt: string;
}

export interface MeResponse {
  user: User;
  today: string;
  todayCheckin: { source: string; workoutType: string | null; durationMin: number | null } | null;
  sessionsToday: number;
  streak: number;
  unreadNotifications: number;
  deletion: { requestedAt: string; purgeAt: string } | null;
  privacyAccepted: boolean;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Config {
  productName: string;
  communityVisible: boolean;
  communityNote: string;
  quotaGb: number;
  publicDailyQuota: number;
  publicListingEnabled: boolean;
  brandWatermarkText: string;
  budget: {
    level: 'normal' | 'warn50' | 'warn80' | 'blocked';
    ratio: number;
    capCny: number;
    spentCny: number;
    videoUploadAllowed: boolean;
    message: string;
  };
  reviewPolicy: any;
  features: Record<string, boolean>;
}

export interface WorkoutSet {
  id: string;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceKm: number | null;
  avgHr: number | null;
  rpe: number | null;
  setType: 'normal' | 'warmup' | 'drop' | 'superset';
  note: string | null;
  clientOpId?: string | null;
  estimated1RM?: number | null;
}

export interface SessionItem {
  id: string;
  exerciseId: string;
  exerciseName: string;
  primaryMuscle: string;
  equipment: string;
  exerciseType: string;
  aliases: string;
  note: string | null;
  sortOrder: number;
  sets: WorkoutSet[];
  volume: number;
  last: { weightKg: number; reps: number; rpe: number | null; localDate: string } | null;
  prs: { maxWeight: any; maxE1RM: any; maxReps: any };
}

export interface SessionSummary {
  id: string;
  type: 'strength' | 'cardio' | 'stretch' | 'other';
  title: string | null;
  startedAt: string;
  endedAt: string | null;
  localDate: string;
  tzOffset: number;
  durationSec: number;
  volumeKg: number;
  notes: string | null;
  feeling: number | null;
  source: string;
  visibility: string;
  itemCount: number;
  setCount: number;
  mediaCount: number;
  exerciseNames: string[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionDetail extends SessionSummary {
  items: SessionItem[];
  media: Media[];
  prs: PRHit[];
}

export interface PRHit {
  exerciseId: string;
  exerciseName: string;
  metric: string;
  value: number;
  previous: number;
  label: string;
}

export interface Exercise {
  id: string;
  name: string;
  aliases: string[];
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  type: 'strength' | 'cardio' | 'stretch';
  isBuiltin: boolean;
  isFavorite: boolean;
  createdAt: string;
}

export interface ExerciseDetail extends Exercise {
  prs: {
    maxWeight: { weight: number; reps: number; date: string | null } | null;
    maxE1RM: { value: number; weight: number; reps: number; date: string | null } | null;
    maxReps: { reps: number; weight: number; date: string | null } | null;
  };
  last: { weightKg: number; reps: number; rpe: number | null; localDate: string } | null;
  history: Array<{ sessionId: string; localDate: string; maxWeight: number; maxReps: number; volume: number; setCount: number }>;
  trend: Array<{ date: string; maxWeight: number; volume: number; estimated1RM: number }>;
}

export interface Media {
  id: string;
  type: 'image' | 'video';
  originalName: string;
  mime: string;
  sizeBytes: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  status: string;
  reviewStatus: string;
  watermark: boolean;
  watermarkText: string | null;
  createdAt: string;
  url: string | null;
  thumbUrl: string | null;
}

export interface Block {
  id: string;
  type: 'paragraph' | 'heading' | 'image' | 'gallery' | 'video' | 'quote' | 'list' | 'divider' | 'todo' | 'embed';
  version: number;
  props: any;
}

export interface Post {
  id: string;
  title: string;
  blocks: Block[];
  blocksVersion: number;
  status: 'draft' | 'pending' | 'published' | 'rejected' | 'offline';
  visibility: 'private' | 'unlisted' | 'public';
  coverUrl: string | null;
  summary: string | null;
  allowShare: boolean;
  allowIndex: boolean;
  reviewStatus: string;
  reviewReason: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  commentCount: number;
  topicIds: string[];
  viewCount?: number;
  wordCount?: number;
  lock?: { device: string; lockedAt: string; isMine: boolean } | null;
  appeal?: { id: string; status: string; reason: string; resolution: string | null } | null;
  author?: { id: string; nickname: string; avatar: string | null };
  isOwner?: boolean;
  shareUrl?: string;
}

export interface CheckinDay {
  date: string;
  status: 'auto' | 'manual' | 'none';
  isToday: boolean;
  isFuture: boolean;
  sessionCount: number;
  checkin: { id: string; source: string; workoutType: string | null; durationMin: number | null; note: string | null } | null;
}

export interface CheckinSummary {
  streak: number;
  weekly: { weekStart: string; done: number; goal: number; achieved: boolean };
  badges: Array<{ code: string; name: string; description: string; icon: string; unlocked: boolean; awardedAt: string | null }>;
}

export interface Template {
  id: string;
  name: string;
  type: string;
  payload: {
    type: string;
    items: Array<{
      exerciseId: string;
      exerciseName: string;
      note: string | null;
      setCount: number;
      sets: Array<{ setType: string; weightKg: number | null; reps: number | null; setIndex: number }>;
    }>;
  };
  createdAt: string;
  updatedAt: string;
}

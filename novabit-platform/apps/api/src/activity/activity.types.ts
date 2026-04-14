export type ActivitySeverity = 'info' | 'warning' | 'critical';

export type ActivityReviewState = 'new' | 'reviewed' | 'flagged' | 'actioned';

export type UserActivityLog = {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userUsername: string | null;
  activityType: string;
  activityCategory: string;
  activityLabel: string;
  severity: ActivitySeverity;
  details: Record<string, unknown>;
  ipAddress: string | null;
  city: string | null;
  country: string | null;
  userAgent: string | null;
  deviceType: string | null;
  browser: string | null;
  platform: string | null;
  pagePath: string | null;
  reviewedState: ActivityReviewState;
  reviewedAt: string | null;
  reviewedBy: string | null;
  adminAction: string | null;
  adminNote: string | null;
  createdAt: string;
};

export type ActivityFeedStats = {
  total: number;
  logins: number;
  security: number;
  investments: number;
  interactions: number;
  flagged: number;
  critical: number;
};

export type ActivityFeedAlert = {
  id: string;
  title: string;
  copy: string;
  severity: ActivitySeverity;
  createdAt: string;
  userLabel: string;
};

export type AdminActivityFeedResponse = {
  authorized: true;
  activities: UserActivityLog[];
  stats: ActivityFeedStats;
  alerts: ActivityFeedAlert[];
  filters: {
    hours: number;
    from: string | null;
    to: string | null;
    userId: string | null;
    activityType: string | null;
    reviewState: ActivityReviewState | 'all';
    search: string | null;
    limit: number;
  };
};

export type AdminUserActivityHistoryResponse = {
  authorized: true;
  userId: string;
  activities: UserActivityLog[];
  stats: ActivityFeedStats;
};

export type ReviewActivityPayload = {
  reviewState?: unknown;
  adminAction?: unknown;
  adminNote?: unknown;
};

export type ReviewActivityResponse = {
  reviewed: true;
  activity: UserActivityLog;
};

export type TrackUserActivityPayload = {
  activityType?: unknown;
  activityCategory?: unknown;
  activityLabel?: unknown;
  severity?: unknown;
  pagePath?: unknown;
  details?: unknown;
};

export type TrackUserActivityResponse = {
  tracked: true;
};

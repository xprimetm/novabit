import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolConfig } from 'pg';
import { Observable, Subject, interval, merge } from 'rxjs';
import { map } from 'rxjs/operators';
import { loadApiEnv } from '../config/load-env';
import { PlatformStoreUnavailableError } from '../platform-store/platform-store.errors';
import { PlatformStoreService } from '../platform-store/platform-store.service';
import type { PublicUser } from '../platform-store/platform-store.types';
import { getClientIp } from '../security/client-ip';
import type {
  ActivityFeedAlert,
  ActivityFeedStats,
  ActivityReviewState,
  ActivitySeverity,
  AdminActivityFeedResponse,
  AdminUserActivityHistoryResponse,
  ReviewActivityPayload,
  ReviewActivityResponse,
  TrackUserActivityPayload,
  TrackUserActivityResponse,
  UserActivityLog,
} from './activity.types';

type ActivityLogRow = {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  user_username: string | null;
  activity_type: string;
  activity_category: string;
  activity_label: string;
  severity: string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  city: string | null;
  country: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  platform: string | null;
  page_path: string | null;
  reviewed_state: string;
  reviewed_at: Date | string | null;
  reviewed_by: string | null;
  admin_action: string | null;
  admin_note: string | null;
  created_at: Date | string;
};

type ResolvedActivityInput = {
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
  reviewedState?: ActivityReviewState;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  adminAction?: string | null;
  adminNote?: string | null;
  createdAt?: string;
};

type ActivityCaptureInput = {
  user?: Pick<PublicUser, 'id' | 'name' | 'email' | 'username'> | null;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  userUsername?: string | null;
  activityType: string;
  activityCategory: string;
  activityLabel: string;
  severity?: ActivitySeverity;
  details?: Record<string, unknown>;
  pagePath?: string | null;
};

type ActivityFeedFilters = {
  hours: number;
  from: string | null;
  to: string | null;
  userId: string | null;
  activityType: string | null;
  reviewState: ActivityReviewState | 'all';
  search: string | null;
  limit: number;
};

type GeoLookupResult = {
  city: string | null;
  country: string | null;
};

@Injectable()
export class ActivityService implements OnModuleDestroy {
  private readonly logger = new Logger(ActivityService.name);
  private pool: Pool | null = null;
  private schemaReady = false;
  private readonly memoryLogs: UserActivityLog[] = [];
  private readonly feed$ = new Subject<UserActivityLog>();
  private readonly geoCache = new Map<
    string,
    GeoLookupResult & { expiresAt: number }
  >();

  constructor(private readonly store: PlatformStoreService) {
    loadApiEnv();
  }

  async onModuleDestroy() {
    if (!this.pool) {
      return;
    }

    try {
      await this.pool.end();
    } catch {
      this.logger.warn('Unable to close activity-monitor PostgreSQL pool cleanly.');
    } finally {
      this.pool = null;
    }
  }

  streamAdminActivity(sessionToken: string | null): Observable<{
    data: Record<string, unknown>;
    type?: string;
  }> {
    return new Observable((subscriber) => {
      void this.requireAdmin(sessionToken)
        .then(() => {
          const liveSubscription = merge(
            this.feed$.pipe(
              map((activity) => ({
                type: 'activity',
                data: activity,
              })),
            ),
            interval(25000).pipe(
              map(() => ({
                type: 'ping',
                data: { at: new Date().toISOString() },
              })),
            ),
          ).subscribe(subscriber);

          return () => liveSubscription.unsubscribe();
        })
        .then((cleanup) => {
          subscriber.add(cleanup);
        })
        .catch((error) => subscriber.error(error));
    });
  }

  async getAdminActivityFeed(
    sessionToken: string | null,
    query: Record<string, unknown>,
  ): Promise<AdminActivityFeedResponse> {
    await this.requireAdmin(sessionToken);
    const filters = this.normalizeFeedFilters(query);
    const activities = await this.listActivities(filters);

    return {
      authorized: true,
      activities,
      stats: this.buildStats(activities),
      alerts: this.buildAlerts(activities),
      filters,
    };
  }

  async getAdminUserActivityHistory(
    sessionToken: string | null,
    userId: string,
    query: Record<string, unknown>,
  ): Promise<AdminUserActivityHistoryResponse> {
    await this.requireAdmin(sessionToken);
    const filters = this.normalizeFeedFilters({
      ...query,
      userId,
    });
    const activities = await this.listActivities(filters);

    return {
      authorized: true,
      userId: userId.trim(),
      activities,
      stats: this.buildStats(activities),
    };
  }

  async reviewActivity(
    sessionToken: string | null,
    activityId: string,
    payload: ReviewActivityPayload,
  ): Promise<ReviewActivityResponse> {
    const admin = await this.requireAdmin(sessionToken);
    const normalizedActivityId = activityId.trim();

    if (!normalizedActivityId) {
      throw new BadRequestException('A valid activity record is required.');
    }

    const reviewState = this.normalizeReviewState(payload.reviewState);
    const adminAction = this.normalizeOptionalAction(payload.adminAction);
    const adminNote = this.normalizeOptionalNote(payload.adminNote);
    const reviewedBy = admin.name || admin.username || admin.email;
    const reviewedAt = new Date().toISOString();

    const pool = await this.requirePool();
    if (!pool) {
      const existing = this.memoryLogs.find((entry) => entry.id === normalizedActivityId);
      if (!existing) {
        throw new BadRequestException('Activity log not found.');
      }

      existing.reviewedState = reviewState;
      existing.reviewedAt = reviewedAt;
      existing.reviewedBy = reviewedBy;
      existing.adminAction = adminAction;
      existing.adminNote = adminNote;
      this.feed$.next(existing);

      return {
        reviewed: true,
        activity: existing,
      };
    }

    try {
      const result = await pool.query<ActivityLogRow>(
        `UPDATE user_activity_logs
         SET reviewed_state = $2,
             reviewed_at = $3,
             reviewed_by = $4,
             admin_action = $5,
             admin_note = $6
         WHERE id = $1
         RETURNING
           id,
           user_id,
           user_name,
           user_email,
           user_username,
           activity_type,
           activity_category,
           activity_label,
           severity,
           details,
           ip_address,
           city,
           country,
           user_agent,
           device_type,
           browser,
           platform,
           page_path,
           reviewed_state,
           reviewed_at,
           reviewed_by,
           admin_action,
           admin_note,
           created_at`,
        [
          normalizedActivityId,
          reviewState,
          reviewedAt,
          reviewedBy,
          adminAction,
          adminNote,
        ],
      );

      const row = result.rows[0];
      if (!row) {
        throw new BadRequestException('Activity log not found.');
      }

      const activity = this.toActivityLog(row);
      this.feed$.next(activity);
      return {
        reviewed: true,
        activity,
      };
    } catch (error) {
      throw this.toServiceError(error, 'Unable to review the activity log.');
    }
  }

  async trackAuthenticatedUserActivity(
    sessionToken: string | null,
    request: Request,
    payload: TrackUserActivityPayload,
  ): Promise<TrackUserActivityResponse> {
    const user = await this.requireInvestor(sessionToken);
    const activityType = this.normalizeActivityToken(
      payload.activityType,
      'dashboard_click',
    );
    const activityLabel = this.normalizeActivityLabel(
      payload.activityLabel,
      activityType === 'dashboard_view'
        ? 'Dashboard view'
        : activityType === 'profile_updated'
          ? 'Profile updated'
          : activityType === 'settings_updated'
            ? 'Settings updated'
            : 'Dashboard interaction',
    );
    const category = this.normalizeActivityCategory(
      payload.activityCategory,
      this.defaultCategoryForType(activityType),
    );
    const severity = this.normalizeSeverity(payload.severity);
    const details = this.sanitizeDetails(payload.details);
    const pagePath = this.normalizePagePath(payload.pagePath);

    await this.captureFromRequest(request, {
      user,
      activityType,
      activityCategory: category,
      activityLabel,
      severity,
      details,
      pagePath,
    });

    return { tracked: true };
  }

  async logUserLoginSuccess(request: Request, user: PublicUser) {
    await this.captureFromRequest(request, {
      user,
      activityType: 'login_success',
      activityCategory: 'login',
      activityLabel: 'User sign-in completed',
      details: {
        verifiedEmail: user.emailVerified,
        verifiedPhone: user.phoneVerified,
      },
    });
  }

  async logUserLoginFailure(
    request: Request,
    identifier: string,
    reason: string,
    pagePath = '/login',
  ) {
    await this.captureFromRequest(request, {
      userId: null,
      userName: null,
      userEmail: null,
      userUsername: identifier || null,
      activityType: 'login_failed',
      activityCategory: 'security',
      activityLabel: 'Failed sign-in attempt',
      severity: 'warning',
      details: {
        identifier,
        reason,
      },
      pagePath,
    });
  }

  async logPasswordResetRequested(request: Request, email: string) {
    await this.captureFromRequest(request, {
      userEmail: email,
      activityType: 'password_reset_requested',
      activityCategory: 'security',
      activityLabel: 'Password reset requested',
      severity: 'warning',
      details: {
        email,
      },
      pagePath: '/forgot-password',
    });
  }

  async logEmailVerified(request: Request, user: PublicUser) {
    await this.captureFromRequest(request, {
      user,
      activityType: 'email_verified',
      activityCategory: 'security',
      activityLabel: 'Email verification completed',
      details: {
        channel: user.phoneVerified ? 'phone' : 'email',
      },
    });
  }

  async logDepositSubmitted(
    request: Request,
    user: Pick<PublicUser, 'id' | 'name' | 'email' | 'username'>,
    details: Record<string, unknown>,
  ) {
    await this.captureFromRequest(request, {
      user,
      activityType: 'deposit_submitted',
      activityCategory: 'investment',
      activityLabel: 'Deposit submitted',
      details,
      pagePath: '/dashboard#deposit-funds',
    });
  }

  async logWithdrawalSubmitted(
    request: Request,
    user: Pick<PublicUser, 'id' | 'name' | 'email' | 'username'>,
    details: Record<string, unknown>,
  ) {
    await this.captureFromRequest(request, {
      user,
      activityType: 'withdrawal_submitted',
      activityCategory: 'investment',
      activityLabel: 'Withdrawal submitted',
      details,
      pagePath: '/dashboard#withdraw-funds',
    });
  }

  async logKycSubmitted(
    request: Request,
    user: Pick<PublicUser, 'id' | 'name' | 'email' | 'username'>,
    details: Record<string, unknown>,
  ) {
    await this.captureFromRequest(request, {
      user,
      activityType: 'kyc_submitted',
      activityCategory: 'profile',
      activityLabel: 'KYC submitted',
      details,
      pagePath: '/dashboard#kyc',
    });
  }

  async logAdminReviewToUserActivity(
    request: Request,
    user: Pick<PublicUser, 'id' | 'name' | 'email' | 'username'>,
    input: {
      activityType: string;
      activityLabel: string;
      activityCategory?: string;
      severity?: ActivitySeverity;
      details?: Record<string, unknown>;
      pagePath?: string | null;
    },
  ) {
    await this.captureFromRequest(request, {
      user,
      activityType: input.activityType,
      activityCategory: input.activityCategory || 'investment',
      activityLabel: input.activityLabel,
      severity: input.severity,
      details: input.details,
      pagePath: input.pagePath,
    });
  }

  async logAdminUserAccountAction(
    request: Request,
    user:
      | Pick<PublicUser, 'id' | 'name' | 'email' | 'username'>
      | {
          id: string;
          name?: string | null;
          email?: string | null;
          username?: string | null;
        },
    action: string,
  ) {
    await this.captureFromRequest(request, {
      userId: user.id,
      userName: user.name || null,
      userEmail: user.email || null,
      userUsername: user.username || null,
      activityType: 'account_status_changed',
      activityCategory: 'security',
      activityLabel: 'Account status changed by admin',
      severity: action === 'delete' ? 'critical' : 'warning',
      details: {
        action,
      },
      pagePath: '/admin/users',
    });
  }

  private async captureFromRequest(
    request: Request,
    input: ActivityCaptureInput,
  ): Promise<UserActivityLog | null> {
    try {
      const requestContext = await this.resolveRequestContext(request);
      const saved = await this.persistActivity({
        userId: input.user?.id || input.userId || null,
        userName: input.user?.name || input.userName || null,
        userEmail: input.user?.email || input.userEmail || null,
        userUsername: input.user?.username || input.userUsername || null,
        activityType: this.normalizeActivityToken(input.activityType, 'dashboard_click'),
        activityCategory: this.normalizeActivityCategory(
          input.activityCategory,
          'dashboard',
        ),
        activityLabel: this.normalizeActivityLabel(
          input.activityLabel,
          'Account activity',
        ),
        severity: input.severity || 'info',
        details: this.sanitizeDetails(input.details),
        pagePath: this.normalizePagePath(input.pagePath),
        ...requestContext,
      });
      this.feed$.next(saved);
      return saved;
    } catch (error) {
      this.logger.warn(
        `Unable to capture activity log: ${
          error instanceof Error ? error.message : 'Unknown activity error'
        }`,
      );
      return null;
    }
  }

  private async persistActivity(
    input: ResolvedActivityInput,
  ): Promise<UserActivityLog> {
    const pool = await this.requirePool();

    if (!pool) {
      const activity: UserActivityLog = {
        id: randomUUID(),
        userId: input.userId,
        userName: input.userName,
        userEmail: input.userEmail,
        userUsername: input.userUsername,
        activityType: input.activityType,
        activityCategory: input.activityCategory,
        activityLabel: input.activityLabel,
        severity: input.severity,
        details: input.details,
        ipAddress: input.ipAddress,
        city: input.city,
        country: input.country,
        userAgent: input.userAgent,
        deviceType: input.deviceType,
        browser: input.browser,
        platform: input.platform,
        pagePath: input.pagePath,
        reviewedState: input.reviewedState || 'new',
        reviewedAt: input.reviewedAt || null,
        reviewedBy: input.reviewedBy || null,
        adminAction: input.adminAction || null,
        adminNote: input.adminNote || null,
        createdAt: input.createdAt || new Date().toISOString(),
      };
      this.memoryLogs.unshift(activity);
      this.memoryLogs.splice(600);
      return activity;
    }

    const result = await pool.query<ActivityLogRow>(
      `INSERT INTO user_activity_logs (
        id,
        user_id,
        user_name,
        user_email,
        user_username,
        activity_type,
        activity_category,
        activity_label,
        severity,
        details,
        ip_address,
        city,
        country,
        user_agent,
        device_type,
        browser,
        platform,
        page_path,
        reviewed_state,
        reviewed_at,
        reviewed_by,
        admin_action,
        admin_note,
        created_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
      )
      RETURNING
        id,
        user_id,
        user_name,
        user_email,
        user_username,
        activity_type,
        activity_category,
        activity_label,
        severity,
        details,
        ip_address,
        city,
        country,
        user_agent,
        device_type,
        browser,
        platform,
        page_path,
        reviewed_state,
        reviewed_at,
        reviewed_by,
        admin_action,
        admin_note,
        created_at`,
      [
        randomUUID(),
        input.userId,
        input.userName,
        input.userEmail,
        input.userUsername,
        input.activityType,
        input.activityCategory,
        input.activityLabel,
        input.severity,
        JSON.stringify(input.details || {}),
        input.ipAddress,
        input.city,
        input.country,
        input.userAgent,
        input.deviceType,
        input.browser,
        input.platform,
        input.pagePath,
        input.reviewedState || 'new',
        input.reviewedAt || null,
        input.reviewedBy || null,
        input.adminAction || null,
        input.adminNote || null,
        input.createdAt || new Date().toISOString(),
      ],
    );

    return this.toActivityLog(result.rows[0]);
  }

  private async listActivities(
    filters: ActivityFeedFilters,
  ): Promise<UserActivityLog[]> {
    const pool = await this.requirePool();
    if (!pool) {
      return this.memoryLogs
        .filter((entry) => this.matchesFilters(entry, filters))
        .slice(0, filters.limit);
    }

    const values: unknown[] = [];
    const where: string[] = [];

    if (filters.from) {
      values.push(filters.from);
      where.push(`created_at >= $${values.length}`);
    } else {
      values.push(new Date(Date.now() - filters.hours * 60 * 60 * 1000).toISOString());
      where.push(`created_at >= $${values.length}`);
    }

    if (filters.to) {
      values.push(filters.to);
      where.push(`created_at <= $${values.length}`);
    }

    if (filters.userId) {
      values.push(filters.userId);
      where.push(`user_id = $${values.length}`);
    }

    if (filters.activityType) {
      values.push(filters.activityType);
      where.push(`activity_type = $${values.length}`);
    }

    if (filters.reviewState !== 'all') {
      values.push(filters.reviewState);
      where.push(`reviewed_state = $${values.length}`);
    }

    if (filters.search) {
      values.push(`%${filters.search.toLowerCase()}%`);
      where.push(
        `(LOWER(COALESCE(user_name, '')) LIKE $${values.length}
          OR LOWER(COALESCE(user_email, '')) LIKE $${values.length}
          OR LOWER(COALESCE(user_username, '')) LIKE $${values.length}
          OR LOWER(COALESCE(activity_label, '')) LIKE $${values.length})`,
      );
    }

    values.push(filters.limit);
    const result = await pool.query<ActivityLogRow>(
      `SELECT
        id,
        user_id,
        user_name,
        user_email,
        user_username,
        activity_type,
        activity_category,
        activity_label,
        severity,
        details,
        ip_address,
        city,
        country,
        user_agent,
        device_type,
        browser,
        platform,
        page_path,
        reviewed_state,
        reviewed_at,
        reviewed_by,
        admin_action,
        admin_note,
        created_at
       FROM user_activity_logs
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC
       LIMIT $${values.length}`,
      values,
    );

    return result.rows.map((row) => this.toActivityLog(row));
  }

  private matchesFilters(entry: UserActivityLog, filters: ActivityFeedFilters) {
    const createdAtMs = Date.parse(entry.createdAt);
    const fromMs = filters.from
      ? Date.parse(filters.from)
      : Date.now() - filters.hours * 60 * 60 * 1000;
    const toMs = filters.to ? Date.parse(filters.to) : Infinity;

    if (Number.isFinite(fromMs) && createdAtMs < fromMs) {
      return false;
    }

    if (Number.isFinite(toMs) && createdAtMs > toMs) {
      return false;
    }

    if (filters.userId && entry.userId !== filters.userId) {
      return false;
    }

    if (filters.activityType && entry.activityType !== filters.activityType) {
      return false;
    }

    if (filters.reviewState !== 'all' && entry.reviewedState !== filters.reviewState) {
      return false;
    }

    if (filters.search) {
      const haystack = [
        entry.userName,
        entry.userEmail,
        entry.userUsername,
        entry.activityLabel,
      ]
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(filters.search.toLowerCase())) {
        return false;
      }
    }

    return true;
  }

  private buildStats(activities: UserActivityLog[]): ActivityFeedStats {
    return {
      total: activities.length,
      logins: activities.filter((entry) => entry.activityCategory === 'login').length,
      security: activities.filter((entry) => entry.activityCategory === 'security').length,
      investments: activities.filter((entry) => entry.activityCategory === 'investment').length,
      interactions: activities.filter((entry) => entry.activityCategory === 'dashboard').length,
      flagged: activities.filter((entry) => entry.reviewedState === 'flagged').length,
      critical: activities.filter((entry) => entry.severity === 'critical').length,
    };
  }

  private buildAlerts(activities: UserActivityLog[]): ActivityFeedAlert[] {
    return activities
      .filter(
        (entry) =>
          entry.reviewedState !== 'reviewed' &&
          (entry.severity === 'critical' ||
            entry.reviewedState === 'flagged' ||
            entry.activityType === 'login_failed'),
      )
      .slice(0, 6)
      .map((entry) => ({
        id: entry.id,
        title: entry.activityLabel,
        copy:
          entry.severity === 'critical'
            ? 'Critical activity recorded and awaiting review.'
            : entry.reviewedState === 'flagged'
              ? 'Flagged activity requires follow-up.'
              : 'Failed sign-in activity detected.',
        severity: entry.severity,
        createdAt: entry.createdAt,
        userLabel:
          entry.userName || entry.userUsername || entry.userEmail || 'Unknown user',
      }));
  }

  private normalizeFeedFilters(query: Record<string, unknown>): ActivityFeedFilters {
    const parsedHours = Number(query.hours);
    const hours =
      Number.isFinite(parsedHours) && parsedHours > 0
        ? Math.min(Math.max(Math.round(parsedHours), 1), 720)
        : 24;
    const parsedLimit = Number(query.limit);
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(Math.max(Math.round(parsedLimit), 1), 300)
        : 120;

    return {
      hours,
      from: this.normalizeDateFilter(query.from),
      to: this.normalizeDateFilter(query.to),
      userId: this.normalizeOptionalString(query.userId),
      activityType: this.normalizeOptionalString(query.activityType),
      reviewState: this.normalizeOptionalReviewState(query.reviewState),
      search: this.normalizeOptionalString(query.search),
      limit,
    };
  }

  private normalizeOptionalReviewState(
    value: unknown,
  ): ActivityReviewState | 'all' {
    if (value === 'new' || value === 'reviewed' || value === 'flagged' || value === 'actioned') {
      return value;
    }

    return 'all';
  }

  private normalizeReviewState(value: unknown): ActivityReviewState {
    if (value === 'reviewed' || value === 'flagged' || value === 'actioned') {
      return value;
    }

    return 'reviewed';
  }

  private normalizeSeverity(value: unknown): ActivitySeverity {
    if (value === 'warning' || value === 'critical') {
      return value;
    }

    return 'info';
  }

  private normalizeOptionalAction(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
    return normalized || null;
  }

  private normalizeOptionalNote(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized ? normalized.slice(0, 500) : null;
  }

  private normalizeDateFilter(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    const parsed = Date.parse(value.trim());
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return new Date(parsed).toISOString();
  }

  private normalizeOptionalString(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private normalizeActivityToken(value: unknown, fallback: string) {
    const normalized =
      typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z0-9_:-]/g, '_') : '';
    return normalized || fallback;
  }

  private normalizeActivityCategory(value: unknown, fallback: string) {
    const normalized =
      typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') : '';
    return normalized || fallback;
  }

  private normalizeActivityLabel(value: unknown, fallback: string) {
    if (typeof value !== 'string') {
      return fallback;
    }

    const normalized = value.trim();
    return normalized ? normalized.slice(0, 120) : fallback;
  }

  private normalizePagePath(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized ? normalized.slice(0, 180) : null;
  }

  private defaultCategoryForType(type: string) {
    if (type.startsWith('login')) {
      return 'login';
    }

    if (
      type.includes('password') ||
      type.includes('security') ||
      type.includes('verify') ||
      type.includes('kyc') ||
      type.includes('account_status')
    ) {
      return 'security';
    }

    if (
      type.includes('deposit') ||
      type.includes('withdrawal') ||
      type.includes('plan') ||
      type.includes('investment')
    ) {
      return 'investment';
    }

    if (type.includes('profile') || type.includes('settings')) {
      return 'profile';
    }

    return 'dashboard';
  }

  private sanitizeDetails(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    const entries = Object.entries(value as Record<string, unknown>).slice(0, 20);
    const sanitized: Record<string, unknown> = {};
    for (const [key, entryValue] of entries) {
      const safeKey = String(key).trim().slice(0, 60);
      if (!safeKey) {
        continue;
      }

      if (
        typeof entryValue === 'string' ||
        typeof entryValue === 'number' ||
        typeof entryValue === 'boolean' ||
        entryValue === null
      ) {
        sanitized[safeKey] =
          typeof entryValue === 'string' ? entryValue.slice(0, 500) : entryValue;
        continue;
      }

      try {
        sanitized[safeKey] = JSON.parse(
          JSON.stringify(entryValue, (_key, nestedValue) => {
            if (typeof nestedValue === 'string') {
              return nestedValue.slice(0, 240);
            }

            if (
              typeof nestedValue === 'number' ||
              typeof nestedValue === 'boolean' ||
              nestedValue === null
            ) {
              return nestedValue;
            }

            return nestedValue;
          }),
        );
      } catch {
        sanitized[safeKey] = '[unserializable]';
      }
    }

    return sanitized;
  }

  private async resolveRequestContext(request: Request) {
    const ipAddress = this.normalizeIp(getClientIp(request));
    const geo = await this.lookupGeo(ipAddress);
    const device = this.parseDeviceInfo(
      typeof request.headers['user-agent'] === 'string'
        ? request.headers['user-agent']
        : Array.isArray(request.headers['user-agent'])
          ? request.headers['user-agent'][0]
          : null,
    );

    return {
      ipAddress,
      city: geo.city,
      country: geo.country,
      userAgent: device.userAgent,
      deviceType: device.deviceType,
      browser: device.browser,
      platform: device.platform,
    };
  }

  private normalizeIp(value: string) {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return 'unknown';
    }

    return normalized.replace(/^::ffff:/i, '');
  }

  private async lookupGeo(ipAddress: string): Promise<GeoLookupResult> {
    if (!ipAddress || ipAddress === 'unknown') {
      return {
        city: null,
        country: null,
      };
    }

    if (this.isPrivateOrLocalIp(ipAddress)) {
      return {
        city: 'Localhost',
        country: 'Development',
      };
    }

    const cached = this.geoCache.get(ipAddress);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        city: cached.city,
        country: cached.country,
      };
    }

    if (process.env.IP_GEOLOOKUP_ENABLED === 'false') {
      return {
        city: null,
        country: null,
      };
    }

    const template =
      typeof process.env.IP_GEOLOOKUP_URL === 'string' &&
      process.env.IP_GEOLOOKUP_URL.trim()
        ? process.env.IP_GEOLOOKUP_URL.trim()
        : 'https://ipwho.is/{ip}';
    const url = template.includes('{ip}')
      ? template.replace('{ip}', encodeURIComponent(ipAddress))
      : `${template.replace(/\/+$/, '')}/${encodeURIComponent(ipAddress)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });
      const data = (await response.json()) as Record<string, unknown>;
      const result = {
        city:
          typeof data.city === 'string' && data.city.trim()
            ? data.city.trim()
            : null,
        country:
          typeof data.country === 'string' && data.country.trim()
            ? data.country.trim()
            : typeof data.country_name === 'string' && data.country_name.trim()
              ? data.country_name.trim()
              : null,
      };
      this.geoCache.set(ipAddress, {
        ...result,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });
      return result;
    } catch {
      return {
        city: null,
        country: null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private isPrivateOrLocalIp(ipAddress: string) {
    return (
      ipAddress === '127.0.0.1' ||
      ipAddress === '::1' ||
      ipAddress === 'localhost' ||
      /^10\./.test(ipAddress) ||
      /^192\.168\./.test(ipAddress) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(ipAddress)
    );
  }

  private parseDeviceInfo(userAgent: string | null) {
    const value = userAgent || '';
    const lower = value.toLowerCase();

    const browser = lower.includes('edg/')
      ? 'Edge'
      : lower.includes('chrome/')
        ? 'Chrome'
        : lower.includes('safari/') && !lower.includes('chrome/')
          ? 'Safari'
          : lower.includes('firefox/')
            ? 'Firefox'
            : lower.includes('opr/')
              ? 'Opera'
              : 'Unknown';

    const platform = lower.includes('windows')
      ? 'Windows'
      : lower.includes('android')
        ? 'Android'
        : lower.includes('iphone') || lower.includes('ipad') || lower.includes('ios')
          ? 'iOS'
          : lower.includes('mac os') || lower.includes('macintosh')
            ? 'macOS'
            : lower.includes('linux')
              ? 'Linux'
              : 'Unknown';

    const deviceType = lower.includes('ipad') || lower.includes('tablet')
      ? 'Tablet'
      : lower.includes('mobile') || lower.includes('iphone') || lower.includes('android')
        ? 'Mobile'
        : 'Desktop';

    return {
      userAgent: value || null,
      browser,
      platform,
      deviceType,
    };
  }

  private toActivityLog(row: ActivityLogRow): UserActivityLog {
    return {
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      userEmail: row.user_email,
      userUsername: row.user_username,
      activityType: row.activity_type,
      activityCategory: row.activity_category,
      activityLabel: row.activity_label,
      severity:
        row.severity === 'warning' || row.severity === 'critical'
          ? row.severity
          : 'info',
      details:
        row.details && typeof row.details === 'object'
          ? row.details
          : {},
      ipAddress: row.ip_address,
      city: row.city,
      country: row.country,
      userAgent: row.user_agent,
      deviceType: row.device_type,
      browser: row.browser,
      platform: row.platform,
      pagePath: row.page_path,
      reviewedState:
        row.reviewed_state === 'reviewed' ||
        row.reviewed_state === 'flagged' ||
        row.reviewed_state === 'actioned'
          ? row.reviewed_state
          : 'new',
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
      reviewedBy: row.reviewed_by,
      adminAction: row.admin_action,
      adminNote: row.admin_note,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private async requireAdmin(sessionToken: string | null): Promise<PublicUser> {
    if (!sessionToken) {
      throw new UnauthorizedException('Admin sign in is required.');
    }

    try {
      const user = await this.store.getUserBySessionToken(sessionToken);
      if (!user || user.role !== 'admin' || user.accountStatus !== 'active') {
        throw new UnauthorizedException('Admin sign in is required.');
      }

      return user;
    } catch (error) {
      throw this.toServiceError(error, 'Admin sign in is required.');
    }
  }

  private async requireInvestor(sessionToken: string | null): Promise<PublicUser> {
    if (!sessionToken) {
      throw new UnauthorizedException('Sign in is required.');
    }

    try {
      const user = await this.store.getUserBySessionToken(sessionToken);
      if (!user || user.role === 'admin' || user.accountStatus !== 'active') {
        throw new UnauthorizedException('Sign in is required.');
      }

      return user;
    } catch (error) {
      throw this.toServiceError(error, 'Sign in is required.');
    }
  }

  private isDatabaseConfigured() {
    return typeof process.env.DATABASE_URL === 'string'
      && process.env.DATABASE_URL.trim().length > 0;
  }

  private buildPoolConfig(databaseUrl: string): PoolConfig {
    const sslMode = (process.env.DATABASE_SSL ?? '').trim().toLowerCase();

    return {
      connectionString: databaseUrl,
      ssl:
        sslMode === 'true'
          ? {
              rejectUnauthorized: false,
            }
          : undefined,
    };
  }

  private async requirePool(): Promise<Pool | null> {
    if (!this.isDatabaseConfigured()) {
      return null;
    }

    if (!this.pool) {
      const databaseUrl = String(process.env.DATABASE_URL || '').trim();
      if (!databaseUrl) {
        return null;
      }

      try {
        this.pool = new Pool(this.buildPoolConfig(databaseUrl));
        await this.pool.query('SELECT 1');
      } catch (error) {
        this.pool = null;
        throw this.toServiceError(
          error,
          'Activity monitoring database connection is unavailable.',
        );
      }
    }

    await this.ensureSchema();
    return this.pool;
  }

  private async ensureSchema() {
    if (this.schemaReady || !this.pool) {
      return;
    }

    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_activity_logs (
          id UUID PRIMARY KEY,
          user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
          user_name TEXT,
          user_email TEXT,
          user_username TEXT,
          activity_type TEXT NOT NULL,
          activity_category TEXT NOT NULL,
          activity_label TEXT NOT NULL,
          severity TEXT NOT NULL DEFAULT 'info',
          details JSONB NOT NULL DEFAULT '{}'::jsonb,
          ip_address TEXT,
          city TEXT,
          country TEXT,
          user_agent TEXT,
          device_type TEXT,
          browser TEXT,
          platform TEXT,
          page_path TEXT,
          reviewed_state TEXT NOT NULL DEFAULT 'new',
          reviewed_at TIMESTAMPTZ,
          reviewed_by TEXT,
          admin_action TEXT,
          admin_note TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at
        ON user_activity_logs (created_at DESC);
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id
        ON user_activity_logs (user_id);
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_activity_logs_activity_type
        ON user_activity_logs (activity_type);
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_activity_logs_reviewed_state
        ON user_activity_logs (reviewed_state);
      `);
      this.schemaReady = true;
    } catch (error) {
      throw this.toServiceError(
        error,
        'Unable to prepare the activity monitoring database schema.',
      );
    }
  }

  private toServiceError(error: unknown, fallbackMessage: string) {
    if (
      error instanceof BadRequestException ||
      error instanceof UnauthorizedException ||
      error instanceof ServiceUnavailableException
    ) {
      return error;
    }

    if (error instanceof PlatformStoreUnavailableError) {
      return new ServiceUnavailableException(error.message);
    }

    if (error instanceof Error && error.message.trim()) {
      return new ServiceUnavailableException(error.message);
    }

    return new ServiceUnavailableException(fallbackMessage);
  }
}

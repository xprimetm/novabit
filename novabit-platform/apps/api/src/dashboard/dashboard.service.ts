import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { loadApiEnv } from '../config/load-env';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { PlatformStoreConflictError } from '../platform-store/platform-store.errors';
import { PlatformStoreUnavailableError } from '../platform-store/platform-store.errors';
import { PlatformStoreService } from '../platform-store/platform-store.service';
import type {
  AdminUserAccountAction,
  AdminUserProfile,
  CelebrityCoupon,
  CelebrityCouponStatus,
  CreateCelebrityCouponInput,
  CreatePaymentSubmissionInput,
  CreateKycSubmissionInput,
  CreateWithdrawalSubmissionInput,
  DashboardAccount,
  DashboardStatementEntry,
  KycDocumentType,
  KycSubmission,
  KycSubmissionStatus,
  PaymentSubmission,
  PaymentSubmissionMethod,
  PaymentSubmissionStatus,
  PlatformStoreDriver,
  PublicUser,
  WithdrawalSubmission,
  WithdrawalSubmissionMethod,
  WithdrawalSubmissionStatus,
} from '../platform-store/platform-store.types';

export type DashboardResponse = {
  authenticated: true;
  user: PublicUser;
  sessionMode: PlatformStoreDriver;
  dashboard: DashboardAccount;
  paymentSubmissions: PaymentSubmission[];
  withdrawalSubmissions: WithdrawalSubmission[];
  kycSubmissions: KycSubmission[];
};

export type AdminPaymentQueueResponse = {
  authorized: true;
  submissions: PaymentSubmission[];
  summary: {
    total: number;
    pending: number;
    approved: number;
    cancelled: number;
    rejected: number;
  };
};

export type AdminWithdrawalQueueResponse = {
  authorized: true;
  submissions: WithdrawalSubmission[];
  summary: {
    total: number;
    pending: number;
    approved: number;
    cancelled: number;
    rejected: number;
  };
};

export type AdminKycQueueResponse = {
  authorized: true;
  submissions: KycSubmission[];
  summary: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
};

export type AdminUsersResponse = {
  authorized: true;
  users: AdminUserProfile[];
  summary: {
    total: number;
    investors: number;
    verified: number;
    unverified: number;
    pending: number;
    rejected: number;
  };
};

export type AdminCelebrityCouponsResponse = {
  authorized: true;
  coupons: CelebrityCoupon[];
  summary: {
    total: number;
    active: number;
    inactive: number;
    redeemable: number;
    expired: number;
    redemptions: number;
  };
};

export type CreatePaymentSubmissionPayload = {
  planKey?: unknown;
  planName?: unknown;
  fundingMethod?: unknown;
  amount?: unknown;
  assetKey?: unknown;
  assetSymbol?: unknown;
  assetName?: unknown;
  network?: unknown;
  routeAddress?: unknown;
  proofImageDataUrl?: unknown;
  proofFileName?: unknown;
  proofMimeType?: unknown;
  proofNote?: unknown;
};

export type CreateWithdrawalSubmissionPayload = {
  withdrawalMethod?: unknown;
  amount?: unknown;
  assetKey?: unknown;
  assetSymbol?: unknown;
  assetName?: unknown;
  network?: unknown;
  walletAddress?: unknown;
  walletLabel?: unknown;
  bankHolder?: unknown;
  bankName?: unknown;
  bankRouting?: unknown;
  bankAccount?: unknown;
  bankCountry?: unknown;
  wireBeneficiary?: unknown;
  wireBankName?: unknown;
  wireSwift?: unknown;
  wireIban?: unknown;
  wireCountry?: unknown;
  wireNote?: unknown;
};

export type CreateKycSubmissionPayload = {
  email?: unknown;
  phone?: unknown;
  firstName?: unknown;
  middleName?: unknown;
  lastName?: unknown;
  countryOfOrigin?: unknown;
  documentType?: unknown;
  documentImageDataUrl?: unknown;
  documentFileName?: unknown;
  documentMimeType?: unknown;
};

export type CreateCelebrityCouponPayload = {
  celebrityName?: unknown;
  couponCode?: unknown;
  offerDetails?: unknown;
  status?: unknown;
  expiresAt?: unknown;
  maxRedemptions?: unknown;
};

export type ManageAdminUserPayload = {
  action?: unknown;
};

export type AdminUserAccountActionResponse =
  | {
      authorized: true;
      action: AdminUserAccountAction;
      updated: true;
      user: AdminUserProfile;
    }
  | {
      authorized: true;
      action: 'delete';
      deleted: true;
      userId: string;
    };

export type PublicInvestmentPlan = {
  key: string;
  name: string;
  badge: string;
  deck: string;
  summary: string;
  description: string;
  minimum: number;
  cycleDays: number;
  returnRate: number;
  returnLabel: string;
  durationOptionsDays: number[];
  features: string[];
  benefits: string[];
};

export type PublicInvestmentPlansResponse = {
  available: true;
  featuredPlanKey: string;
  updatedAt: string;
  plans: PublicInvestmentPlan[];
};

export type ReviewPaymentSubmissionPayload = {
  status?: unknown;
  reviewNote?: unknown;
};

export type ReviewWithdrawalSubmissionPayload = ReviewPaymentSubmissionPayload;

export type ReviewKycSubmissionPayload = {
  status?: unknown;
  reviewNote?: unknown;
};

const PUBLIC_INVESTMENT_PLAN_CATALOG: PublicInvestmentPlan[] = [
  {
    key: 'starter',
    name: 'Starter Plan',
    badge: 'Entry Tier',
    deck: '20% projected return every 30 days.',
    summary:
      'Built for first-time investors who want a lighter starting threshold and a clean monthly cycle.',
    description:
      'The starter tier keeps the barrier low while preserving the same structured monthly plan workflow used across the platform.',
    minimum: 500,
    cycleDays: 30,
    returnRate: 0.2,
    returnLabel: '20% every 30 days',
    durationOptionsDays: [30, 60, 90, 180],
    features: [
      'Lower entry capital for a first live allocation.',
      '30-day cycle with daily interest visibility.',
      'Dashboard and email updates for each activity.',
    ],
    benefits: [
      'Best fit for a cautious first funding move.',
      'Simple monthly cycle with clear minimum guidance.',
    ],
  },
  {
    key: 'growth',
    name: 'Growth Plan',
    badge: 'Most Selected',
    deck: '30% projected return every 30 days.',
    summary:
      'Designed for users who want a stronger upside profile while keeping the capital range practical.',
    description:
      'This is the core Novabit tier for users moving beyond entry level and looking for a cleaner balance of size, return, and flexibility.',
    minimum: 2000,
    cycleDays: 30,
    returnRate: 0.3,
    returnLabel: '30% every 30 days',
    durationOptionsDays: [30, 60, 90, 180],
    features: [
      'Balanced capital threshold for serious participation.',
      'Higher monthly return profile than the starter tier.',
      'Strong fit for users building a repeat funding routine.',
    ],
    benefits: [
      'Most aligned with the default dashboard plan flow.',
      'Clear middle ground between accessibility and upside.',
    ],
  },
  {
    key: 'premium',
    name: 'Premium Plan',
    badge: 'Priority Tier',
    deck: '45% projected return every 30 days.',
    summary:
      'Built for larger balances, stronger conviction, and a higher-return position inside the same structured cycle.',
    description:
      'Premium is the top public plan tier for investors who want larger capital deployment with priority-style handling across the funding lifecycle.',
    minimum: 5000,
    cycleDays: 30,
    returnRate: 0.45,
    returnLabel: '45% every 30 days',
    durationOptionsDays: [30, 60, 90, 180],
    features: [
      'Higher-conviction monthly return positioning.',
      'Premium tier suited to larger capital allocations.',
      'Priority-oriented funding workflow once capital is ready.',
    ],
    benefits: [
      'Best fit for experienced investors with larger balances.',
      'Strongest monthly upside in the current public lineup.',
    ],
  },
];

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly store: PlatformStoreService,
    private readonly emailNotifications: EmailNotificationService,
  ) {
    loadApiEnv();
  }

  async getDashboard(sessionToken: string | null): Promise<DashboardResponse> {
    try {
      const user = await this.requireUser(sessionToken);
      const [
        sessionMode,
        dashboard,
        paymentSubmissions,
        withdrawalSubmissions,
        kycSubmissions,
      ] = await Promise.all([
        this.store.getResolvedDriver(),
        this.store.getDashboardAccount(user.id),
        this.store.listPaymentSubmissionsForUser(user.id),
        this.store.listWithdrawalSubmissionsForUser(user.id),
        this.store.listKycSubmissionsForUser(user.id),
      ]);
      void this.dispatchPendingDailyInterestEmails(user);

      return {
        authenticated: true,
        user,
        sessionMode,
        dashboard,
        paymentSubmissions,
        withdrawalSubmissions,
        kycSubmissions,
      };
    } catch (error) {
      if (error instanceof PlatformStoreConflictError) {
        throw new ConflictException(error.message);
      }

      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async getPublicInvestmentPlans(): Promise<PublicInvestmentPlansResponse> {
    return {
      available: true,
      featuredPlanKey: 'growth',
      updatedAt: new Date().toISOString(),
      plans: PUBLIC_INVESTMENT_PLAN_CATALOG.map((plan) => ({
        ...plan,
        durationOptionsDays: [...plan.durationOptionsDays],
        features: [...plan.features],
        benefits: [...plan.benefits],
      })),
    };
  }

  async createPaymentSubmission(
    sessionToken: string | null,
    payload: CreatePaymentSubmissionPayload,
  ): Promise<{ submitted: true; submission: PaymentSubmission }> {
    try {
      const user = await this.requireUser(sessionToken);
      const input = this.normalizePaymentSubmissionPayload(user, payload);
      const submission = await this.store.createPaymentSubmission(input);
      const availableBalance = await this.readAvailableBalance(user.id);
      void this.emailNotifications.sendDepositSubmitted(user, {
        reference: submission.reference,
        planName: submission.planName,
        amount: submission.amount,
        availableBalance,
      });

      return {
        submitted: true,
        submission,
      };
    } catch (error) {
      if (error instanceof PlatformStoreConflictError) {
        throw new ConflictException(error.message);
      }

      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async createWithdrawalSubmission(
    sessionToken: string | null,
    payload: CreateWithdrawalSubmissionPayload,
  ): Promise<{ submitted: true; submission: WithdrawalSubmission }> {
    try {
      const user = await this.requireUser(sessionToken);
      const input = this.normalizeWithdrawalSubmissionPayload(user, payload);
      const submission = await this.store.createWithdrawalSubmission(input);
      const availableBalance = await this.readAvailableBalance(user.id);
      void this.emailNotifications.sendWithdrawalSubmitted(user, {
        reference: submission.reference,
        amount: submission.amount,
        netAmount: submission.netAmount,
        availableBalance,
      });

      return {
        submitted: true,
        submission,
      };
    } catch (error) {
      if (error instanceof PlatformStoreConflictError) {
        throw new ConflictException(error.message);
      }

      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async createKycSubmission(
    sessionToken: string | null,
    payload: CreateKycSubmissionPayload,
  ): Promise<{ submitted: true; submission: KycSubmission }> {
    try {
      const user = await this.requireUser(sessionToken);
      const input = this.normalizeKycSubmissionPayload(user, payload);
      const submission = await this.store.createKycSubmission(input);
      void this.emailNotifications.sendKycSubmitted(user, submission.reference);

      return {
        submitted: true,
        submission,
      };
    } catch (error) {
      if (error instanceof PlatformStoreConflictError) {
        throw new ConflictException(error.message);
      }

      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async getAdminPaymentQueue(
    sessionToken: string | null,
  ): Promise<AdminPaymentQueueResponse> {
    await this.requireAdmin(sessionToken);

    try {
      const submissions = await this.store.listPaymentSubmissions();
      return {
        authorized: true,
        submissions,
        summary: {
          total: submissions.length,
          pending: submissions.filter((item) => item.status === 'pending').length,
          approved: submissions.filter((item) => item.status === 'approved')
            .length,
          cancelled: submissions.filter((item) => item.status === 'cancelled')
            .length,
          rejected: submissions.filter((item) => item.status === 'rejected')
            .length,
        },
      };
    } catch (error) {
      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async getAdminWithdrawalQueue(
    sessionToken: string | null,
  ): Promise<AdminWithdrawalQueueResponse> {
    await this.requireAdmin(sessionToken);

    try {
      const submissions = await this.store.listWithdrawalSubmissions();
      return {
        authorized: true,
        submissions,
        summary: this.buildSubmissionSummary(submissions),
      };
    } catch (error) {
      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async getAdminKycQueue(
    sessionToken: string | null,
  ): Promise<AdminKycQueueResponse> {
    await this.requireAdmin(sessionToken);

    try {
      const submissions = await this.store.listKycSubmissions();
      return {
        authorized: true,
        submissions,
        summary: this.buildKycSubmissionSummary(submissions),
      };
    } catch (error) {
      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async getAdminUsers(sessionToken: string | null): Promise<AdminUsersResponse> {
    await this.requireAdmin(sessionToken);

    try {
      const users = await this.store.listAdminUsers();
      return {
        authorized: true,
        users,
        summary: {
          total: users.length,
          investors: users.filter((user) => user.isInvestor).length,
          verified: users.filter(
            (user) => user.verificationStatus === 'verified',
          ).length,
          unverified: users.filter(
            (user) => user.verificationStatus === 'unverified',
          ).length,
          pending: users.filter((user) => user.verificationStatus === 'pending')
            .length,
          rejected: users.filter(
            (user) => user.verificationStatus === 'rejected',
          ).length,
        },
      };
    } catch (error) {
      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async manageAdminUser(
    sessionToken: string | null,
    userId: string,
    payload: ManageAdminUserPayload,
  ): Promise<AdminUserAccountActionResponse> {
    await this.requireAdmin(sessionToken);

    const trimmedUserId = userId.trim();
    if (!trimmedUserId) {
      throw new BadRequestException('A valid user account is required.');
    }

    try {
      const action = this.normalizeAdminUserAction(payload.action);

      if (action === 'delete') {
        await this.store.deleteUserAccount(trimmedUserId);
        return {
          authorized: true,
          action,
          deleted: true,
          userId: trimmedUserId,
        };
      }

      const status =
        action === 'activate'
          ? 'active'
          : action === 'suspend'
            ? 'suspended'
            : 'deactivated';
      const user = await this.store.updateUserAccountStatus(trimmedUserId, status);
      return {
        authorized: true,
        action,
        updated: true,
        user,
      };
    } catch (error) {
      if (error instanceof PlatformStoreConflictError) {
        throw new ConflictException(error.message);
      }

      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async getAdminCelebrityCoupons(
    sessionToken: string | null,
  ): Promise<AdminCelebrityCouponsResponse> {
    await this.requireAdmin(sessionToken);

    try {
      const coupons = await this.store.listCelebrityCoupons();
      return {
        authorized: true,
        coupons,
        summary: this.buildCelebrityCouponSummary(coupons),
      };
    } catch (error) {
      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async createCelebrityCoupon(
    sessionToken: string | null,
    payload: CreateCelebrityCouponPayload,
  ): Promise<{ created: true; coupon: CelebrityCoupon }> {
    const adminUser = await this.requireAdmin(sessionToken);

    try {
      const coupon = await this.store.createCelebrityCoupon(
        this.normalizeCelebrityCouponPayload(adminUser, payload),
      );

      return {
        created: true,
        coupon,
      };
    } catch (error) {
      if (error instanceof PlatformStoreConflictError) {
        throw new ConflictException(error.message);
      }

      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async reviewPaymentSubmission(
    sessionToken: string | null,
    submissionId: string,
    payload: ReviewPaymentSubmissionPayload,
  ): Promise<{ reviewed: true; submission: PaymentSubmission }> {
    const adminUser = await this.requireAdmin(sessionToken);

    try {
      const status = this.normalizeReviewStatus(payload.status);
      const submission = await this.store.reviewPaymentSubmission({
        id: submissionId.trim(),
        status,
        reviewedBy: adminUser.name || adminUser.username || 'Admin Console',
        reviewNote:
          typeof payload.reviewNote === 'string'
            ? payload.reviewNote.trim()
            : null,
      });
      const availableBalance = await this.readAvailableBalance(submission.userId);
      void this.emailNotifications.sendDepositReviewUpdate(
        {
          email: submission.userEmail,
          name: submission.userName,
          username: submission.userUsername || submission.userEmail,
        },
        {
          reference: submission.reference,
          status: submission.status,
          amount: submission.amount,
          reviewNote: submission.reviewNote,
          availableBalance,
        },
      );

      return {
        reviewed: true,
        submission,
      };
    } catch (error) {
      if (error instanceof PlatformStoreConflictError) {
        throw new ConflictException(error.message);
      }

      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async reviewWithdrawalSubmission(
    sessionToken: string | null,
    submissionId: string,
    payload: ReviewWithdrawalSubmissionPayload,
  ): Promise<{ reviewed: true; submission: WithdrawalSubmission }> {
    const adminUser = await this.requireAdmin(sessionToken);

    try {
      const status = this.normalizeWithdrawalReviewStatus(payload.status);
      const submission = await this.store.reviewWithdrawalSubmission({
        id: submissionId.trim(),
        status,
        reviewedBy: adminUser.name || adminUser.username || 'Admin Console',
        reviewNote:
          typeof payload.reviewNote === 'string'
            ? payload.reviewNote.trim()
            : null,
      });
      const availableBalance = await this.readAvailableBalance(submission.userId);
      void this.emailNotifications.sendWithdrawalReviewUpdate(
        {
          email: submission.userEmail,
          name: submission.userName,
          username: submission.userUsername || submission.userEmail,
        },
        {
          reference: submission.reference,
          status: submission.status,
          amount: submission.amount,
          netAmount: submission.netAmount,
          reviewNote: submission.reviewNote,
          availableBalance,
        },
      );

      return {
        reviewed: true,
        submission,
      };
    } catch (error) {
      if (error instanceof PlatformStoreConflictError) {
        throw new ConflictException(error.message);
      }

      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async reviewKycSubmission(
    sessionToken: string | null,
    submissionId: string,
    payload: ReviewKycSubmissionPayload,
  ): Promise<{ reviewed: true; submission: KycSubmission }> {
    const adminUser = await this.requireAdmin(sessionToken);

    try {
      const status = this.normalizeKycReviewStatus(payload.status);
      const submission = await this.store.reviewKycSubmission({
        id: submissionId.trim(),
        status,
        reviewedBy: adminUser.name || adminUser.username || 'Admin Console',
        reviewNote:
          typeof payload.reviewNote === 'string'
            ? payload.reviewNote.trim()
            : null,
      });
      void this.emailNotifications.sendKycReviewUpdate(
        {
          email: submission.userEmail,
          name: submission.userName,
          username: submission.userUsername || submission.userEmail,
        },
        status,
        submission.reference,
        submission.reviewNote,
      );

      return {
        reviewed: true,
        submission,
      };
    } catch (error) {
      if (error instanceof PlatformStoreConflictError) {
        throw new ConflictException(error.message);
      }

      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  private async readAvailableBalance(userId: string): Promise<number> {
    try {
      const dashboard = await this.store.getDashboardAccount(userId);
      return Number(dashboard.accountBalance) || 0;
    } catch (error) {
      this.logger.warn(
        `Unable to read dashboard balance for ${userId}: ${
          error instanceof Error ? error.message : 'Unknown store error'
        }`,
      );
      return 0;
    }
  }

  private async dispatchPendingDailyInterestEmails(
    user: Pick<PublicUser, 'id' | 'email' | 'name' | 'username'>,
  ) {
    try {
      const dispatch = await this.store.claimPendingDailyInterestEmailDispatch(
        user.id,
      );

      if (!dispatch.entries.length) {
        return;
      }

      void this.emailNotifications.sendDailyInterestCreditSummary(user, {
        entries: dispatch.entries.map((entry) => ({
          planName: this.extractPlanNameFromInterestEntry(entry),
          amount: Number(entry.amount) || 0,
          createdAt: entry.createdAt,
        })),
        availableBalance: dispatch.availableBalance,
        totalProfit: dispatch.totalProfit,
      });
    } catch (error) {
      this.logger.warn(
        `Unable to dispatch pending daily interest emails for ${user.id}: ${
          error instanceof Error ? error.message : 'Unknown store error'
        }`,
      );
    }
  }

  private extractPlanNameFromInterestEntry(entry: DashboardStatementEntry) {
    const description = String(entry.description || '').trim();
    const suffix = ' daily interest';
    const markerIndex = description.toLowerCase().indexOf(suffix);
    if (markerIndex > 0) {
      return description.slice(0, markerIndex).trim();
    }

    return entry.title || 'Investment plan';
  }

  private async requireUser(sessionToken: string | null): Promise<PublicUser> {
    if (!sessionToken) {
      throw new UnauthorizedException(
        'Sign in is required to access the dashboard.',
      );
    }

    const user = await this.store.getUserBySessionToken(sessionToken);

    if (!user) {
      throw new UnauthorizedException(
        'Sign in is required to access the dashboard.',
      );
    }

    if (user.role === 'admin') {
      throw new UnauthorizedException(
        'Admin accounts do not use the investor dashboard.',
      );
    }

    if (user.accountStatus === 'suspended') {
      throw new UnauthorizedException(
        'This account is suspended. Contact Novabit support.',
      );
    }

    if (user.accountStatus === 'deactivated') {
      throw new UnauthorizedException(
        'This account is deactivated. Contact Novabit support.',
      );
    }

    if (!user.emailVerified && !user.phoneVerified) {
      throw new UnauthorizedException(
        'Verify your email address or phone number before opening the dashboard.',
      );
    }

    return user;
  }

  private async requireAdmin(sessionToken: string | null): Promise<PublicUser> {
    if (!sessionToken) {
      throw new UnauthorizedException('Admin sign in is required.');
    }

    const user = await this.store.getUserBySessionToken(sessionToken);
    if (!user || user.role !== 'admin') {
      throw new UnauthorizedException('Admin sign in is required.');
    }

    if (user.accountStatus !== 'active') {
      throw new UnauthorizedException('Admin sign in is required.');
    }

    return user;
  }

  private normalizeAdminUserAction(
    value: unknown,
  ): AdminUserAccountAction | 'delete' {
    const normalized =
      typeof value === 'string' ? value.trim().toLowerCase() : '';

    if (
      normalized === 'activate' ||
      normalized === 'suspend' ||
      normalized === 'deactivate' ||
      normalized === 'delete'
    ) {
      return normalized;
    }

    throw new BadRequestException('Select a valid user account action.');
  }

  private normalizePaymentSubmissionPayload(
    user: PublicUser,
    payload: CreatePaymentSubmissionPayload,
  ): CreatePaymentSubmissionInput {
    const planKey =
      typeof payload.planKey === 'string' ? payload.planKey.trim() : '';
    const planName =
      typeof payload.planName === 'string' ? payload.planName.trim() : '';
    const fundingMethod = this.normalizeFundingMethod(payload.fundingMethod);
    const amount = Number(payload.amount);
    const proofImageDataUrl =
      typeof payload.proofImageDataUrl === 'string'
        ? payload.proofImageDataUrl.trim()
        : '';
    const proofFileName =
      typeof payload.proofFileName === 'string'
        ? payload.proofFileName.trim()
        : '';
    const proofMimeType =
      typeof payload.proofMimeType === 'string'
        ? payload.proofMimeType.trim()
        : '';

    if (!planKey || !planName) {
      throw new BadRequestException('A valid plan is required.');
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('A valid payment amount is required.');
    }

    if (!proofFileName || !proofMimeType || !proofImageDataUrl) {
      throw new BadRequestException('Upload a payment screenshot first.');
    }

    if (
      !/^image\/(png|jpeg|jpg|webp)$/i.test(proofMimeType) ||
      !/^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i.test(
        proofImageDataUrl,
      )
    ) {
      throw new BadRequestException(
        'Upload a PNG, JPG, or WEBP payment screenshot.',
      );
    }

    if (Buffer.byteLength(proofImageDataUrl, 'utf8') > 4_500_000) {
      throw new BadRequestException(
        'The payment screenshot is too large. Use a smaller image.',
      );
    }

    return {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      planKey,
      planName,
      fundingMethod,
      amount,
      assetKey:
        typeof payload.assetKey === 'string' ? payload.assetKey.trim() : null,
      assetSymbol:
        typeof payload.assetSymbol === 'string'
          ? payload.assetSymbol.trim()
          : null,
      assetName:
        typeof payload.assetName === 'string' ? payload.assetName.trim() : null,
      network:
        typeof payload.network === 'string' ? payload.network.trim() : null,
      routeAddress:
        typeof payload.routeAddress === 'string'
          ? payload.routeAddress.trim()
          : null,
      proofImageDataUrl,
      proofFileName,
      proofMimeType,
      proofNote:
        typeof payload.proofNote === 'string'
          ? payload.proofNote.trim()
          : null,
    };
  }

  private normalizeFundingMethod(value: unknown): PaymentSubmissionMethod {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

    if (normalized === 'crypto' || normalized === 'card' || normalized === 'fan') {
      return normalized;
    }

    throw new BadRequestException('A valid payment method is required.');
  }

  private normalizeKycSubmissionPayload(
    user: PublicUser,
    payload: CreateKycSubmissionPayload,
  ): CreateKycSubmissionInput {
    const email = this.readText(payload.email, 'Email', 160) || user.email;
    const phone = this.readText(payload.phone, 'Phone', 80) || user.phone;
    const firstName = this.readText(payload.firstName, 'First name', 80);
    const middleName = this.readText(payload.middleName, 'Middle name', 80);
    const lastName = this.readText(payload.lastName, 'Last name', 80);
    const countryOfOrigin = this.readText(
      payload.countryOfOrigin,
      'Country of origin',
      120,
    );
    const documentType = this.normalizeKycDocumentType(payload.documentType);
    const documentImageDataUrl = this.readText(
      payload.documentImageDataUrl,
      'Identity document',
      7_000_000,
    );
    const documentFileName = this.readText(
      payload.documentFileName,
      'Document file name',
      180,
    );
    const documentMimeType = this.readText(
      payload.documentMimeType,
      'Document file type',
      80,
    );

    if (!email.includes('@')) {
      throw new BadRequestException('A valid email is required for KYC.');
    }

    if (!phone || !firstName || !lastName || !countryOfOrigin) {
      throw new BadRequestException(
        'Email, phone, first name, last name, and country of origin are required for KYC.',
      );
    }

    if (!documentFileName || !documentMimeType || !documentImageDataUrl) {
      throw new BadRequestException('Upload a valid identity document first.');
    }

    if (
      !/^(image\/(png|jpeg|jpg|webp)|application\/pdf)$/i.test(
        documentMimeType,
      ) ||
      !/^data:(image\/(png|jpeg|jpg|webp)|application\/pdf);base64,[a-z0-9+/=]+$/i.test(
        documentImageDataUrl,
      )
    ) {
      throw new BadRequestException(
        'Upload a PNG, JPG, WEBP, or PDF identity document.',
      );
    }

    if (Buffer.byteLength(documentImageDataUrl, 'utf8') > 6_500_000) {
      throw new BadRequestException(
        'The identity document is too large. Use a file under 6 MB.',
      );
    }

    return {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      email,
      phone,
      firstName,
      middleName: middleName || null,
      lastName,
      countryOfOrigin,
      documentType,
      documentImageDataUrl,
      documentFileName,
      documentMimeType,
    };
  }

  private normalizeKycDocumentType(value: unknown): KycDocumentType {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

    if (
      normalized === 'passport' ||
      normalized === 'drivers_license' ||
      normalized === 'national_id' ||
      normalized === 'other'
    ) {
      return normalized;
    }

    throw new BadRequestException('A valid identity document type is required.');
  }

  private normalizeWithdrawalSubmissionPayload(
    user: PublicUser,
    payload: CreateWithdrawalSubmissionPayload,
  ): CreateWithdrawalSubmissionInput {
    const withdrawalMethod = this.normalizeWithdrawalMethod(
      payload.withdrawalMethod,
    );
    const amount = Number(payload.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('A valid withdrawal amount is required.');
    }

    if (amount > 250_000) {
      throw new BadRequestException(
        'Withdrawal amount is above the supported limit.',
      );
    }

    const estimatedFee = this.calculateWithdrawalFee(withdrawalMethod, amount);
    const netAmount = Math.max(amount - estimatedFee, 0);

    if (netAmount <= 0) {
      throw new BadRequestException(
        'Withdrawal amount must be higher than the route fee.',
      );
    }

    const input: CreateWithdrawalSubmissionInput = {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      withdrawalMethod,
      amount,
      estimatedFee,
      netAmount,
      assetKey: null,
      assetSymbol: null,
      assetName: null,
      network: null,
      walletAddress: null,
      walletLabel: null,
      bankHolder: null,
      bankName: null,
      bankRouting: null,
      bankAccount: null,
      bankCountry: null,
      wireBeneficiary: null,
      wireBankName: null,
      wireSwift: null,
      wireIban: null,
      wireCountry: null,
      wireNote: null,
    };

    if (withdrawalMethod === 'crypto') {
      const assetKey = this.readText(payload.assetKey, 'Asset key', 40);
      const assetSymbol = this.readText(payload.assetSymbol, 'Asset symbol', 24);
      const network = this.readText(payload.network, 'Network', 80);
      const walletAddress = this.readText(
        payload.walletAddress,
        'Wallet address',
        200,
      );

      if (!assetKey || !assetSymbol || !network || !walletAddress) {
        throw new BadRequestException(
          'Asset, network, and wallet address are required for crypto withdrawals.',
        );
      }

      return {
        ...input,
        assetKey,
        assetSymbol,
        assetName: this.readText(payload.assetName, 'Asset name', 80) || null,
        network,
        walletAddress,
        walletLabel:
          this.readText(payload.walletLabel, 'Wallet label', 120) || null,
      };
    }

    if (withdrawalMethod === 'bank') {
      const bankHolder = this.readText(payload.bankHolder, 'Account holder', 120);
      const bankName = this.readText(payload.bankName, 'Bank name', 120);
      const bankRouting = this.readText(
        payload.bankRouting,
        'Routing number',
        80,
      );
      const bankAccount = this.readText(
        payload.bankAccount,
        'Account number',
        120,
      );
      const bankCountry = this.readText(payload.bankCountry, 'Bank country', 80);

      if (
        !bankHolder ||
        !bankName ||
        !bankRouting ||
        !bankAccount ||
        !bankCountry
      ) {
        throw new BadRequestException(
          'Account holder, bank, routing, account number, and country are required for bank withdrawals.',
        );
      }

      return {
        ...input,
        bankHolder,
        bankName,
        bankRouting,
        bankAccount,
        bankCountry,
      };
    }

    const wireBeneficiary = this.readText(
      payload.wireBeneficiary,
      'Beneficiary name',
      120,
    );
    const wireBankName = this.readText(payload.wireBankName, 'Bank name', 120);
    const wireSwift = this.readText(payload.wireSwift, 'SWIFT / BIC', 40);
    const wireIban = this.readText(payload.wireIban, 'IBAN / account', 120);
    const wireCountry = this.readText(payload.wireCountry, 'Bank country', 80);

    if (
      !wireBeneficiary ||
      !wireBankName ||
      !wireSwift ||
      !wireIban ||
      !wireCountry
    ) {
      throw new BadRequestException(
        'Beneficiary, bank, SWIFT / BIC, IBAN or account number, and country are required for wire withdrawals.',
      );
    }

    return {
      ...input,
      wireBeneficiary,
      wireBankName,
      wireSwift,
      wireIban,
      wireCountry,
      wireNote: this.readText(payload.wireNote, 'Payout note', 250) || null,
    };
  }

  private normalizeWithdrawalMethod(
    value: unknown,
  ): WithdrawalSubmissionMethod {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

    if (
      normalized === 'crypto' ||
      normalized === 'bank' ||
      normalized === 'wire'
    ) {
      return normalized;
    }

    throw new BadRequestException('A valid withdrawal method is required.');
  }

  private normalizeWithdrawalReviewStatus(
    value: unknown,
  ): Exclude<WithdrawalSubmissionStatus, 'pending'> {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

    if (
      normalized === 'approved' ||
      normalized === 'cancelled' ||
      normalized === 'rejected'
    ) {
      return normalized;
    }

    throw new BadRequestException('A valid review status is required.');
  }

  private calculateWithdrawalFee(
    method: WithdrawalSubmissionMethod,
    amount: number,
  ) {
    if (method === 'crypto') {
      return Math.max(15, Math.round(amount * 0.01 * 100) / 100);
    }

    if (method === 'bank') {
      return 25;
    }

    return 45;
  }

  private readText(value: unknown, label: string, maxLength: number) {
    if (typeof value !== 'string') {
      return '';
    }

    const normalized = value.trim();
    if (normalized.length > maxLength) {
      throw new BadRequestException(`${label} is too long.`);
    }

    return normalized;
  }

  private buildSubmissionSummary<
    T extends {
      status: PaymentSubmissionStatus | WithdrawalSubmissionStatus;
    },
  >(submissions: T[]) {
    return {
      total: submissions.length,
      pending: submissions.filter((item) => item.status === 'pending').length,
      approved: submissions.filter((item) => item.status === 'approved').length,
      cancelled: submissions.filter((item) => item.status === 'cancelled')
        .length,
      rejected: submissions.filter((item) => item.status === 'rejected').length,
    };
  }

  private buildKycSubmissionSummary(submissions: KycSubmission[]) {
    return {
      total: submissions.length,
      pending: submissions.filter((item) => item.status === 'pending').length,
      approved: submissions.filter((item) => item.status === 'approved').length,
      rejected: submissions.filter((item) => item.status === 'rejected').length,
    };
  }

  private buildCelebrityCouponSummary(coupons: CelebrityCoupon[]) {
    const now = Date.now();

    return {
      total: coupons.length,
      active: coupons.filter((coupon) => coupon.status === 'active').length,
      inactive: coupons.filter((coupon) => coupon.status === 'inactive').length,
      redeemable: coupons.filter((coupon) => {
        if (coupon.status !== 'active') {
          return false;
        }

        if (
          coupon.expiresAt &&
          new Date(coupon.expiresAt).getTime() <= now
        ) {
          return false;
        }

        if (
          typeof coupon.maxRedemptions === 'number' &&
          coupon.currentRedemptions >= coupon.maxRedemptions
        ) {
          return false;
        }

        return true;
      }).length,
      expired: coupons.filter(
        (coupon) =>
          !!coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= now,
      ).length,
      redemptions: coupons.reduce(
        (total, coupon) => total + Math.max(0, Number(coupon.currentRedemptions) || 0),
        0,
      ),
    };
  }

  private normalizeCelebrityCouponPayload(
    adminUser: PublicUser,
    payload: CreateCelebrityCouponPayload,
  ): CreateCelebrityCouponInput {
    const celebrityName = this.readText(
      payload.celebrityName,
      'Celebrity name',
      120,
    );
    const couponCode = this.readText(payload.couponCode, 'Coupon code', 32)
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');
    const offerDetails =
      this.readText(payload.offerDetails, 'Offer details', 240) || null;
    const expiresAtRaw = this.readText(payload.expiresAt, 'Coupon expiry', 80);
    const maxRedemptionsRaw = payload.maxRedemptions;
    const status = this.normalizeCelebrityCouponStatus(payload.status);

    if (!celebrityName) {
      throw new BadRequestException('Celebrity name is required.');
    }

    if (!couponCode || !/^[A-Z0-9_-]{4,32}$/.test(couponCode)) {
      throw new BadRequestException(
        'Coupon code must be 4-32 characters using letters, numbers, underscores, or hyphens.',
      );
    }

    let expiresAt: string | null = null;
    if (!expiresAtRaw) {
      throw new BadRequestException('Coupon expiry date is required.');
    }

    const parsed = new Date(expiresAtRaw);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      throw new BadRequestException(
        'Coupon expiry must be a valid future date.',
      );
    }
    expiresAt = parsed.toISOString();

    let maxRedemptions: number | null = null;
    if (maxRedemptionsRaw != null && maxRedemptionsRaw !== '') {
      const parsed = Number(maxRedemptionsRaw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1_000_000) {
        throw new BadRequestException(
          'Max redemptions must be a whole number between 1 and 1000000.',
        );
      }
      maxRedemptions = parsed;
    }

    return {
      celebrityName,
      couponCode,
      offerDetails,
      status,
      expiresAt,
      maxRedemptions,
      createdBy: adminUser.name || adminUser.username || 'Admin Console',
    };
  }

  private normalizeCelebrityCouponStatus(
    value: unknown,
  ): CelebrityCouponStatus {
    return value === 'inactive' ? 'inactive' : 'active';
  }

  private normalizeReviewStatus(
    value: unknown,
  ): Exclude<PaymentSubmissionStatus, 'pending'> {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

    if (
      normalized === 'approved' ||
      normalized === 'cancelled' ||
      normalized === 'rejected'
    ) {
      return normalized;
    }

    throw new BadRequestException('A valid review status is required.');
  }

  private normalizeKycReviewStatus(
    value: unknown,
  ): Exclude<KycSubmissionStatus, 'pending'> {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

    if (normalized === 'approved' || normalized === 'rejected') {
      return normalized;
    }

    throw new BadRequestException('A valid KYC review status is required.');
  }

  private formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  }
}

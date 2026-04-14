import { Injectable, Logger } from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, resolve } from 'node:path';
import { loadApiEnv } from '../config/load-env';
import { PlatformStoreConflictError } from './platform-store.errors';
import type {
  ConsumeRateLimitInput,
  CelebrityCoupon,
  CelebrityCouponStatus,
  ContactSubmission,
  CreateContactSubmissionInput,
  CreatePendingRegistrationInput,
  CreateCelebrityCouponInput,
  CreateKycSubmissionInput,
  CreatePaymentSubmissionInput,
  RegistrationAvailabilityInput,
  RegistrationAvailabilityResult,
  CreateWithdrawalSubmissionInput,
  CreateUserInput,
  AdminUserProfile,
  AccountStatus,
  DailyInterestEmailDispatch,
  DashboardAccount,
  DashboardPortfolioPosition,
  DashboardStatementEntry,
  DashboardTradeRecord,
  EmailVerificationChallenge,
  KycSubmission,
  PendingRegistration,
  PendingRegistrationChallenge,
  PasswordResetRequest,
  PaymentSubmission,
  PlatformStoreAdapter,
  PlatformSession,
  PhoneVerificationChallenge,
  PublicUser,
  RateLimitConsumptionResult,
  ReviewKycSubmissionInput,
  ReviewPaymentSubmissionInput,
  ReviewWithdrawalSubmissionInput,
  WithdrawalSubmission,
} from './platform-store.types';
import {
  buildCelebrityRewardBonusAmount,
  buildEmailVerificationCode,
  buildEmailVerificationExpiry,
  buildPendingRegistrationExpiry,
  buildPhoneVerificationCode,
  buildPhoneVerificationExpiry,
  buildSessionExpiry,
  buildSessionToken,
  buildReference,
  hashEmailVerificationCode,
  hashPhoneVerificationCode,
  hashPassword,
  hashSessionToken,
  isEmailVerificationRequired,
  normalizeEmail,
  normalizePhoneNumber,
  normalizeUserRole,
  normalizeUsername,
  readAdminSeedProfile,
  verifyPassword,
} from './platform-store.utils';
import { syncDashboardAccountPlanInterest } from './plan-interest';

type StoredUser = PublicUser & {
  passwordHash: string;
  passwordSalt: string;
};

type StoredPendingRegistration = PendingRegistration & {
  passwordHash: string;
  passwordSalt: string;
  verificationCodeHash: string;
  verificationExpiresAt: string;
  verificationCreatedAt: string;
};

type StoredSession = {
  id: string;
  userId: string;
  expiresAt: string;
  remember: boolean;
};

type StoredRateLimitBucket = {
  scope: string;
  key: string;
  count: number;
  resetAt: string;
};

type StoredPaymentSubmission = PaymentSubmission & {
  statementEntryId: string;
};

type StoredWithdrawalSubmission = WithdrawalSubmission & {
  statementEntryId: string;
};

type StoredKycSubmission = KycSubmission & {
  statementEntryId: string;
};

type StoredEmailVerificationChallenge = Omit<
  EmailVerificationChallenge,
  'code'
> & {
  codeHash: string;
  consumedAt: string | null;
};

type StoredPhoneVerificationChallenge = Omit<
  PhoneVerificationChallenge,
  'code'
> & {
  codeHash: string;
  consumedAt: string | null;
};

type StoredCelebrityCoupon = Omit<
  CelebrityCoupon,
  'currentRedemptions' | 'remainingRedemptions' | 'lastRedeemedAt'
>;

type PersistedPlatformState = {
  users: StoredUser[];
  sessions: Array<[string, StoredSession]>;
  dashboardAccounts: DashboardAccount[];
  contactSubmissions: ContactSubmission[];
  passwordResetRequests: PasswordResetRequest[];
  pendingRegistrations: StoredPendingRegistration[];
  emailVerificationChallenges: StoredEmailVerificationChallenge[];
  phoneVerificationChallenges: StoredPhoneVerificationChallenge[];
  celebrityCoupons: StoredCelebrityCoupon[];
  paymentSubmissions: StoredPaymentSubmission[];
  withdrawalSubmissions: StoredWithdrawalSubmission[];
  kycSubmissions: StoredKycSubmission[];
  rateLimitBuckets: Array<[string, StoredRateLimitBucket]>;
};

@Injectable()
export class InMemoryPlatformStore implements PlatformStoreAdapter {
  readonly driver = 'in-memory' as const;
  private readonly logger = new Logger(InMemoryPlatformStore.name);

  private readonly users = new Map<string, StoredUser>();
  private readonly usersByEmail = new Map<string, string>();
  private readonly usersByUsername = new Map<string, string>();
  private readonly usersByPhone = new Map<string, string>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly dashboardAccounts = new Map<string, DashboardAccount>();
  private readonly contactSubmissions: ContactSubmission[] = [];
  private readonly passwordResetRequests: PasswordResetRequest[] = [];
  private readonly pendingRegistrations = new Map<string, StoredPendingRegistration>();
  private readonly emailVerificationChallenges: StoredEmailVerificationChallenge[] =
    [];
  private readonly phoneVerificationChallenges: StoredPhoneVerificationChallenge[] =
    [];
  private readonly celebrityCoupons: StoredCelebrityCoupon[] = [];
  private readonly paymentSubmissions: StoredPaymentSubmission[] = [];
  private readonly withdrawalSubmissions: StoredWithdrawalSubmission[] = [];
  private readonly kycSubmissions: StoredKycSubmission[] = [];
  private readonly rateLimitBuckets = new Map<string, StoredRateLimitBucket>();
  private readonly storagePath: string;
  private readonly legacyStoragePaths: string[];

  constructor() {
    loadApiEnv();
    this.storagePath = this.resolveStoragePath();
    this.legacyStoragePaths = this.resolveLegacyStoragePaths();
    this.loadState();
    this.ensureCelebrityCouponSeed();
    this.ensureAdminSeed();
  }

  private assertUserIdentityAvailable(
    username: string,
    email: string,
    phone: string,
  ) {
    if (this.usersByUsername.has(username)) {
      throw new PlatformStoreConflictError('That username is already in use.');
    }

    if (this.usersByEmail.has(email)) {
      throw new PlatformStoreConflictError(
        'That email address is already registered.',
      );
    }

    if (!phone) {
      throw new PlatformStoreConflictError('Enter a valid phone number.');
    }

    if (this.usersByPhone.has(phone)) {
      throw new PlatformStoreConflictError(
        'That phone number is already registered.',
      );
    }
  }

  private buildStoredUser(input: CreateUserInput): StoredUser {
    const username = normalizeUsername(input.username);
    const email = normalizeEmail(input.email);
    const phone = normalizePhoneNumber(input.phone);
    const couponCode = this.normalizeCelebrityCouponCode(input.coupon);
    const role = normalizeUserRole(input.role);
    const passwordHash =
      typeof input.passwordHash === 'string' && input.passwordHash.trim()
        ? input.passwordHash.trim()
        : null;
    const passwordSalt =
      typeof input.passwordSalt === 'string' && input.passwordSalt.trim()
        ? input.passwordSalt.trim()
        : null;
    const resolvedPassword =
      typeof input.password === 'string' ? input.password : '';
    const passwordBundle =
      passwordHash && passwordSalt
        ? { passwordHash, passwordSalt }
        : resolvedPassword
          ? hashPassword(resolvedPassword)
          : null;

    if (!phone) {
      throw new PlatformStoreConflictError('Enter a valid phone number.');
    }

    if (!passwordBundle) {
      throw new PlatformStoreConflictError('A valid password is required.');
    }

    const coupon = couponCode || null;
    const couponAccepted = coupon
      ? Boolean(this.getRedeemableCelebrityCoupon(coupon))
      : false;

    if (coupon && !couponAccepted) {
      throw new PlatformStoreConflictError(
        'That celebrity coupon is invalid, inactive, expired, or fully redeemed.',
      );
    }

    return {
      id: randomUUID(),
      username,
      role,
      name: input.name.trim(),
      email,
      emailVerified:
        typeof input.emailVerified === 'boolean'
          ? input.emailVerified
          : role === 'admin' || !isEmailVerificationRequired(),
      phone,
      phoneVerified:
        typeof input.phoneVerified === 'boolean'
          ? input.phoneVerified
          : role === 'admin' || !isEmailVerificationRequired(),
      country: input.country.trim(),
      coupon,
      couponAccepted,
      accountStatus: this.normalizeAccountStatus(input.accountStatus),
      createdAt: new Date().toISOString(),
      passwordHash: passwordBundle.passwordHash,
      passwordSalt: passwordBundle.passwordSalt,
    };
  }

  private commitStoredUser(storedUser: StoredUser) {
    this.users.set(storedUser.id, storedUser);
    this.usersByUsername.set(storedUser.username, storedUser.id);
    this.usersByEmail.set(storedUser.email, storedUser.id);
    this.usersByPhone.set(storedUser.phone, storedUser.id);
    if (storedUser.role !== 'admin') {
      this.dashboardAccounts.set(
        storedUser.id,
        this.buildDefaultDashboardAccount(storedUser),
      );
    }
    this.saveState();
  }

  private pruneExpiredPendingRegistrations() {
    const now = Date.now();
    let changed = false;

    for (const [id, registration] of this.pendingRegistrations.entries()) {
      if (new Date(registration.expiresAt).getTime() > now) {
        continue;
      }

      this.pendingRegistrations.delete(id);
      changed = true;
    }

    if (changed) {
      this.saveState();
    }

    return changed;
  }

  private removeMatchingPendingRegistrations(
    username: string,
    email: string,
    phone: string,
  ) {
    let changed = false;

    for (const [id, registration] of this.pendingRegistrations.entries()) {
      if (
        registration.username === username ||
        registration.email === email ||
        registration.phone === phone
      ) {
        this.pendingRegistrations.delete(id);
        changed = true;
      }
    }

    if (changed) {
      this.saveState();
    }
  }

  createUser(input: CreateUserInput): Promise<PublicUser> {
    const username = normalizeUsername(input.username);
    const email = normalizeEmail(input.email);
    const phone = normalizePhoneNumber(input.phone);

    this.assertUserIdentityAvailable(username, email, phone);

    const storedUser = this.buildStoredUser(input);
    this.commitStoredUser(storedUser);
    return Promise.resolve(this.toPublicUser(storedUser));
  }

  createPendingRegistration(
    input: CreatePendingRegistrationInput,
  ): Promise<PendingRegistrationChallenge> {
    this.pruneExpiredPendingRegistrations();

    const username = normalizeUsername(input.username);
    const email = normalizeEmail(input.email);
    const phone = normalizePhoneNumber(input.phone);
    const verificationChannel = input.verificationChannel;

    this.assertUserIdentityAvailable(username, email, phone);
    this.removeMatchingPendingRegistrations(username, email, phone);

    const { passwordHash, passwordSalt } = hashPassword(input.password);
    const verificationCreatedAt = new Date().toISOString();
    const verificationExpiresAt =
      verificationChannel === 'phone'
        ? buildPhoneVerificationExpiry()
        : buildEmailVerificationExpiry();
    const code =
      verificationChannel === 'phone'
        ? buildPhoneVerificationCode()
        : buildEmailVerificationCode();
    const verificationCodeHash =
      verificationChannel === 'phone'
        ? hashPhoneVerificationCode(phone, code)
        : hashEmailVerificationCode(email, code);
    const registration: StoredPendingRegistration = {
      id: randomUUID(),
      username,
      role: normalizeUserRole(input.role),
      name: input.name.trim(),
      email,
      phone,
      country: input.country.trim(),
      coupon: this.normalizeCelebrityCouponCode(input.coupon) || null,
      verificationChannel,
      expiresAt: buildPendingRegistrationExpiry(),
      createdAt: verificationCreatedAt,
      passwordHash,
      passwordSalt,
      verificationCodeHash,
      verificationExpiresAt,
      verificationCreatedAt,
    };

    this.pendingRegistrations.set(registration.id, registration);
    this.saveState();

    return Promise.resolve({
      pendingRegistrationId: registration.id,
      channel: verificationChannel,
      destination:
        verificationChannel === 'phone' ? registration.phone : registration.email,
      code,
      expiresAt: registration.verificationExpiresAt,
      createdAt: registration.verificationCreatedAt,
    });
  }

  resendPendingRegistrationChallenge(
    pendingRegistrationId: string,
  ): Promise<PendingRegistrationChallenge> {
    this.pruneExpiredPendingRegistrations();

    const registration = this.pendingRegistrations.get(pendingRegistrationId);
    if (!registration) {
      throw new PlatformStoreConflictError(
        'Registration verification has expired. Start signup again.',
      );
    }

    if (new Date(registration.expiresAt).getTime() <= Date.now()) {
      this.pendingRegistrations.delete(registration.id);
      this.saveState();
      throw new PlatformStoreConflictError(
        'Registration verification has expired. Start signup again.',
      );
    }

    const verificationCreatedAt = new Date().toISOString();
    const code =
      registration.verificationChannel === 'phone'
        ? buildPhoneVerificationCode()
        : buildEmailVerificationCode();
    registration.verificationCreatedAt = verificationCreatedAt;
    registration.verificationExpiresAt =
      registration.verificationChannel === 'phone'
        ? buildPhoneVerificationExpiry()
        : buildEmailVerificationExpiry();
    registration.verificationCodeHash =
      registration.verificationChannel === 'phone'
        ? hashPhoneVerificationCode(registration.phone, code)
        : hashEmailVerificationCode(registration.email, code);
    registration.expiresAt = buildPendingRegistrationExpiry();
    this.saveState();

    return Promise.resolve({
      pendingRegistrationId: registration.id,
      channel: registration.verificationChannel,
      destination:
        registration.verificationChannel === 'phone'
          ? registration.phone
          : registration.email,
      code,
      expiresAt: registration.verificationExpiresAt,
      createdAt: registration.verificationCreatedAt,
    });
  }

  async verifyPendingRegistration(
    pendingRegistrationId: string,
    code: string,
  ): Promise<PublicUser> {
    this.pruneExpiredPendingRegistrations();

    const registration = this.pendingRegistrations.get(pendingRegistrationId);
    if (!registration) {
      throw new PlatformStoreConflictError(
        'Invalid or expired verification code.',
      );
    }

    if (new Date(registration.expiresAt).getTime() <= Date.now()) {
      this.pendingRegistrations.delete(registration.id);
      this.saveState();
      throw new PlatformStoreConflictError(
        'Registration verification has expired. Start signup again.',
      );
    }

    const expectedHash =
      registration.verificationChannel === 'phone'
        ? hashPhoneVerificationCode(registration.phone, code)
        : hashEmailVerificationCode(registration.email, code);

    if (
      new Date(registration.verificationExpiresAt).getTime() <= Date.now() ||
      registration.verificationCodeHash !== expectedHash
    ) {
      throw new PlatformStoreConflictError(
        'Invalid or expired verification code.',
      );
    }

    const user = await this.createUser({
      username: registration.username,
      role: registration.role,
      name: registration.name,
      email: registration.email,
      phone: registration.phone,
      country: registration.country,
      coupon: registration.coupon,
      passwordHash: registration.passwordHash,
      passwordSalt: registration.passwordSalt,
      emailVerified: registration.verificationChannel === 'email',
      phoneVerified: registration.verificationChannel === 'phone',
    });

    this.pendingRegistrations.delete(registration.id);
    this.saveState();
    return user;
  }

  checkRegistrationAvailability(
    input: RegistrationAvailabilityInput,
  ): Promise<RegistrationAvailabilityResult> {
    this.pruneExpiredPendingRegistrations();
    const result: RegistrationAvailabilityResult = {};
    const pendingRegistrations = [...this.pendingRegistrations.values()];

    if (typeof input.username === 'string' && input.username.trim()) {
      const normalizedUsername = normalizeUsername(input.username);
      result.username =
        !this.usersByUsername.has(normalizedUsername) &&
        !pendingRegistrations.some(
          (registration) =>
            normalizeUsername(registration.username) === normalizedUsername,
        );
    }

    if (typeof input.email === 'string' && input.email.trim()) {
      const normalizedEmail = normalizeEmail(input.email);
      result.email =
        !this.usersByEmail.has(normalizedEmail) &&
        !pendingRegistrations.some(
          (registration) => normalizeEmail(registration.email) === normalizedEmail,
        );
    }

    if (typeof input.phone === 'string' && input.phone.trim()) {
      const normalizedPhone = normalizePhoneNumber(input.phone);
      result.phone =
        !!normalizedPhone &&
        !this.usersByPhone.has(normalizedPhone) &&
        !pendingRegistrations.some(
          (registration) =>
            normalizePhoneNumber(registration.phone) === normalizedPhone,
        );
    }

    return Promise.resolve(result);
  }

  validateUser(login: string, password: string): Promise<PublicUser | null> {
    const normalizedLogin = login.trim().toLowerCase();
    const userId =
      this.usersByEmail.get(normalizedLogin) ??
      this.usersByUsername.get(normalizedLogin);

    if (!userId) {
      return Promise.resolve(null);
    }

    const user = this.users.get(userId);
    if (!user) {
      return Promise.resolve(null);
    }

    if (!verifyPassword(password, user.passwordHash, user.passwordSalt)) {
      return Promise.resolve(null);
    }

    return Promise.resolve(this.toPublicUser(user));
  }

  createPasswordResetRequest(email: string): Promise<PasswordResetRequest> {
    const request: PasswordResetRequest = {
      id: randomUUID(),
      reference: buildReference('RESET'),
      email: normalizeEmail(email),
      createdAt: new Date().toISOString(),
    };

    this.passwordResetRequests.push(request);
    this.saveState();
    return Promise.resolve(request);
  }

  createEmailVerificationChallenge(
    email: string,
  ): Promise<EmailVerificationChallenge> {
    const normalizedEmail = normalizeEmail(email);
    const userId = this.usersByEmail.get(normalizedEmail);
    const user = userId ? this.users.get(userId) : null;

    if (!user) {
      throw new PlatformStoreConflictError('No account matches that email.');
    }

    if (user.emailVerified) {
      throw new PlatformStoreConflictError('That email is already verified.');
    }

    const code = buildEmailVerificationCode();
    const challenge: StoredEmailVerificationChallenge = {
      id: randomUUID(),
      userId: user.id,
      email: user.email,
      codeHash: hashEmailVerificationCode(user.email, code),
      expiresAt: buildEmailVerificationExpiry(),
      createdAt: new Date().toISOString(),
      consumedAt: null,
    };

    this.emailVerificationChallenges.push(challenge);
    this.saveState();

    return Promise.resolve({
      id: challenge.id,
      userId: challenge.userId,
      email: challenge.email,
      code,
      expiresAt: challenge.expiresAt,
      createdAt: challenge.createdAt,
    });
  }

  createPhoneVerificationChallenge(
    phone: string,
  ): Promise<PhoneVerificationChallenge> {
    const normalizedPhone = normalizePhoneNumber(phone);
    const userId = this.usersByPhone.get(normalizedPhone);
    const user = userId ? this.users.get(userId) : null;

    if (!user) {
      throw new PlatformStoreConflictError(
        'No account matches that phone number.',
      );
    }

    if (user.phoneVerified) {
      throw new PlatformStoreConflictError(
        'That phone number is already verified.',
      );
    }

    const code = buildPhoneVerificationCode();
    const challenge: StoredPhoneVerificationChallenge = {
      id: randomUUID(),
      userId: user.id,
      phone: user.phone,
      codeHash: hashPhoneVerificationCode(user.phone, code),
      expiresAt: buildPhoneVerificationExpiry(),
      createdAt: new Date().toISOString(),
      consumedAt: null,
    };

    this.phoneVerificationChallenges.push(challenge);
    this.saveState();

    return Promise.resolve({
      id: challenge.id,
      userId: challenge.userId,
      phone: challenge.phone,
      code,
      expiresAt: challenge.expiresAt,
      createdAt: challenge.createdAt,
    });
  }

  verifyEmailCode(email: string, code: string): Promise<PublicUser> {
    const normalizedEmail = normalizeEmail(email);
    const userId = this.usersByEmail.get(normalizedEmail);
    const user = userId ? this.users.get(userId) : null;

    if (!user) {
      throw new PlatformStoreConflictError('Invalid verification code.');
    }

    if (user.emailVerified) {
      return Promise.resolve(this.toPublicUser(user));
    }

    const challenge = this.emailVerificationChallenges
      .filter(
        (entry) =>
          entry.email === normalizedEmail &&
          entry.userId === user.id &&
          !entry.consumedAt,
      )
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      )[0];

    if (
      !challenge ||
      new Date(challenge.expiresAt).getTime() <= Date.now() ||
      challenge.codeHash !== hashEmailVerificationCode(normalizedEmail, code)
    ) {
      throw new PlatformStoreConflictError('Invalid or expired verification code.');
    }

    const verifiedAt = new Date().toISOString();
    challenge.consumedAt = verifiedAt;
    user.emailVerified = true;

    const dashboard = this.dashboardAccounts.get(user.id);
    if (dashboard) {
      dashboard.statementEntries.unshift({
        id: randomUUID(),
        kind: 'note',
        title: 'Email verified',
        description: 'Your account email address was verified successfully.',
        amount: null,
        status: 'completed',
        createdAt: verifiedAt,
      });
      dashboard.statementEntries = dashboard.statementEntries.slice(0, 20);
      dashboard.updatedAt = verifiedAt;
    }

    this.saveState();
    return Promise.resolve(this.toPublicUser(user));
  }

  verifyPhoneCode(phone: string, code: string): Promise<PublicUser> {
    const normalizedPhone = normalizePhoneNumber(phone);
    const userId = this.usersByPhone.get(normalizedPhone);
    const user = userId ? this.users.get(userId) : null;

    if (!user) {
      throw new PlatformStoreConflictError('Invalid verification code.');
    }

    if (user.phoneVerified) {
      return Promise.resolve(this.toPublicUser(user));
    }

    const challenge = this.phoneVerificationChallenges
      .filter(
        (entry) =>
          entry.phone === normalizedPhone &&
          entry.userId === user.id &&
          !entry.consumedAt,
      )
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      )[0];

    if (
      !challenge ||
      new Date(challenge.expiresAt).getTime() <= Date.now() ||
      challenge.codeHash !== hashPhoneVerificationCode(normalizedPhone, code)
    ) {
      throw new PlatformStoreConflictError(
        'Invalid or expired verification code.',
      );
    }

    const verifiedAt = new Date().toISOString();
    challenge.consumedAt = verifiedAt;
    user.phoneVerified = true;

    const dashboard = this.dashboardAccounts.get(user.id);
    if (dashboard) {
      dashboard.statementEntries.unshift({
        id: randomUUID(),
        kind: 'note',
        title: 'Phone verified',
        description: 'Your account phone number was verified successfully.',
        amount: null,
        status: 'completed',
        createdAt: verifiedAt,
      });
      dashboard.statementEntries = dashboard.statementEntries.slice(0, 20);
      dashboard.updatedAt = verifiedAt;
    }

    this.saveState();
    return Promise.resolve(this.toPublicUser(user));
  }

  createSession(userId: string, remember: boolean): Promise<PlatformSession> {
    const token = buildSessionToken();
    const tokenHash = hashSessionToken(token);
    const session: StoredSession = {
      id: randomUUID(),
      userId,
      expiresAt: buildSessionExpiry(remember),
      remember,
    };

    this.sessions.set(tokenHash, session);
    this.saveState();

    return Promise.resolve({
      token,
      expiresAt: session.expiresAt,
      remember: session.remember,
    });
  }

  refreshSession(token: string): Promise<PlatformSession | null> {
    let stateChanged = false;
    if (this.pruneExpiredSessions()) {
      stateChanged = true;
    }

    const tokenHash = hashSessionToken(token);
    const session = this.sessions.get(tokenHash);

    if (!session) {
      if (stateChanged) {
        this.saveState();
      }
      return Promise.resolve(null);
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      this.sessions.delete(tokenHash);
      this.saveState();
      return Promise.resolve(null);
    }

    session.expiresAt = buildSessionExpiry(session.remember);
    this.saveState();

    return Promise.resolve({
      token,
      expiresAt: session.expiresAt,
      remember: session.remember,
    });
  }

  getUserBySessionToken(token: string): Promise<PublicUser | null> {
    let stateChanged = false;
    if (this.pruneExpiredSessions()) {
      stateChanged = true;
    }

    const tokenHash = hashSessionToken(token);
    const session = this.sessions.get(tokenHash);

    if (!session) {
      if (stateChanged) {
        this.saveState();
      }
      return Promise.resolve(null);
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      this.sessions.delete(tokenHash);
      this.saveState();
      return Promise.resolve(null);
    }

    const user = this.users.get(session.userId);
    if (!user) {
      this.sessions.delete(tokenHash);
      this.saveState();
      return Promise.resolve(null);
    }

    if (stateChanged) {
      this.saveState();
    }

    return Promise.resolve(this.toPublicUser(user));
  }

  revokeSession(token: string): Promise<void> {
    this.sessions.delete(hashSessionToken(token));
    this.saveState();
    return Promise.resolve();
  }

  listAdminUsers(): Promise<AdminUserProfile[]> {
    let stateChanged = false;
    const profiles = Array.from(this.users.values())
      .filter((user) => user.role !== 'admin')
      .map((user) => {
        let dashboard = this.dashboardAccounts.get(user.id);
        if (!dashboard) {
          dashboard = this.buildDefaultDashboardAccount(user);
          this.dashboardAccounts.set(user.id, dashboard);
          stateChanged = true;
        }

        if (this.syncPlanInterestForUser(dashboard, user.id)) {
          stateChanged = true;
        }

        const approvedDeposits = this.paymentSubmissions.filter(
          (submission) =>
            submission.userId === user.id && submission.status === 'approved',
        );
        const approvedDepositTotal = approvedDeposits.reduce(
          (total, submission) =>
            total + Math.max(0, Number(submission.amount) || 0),
          0,
        );
        const totalDeposit = Math.max(
          Number(dashboard.totalDeposit) || 0,
          approvedDepositTotal,
        );
        const lastDepositAt = approvedDeposits.reduce<string | null>(
          (latest, submission) => {
            const candidate = submission.reviewedAt || submission.createdAt;
            if (!candidate) {
              return latest;
            }

            if (
              !latest ||
              new Date(candidate).getTime() > new Date(latest).getTime()
            ) {
              return candidate;
            }

            return latest;
          },
          null,
        );

        return {
          ...this.toPublicUser(user),
          verificationStatus: dashboard.verificationStatus,
          accountState: dashboard.accountState,
          accountBalance: Number(dashboard.accountBalance) || 0,
          totalDeposit,
          totalWithdrawal: Number(dashboard.totalWithdrawal) || 0,
          totalProfit: Number(dashboard.totalProfit) || 0,
          bonusBalance: Number(dashboard.bonusBalance) || 0,
          activePlans: Number(dashboard.activePlans) || 0,
          pendingItems: Number(dashboard.pendingItems) || 0,
          isInvestor: totalDeposit > 0 || approvedDeposits.length > 0,
          approvedDepositCount: approvedDeposits.length,
          approvedDepositTotal,
          lastDepositAt,
        };
      })
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      );

    if (stateChanged) {
      this.saveState();
    }

    return Promise.resolve(profiles);
  }

  async updateUserAccountStatus(
    userId: string,
    status: AccountStatus,
  ): Promise<AdminUserProfile> {
    const user = this.users.get(userId);
    if (!user || user.role === 'admin') {
      throw new PlatformStoreConflictError('User account not found.');
    }

    const nextStatus = this.normalizeAccountStatus(status);
    user.accountStatus = nextStatus;
    this.revokeSessionsForUser(userId);

    const dashboard = this.dashboardAccounts.get(userId);
    if (dashboard) {
      const updatedAt = new Date().toISOString();
      dashboard.accountState = this.getDashboardAccountState(nextStatus);
      dashboard.updatedAt = updatedAt;
      dashboard.statementEntries.unshift({
        id: randomUUID(),
        kind: 'note',
        title: this.getAccountStatusEntryTitle(nextStatus),
        description: this.getAccountStatusEntryDescription(nextStatus),
        amount: null,
        status: nextStatus === 'active' ? 'completed' : 'info',
        createdAt: updatedAt,
      });
      dashboard.statementEntries = dashboard.statementEntries.slice(0, 20);
    }

    this.saveState();
    const profile = (await this.listAdminUsers()).find((entry) => entry.id === userId);
    if (!profile) {
      throw new PlatformStoreConflictError('User account not found.');
    }
    return profile;
  }

  deleteUserAccount(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user || user.role === 'admin') {
      throw new PlatformStoreConflictError('User account not found.');
    }

    this.users.delete(userId);
    this.usersByEmail.delete(user.email);
    this.usersByUsername.delete(user.username);
    if (user.phone) {
      this.usersByPhone.delete(user.phone);
    }
    this.revokeSessionsForUser(userId);
    this.dashboardAccounts.delete(userId);
    this.emailVerificationChallenges.splice(
      0,
      this.emailVerificationChallenges.length,
      ...this.emailVerificationChallenges.filter((item) => item.userId !== userId),
    );
    this.phoneVerificationChallenges.splice(
      0,
      this.phoneVerificationChallenges.length,
      ...this.phoneVerificationChallenges.filter((item) => item.userId !== userId),
    );
    this.paymentSubmissions.splice(
      0,
      this.paymentSubmissions.length,
      ...this.paymentSubmissions.filter((item) => item.userId !== userId),
    );
    this.withdrawalSubmissions.splice(
      0,
      this.withdrawalSubmissions.length,
      ...this.withdrawalSubmissions.filter((item) => item.userId !== userId),
    );
    this.kycSubmissions.splice(
      0,
      this.kycSubmissions.length,
      ...this.kycSubmissions.filter((item) => item.userId !== userId),
    );
    this.passwordResetRequests.splice(
      0,
      this.passwordResetRequests.length,
      ...this.passwordResetRequests.filter(
        (item) => normalizeEmail(item.email) !== user.email,
      ),
    );
    this.saveState();
    return Promise.resolve();
  }

  listCelebrityCoupons(): Promise<CelebrityCoupon[]> {
    const coupons = this.celebrityCoupons
      .map((coupon) => this.toCelebrityCoupon(coupon))
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      );

    return Promise.resolve(coupons);
  }

  createCelebrityCoupon(
    input: CreateCelebrityCouponInput,
  ): Promise<CelebrityCoupon> {
    const couponCode = this.normalizeCelebrityCouponCode(input.couponCode);
    const celebrityName = input.celebrityName.trim();
    const offerDetails = input.offerDetails?.trim() || null;
    const createdBy = input.createdBy.trim() || 'Admin Console';
    const status = this.normalizeCelebrityCouponStatus(input.status);
    const expiresAt = this.normalizeCelebrityCouponExpiry(input.expiresAt);
    const maxRedemptions = this.normalizeCelebrityCouponMaxRedemptions(
      input.maxRedemptions,
    );

    if (!celebrityName) {
      throw new PlatformStoreConflictError('Celebrity name is required.');
    }

    if (!couponCode || !/^[A-Z0-9_-]{4,32}$/.test(couponCode)) {
      throw new PlatformStoreConflictError(
        'Coupon code must be 4-32 characters using letters, numbers, underscores, or hyphens.',
      );
    }

    if (
      this.celebrityCoupons.some(
        (coupon) =>
          this.normalizeCelebrityCouponCode(coupon.couponCode) === couponCode,
      )
    ) {
      throw new PlatformStoreConflictError(
        'That celebrity coupon code already exists.',
      );
    }

    const storedCoupon: StoredCelebrityCoupon = {
      id: randomUUID(),
      celebrityName,
      couponCode,
      offerDetails,
      status,
      expiresAt,
      maxRedemptions,
      createdAt: new Date().toISOString(),
      createdBy,
    };

    this.celebrityCoupons.unshift(storedCoupon);
    this.saveState();
    return Promise.resolve(this.toCelebrityCoupon(storedCoupon));
  }

  validateCelebrityCoupon(code: string): Promise<CelebrityCoupon | null> {
    const normalizedCode = this.normalizeCelebrityCouponCode(code);
    if (!normalizedCode) {
      return Promise.resolve(null);
    }

    const coupon = this.getRedeemableCelebrityCoupon(normalizedCode);
    return Promise.resolve(coupon ? this.toCelebrityCoupon(coupon) : null);
  }

  getDashboardAccount(userId: string): Promise<DashboardAccount> {
    const user = this.users.get(userId);
    if (!user) {
      return Promise.reject(new Error('Dashboard account not found.'));
    }

    let stateChanged = false;
    const existing = this.dashboardAccounts.get(userId);
    if (existing) {
      if (this.syncPlanInterestForUser(existing, userId)) {
        stateChanged = true;
      }

      if (stateChanged) {
        this.saveState();
      }

      return Promise.resolve(this.cloneDashboardAccount(existing));
    }

    const dashboard = this.buildDefaultDashboardAccount(user);
    this.dashboardAccounts.set(userId, dashboard);
    stateChanged = true;

    if (this.syncPlanInterestForUser(dashboard, userId)) {
      stateChanged = true;
    }

    if (stateChanged) {
      this.saveState();
    }

    return Promise.resolve(this.cloneDashboardAccount(dashboard));
  }

  claimPendingDailyInterestEmailDispatch(
    userId: string,
  ): Promise<DailyInterestEmailDispatch> {
    const user = this.users.get(userId);
    if (!user) {
      return Promise.reject(new Error('Dashboard account not found.'));
    }

    let stateChanged = false;
    let dashboard = this.dashboardAccounts.get(userId);
    if (!dashboard) {
      dashboard = this.buildDefaultDashboardAccount(user);
      this.dashboardAccounts.set(userId, dashboard);
      stateChanged = true;
    }

    if (this.syncPlanInterestForUser(dashboard, userId)) {
      stateChanged = true;
    }

    const pendingEntries = dashboard.statementEntries
      .filter(
        (entry) =>
          entry.sourceKey?.startsWith('interest-credit:') &&
          !entry.emailDeliveredAt,
      )
      .slice()
      .sort(
        (left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      )
      .map((entry) => ({ ...entry }));

    if (pendingEntries.length) {
      const emailedAt = new Date().toISOString();
      dashboard.statementEntries.forEach((entry) => {
        if (
          entry.sourceKey?.startsWith('interest-credit:') &&
          !entry.emailDeliveredAt
        ) {
          entry.emailDeliveredAt = emailedAt;
        }
      });
      dashboard.updatedAt = emailedAt;
      stateChanged = true;
    }

    if (stateChanged) {
      this.saveState();
    }

    return Promise.resolve({
      entries: pendingEntries,
      availableBalance: Number(dashboard.accountBalance) || 0,
      totalProfit: Number(dashboard.totalProfit) || 0,
    });
  }

  listPaymentSubmissionsForUser(userId: string): Promise<PaymentSubmission[]> {
    return Promise.resolve(
      this.paymentSubmissions
        .filter((submission) => submission.userId === userId)
        .map((submission) => this.toPaymentSubmission(submission)),
    );
  }

  listPaymentSubmissions(): Promise<PaymentSubmission[]> {
    return Promise.resolve(
      this.paymentSubmissions.map((submission) =>
        this.toPaymentSubmission(submission),
      ),
    );
  }

  createPaymentSubmission(
    input: CreatePaymentSubmissionInput,
  ): Promise<PaymentSubmission> {
    const dashboard = this.dashboardAccounts.get(input.userId);
    if (!dashboard) {
      return Promise.reject(new Error('Dashboard account not found.'));
    }

    const createdAt = new Date().toISOString();
    const statementEntryId = randomUUID();
    const submission: StoredPaymentSubmission = {
      id: randomUUID(),
      reference: buildReference('PAY'),
      userId: input.userId,
      userName: input.userName.trim(),
      userEmail: normalizeEmail(input.userEmail),
      planKey: input.planKey.trim(),
      planName: input.planName.trim(),
      fundingMethod: input.fundingMethod,
      amount: Number(input.amount) || 0,
      assetKey: input.assetKey?.trim() || null,
      assetSymbol: input.assetSymbol?.trim() || null,
      assetName: input.assetName?.trim() || null,
      network: input.network?.trim() || null,
      routeAddress: input.routeAddress?.trim() || null,
      proofImageDataUrl: input.proofImageDataUrl.trim(),
      proofFileName: input.proofFileName.trim(),
      proofMimeType: input.proofMimeType.trim(),
      proofNote: input.proofNote?.trim() || null,
      status: 'pending',
      createdAt,
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null,
      statementEntryId,
    };

    dashboard.pendingItems = Math.max(0, Number(dashboard.pendingItems) || 0) + 1;
    dashboard.updatedAt = createdAt;
    dashboard.statementEntries.unshift({
      id: statementEntryId,
      kind: 'deposit',
      title: 'Payment proof submitted',
      description: `Awaiting admin approval for ${submission.planName}.`,
      amount: submission.amount,
      status: 'pending',
      createdAt,
    });
    dashboard.statementEntries = dashboard.statementEntries.slice(0, 20);

    this.paymentSubmissions.unshift(submission);
    this.saveState();
    return Promise.resolve(this.toPaymentSubmission(submission));
  }

  reviewPaymentSubmission(
    input: ReviewPaymentSubmissionInput,
  ): Promise<PaymentSubmission> {
    const submission = this.paymentSubmissions.find(
      (item) => item.id === input.id.trim(),
    );

    if (!submission) {
      return Promise.reject(new Error('Payment submission not found.'));
    }

    if (submission.status !== 'pending') {
      throw new PlatformStoreConflictError(
        'That payment submission has already been reviewed.',
      );
    }

    const dashboard = this.dashboardAccounts.get(submission.userId);
    if (!dashboard) {
      return Promise.reject(new Error('Dashboard account not found.'));
    }

    const reviewedAt = new Date().toISOString();
    submission.status = input.status;
    submission.reviewedAt = reviewedAt;
    submission.reviewedBy = input.reviewedBy.trim();
    submission.reviewNote = input.reviewNote?.trim() || null;

    dashboard.pendingItems = Math.max(
      0,
      (Number(dashboard.pendingItems) || 0) - 1,
    );
    dashboard.updatedAt = reviewedAt;

    const statementEntry = dashboard.statementEntries.find(
      (entry) => entry.id === submission.statementEntryId,
    );

    if (input.status === 'approved') {
      dashboard.totalDeposit = Math.max(
        0,
        Number(dashboard.totalDeposit) || 0,
      ) + submission.amount;
      dashboard.accountBalance = Math.max(
        0,
        Number(dashboard.accountBalance) || 0,
      ) + submission.amount;

      if (statementEntry) {
        statementEntry.title = 'Deposit approved';
        statementEntry.description = `${submission.planName} payment was approved.`;
        statementEntry.status = 'completed';
        statementEntry.amount = submission.amount;
      }
    } else if (statementEntry) {
      if (input.status === 'cancelled') {
        statementEntry.title = 'Deposit cancelled';
        statementEntry.description =
          submission.reviewNote ||
          'The payment proof was cancelled during admin review.';
      } else {
        statementEntry.title = 'Deposit rejected';
        statementEntry.description =
          submission.reviewNote ||
          'The payment proof was rejected by admin review.';
      }
      statementEntry.status = 'info';
      statementEntry.amount = submission.amount;
    }

    this.saveState();
    return Promise.resolve(this.toPaymentSubmission(submission));
  }

  listWithdrawalSubmissionsForUser(
    userId: string,
  ): Promise<WithdrawalSubmission[]> {
    return Promise.resolve(
      this.withdrawalSubmissions
        .filter((submission) => submission.userId === userId)
        .map((submission) => this.toWithdrawalSubmission(submission)),
    );
  }

  listWithdrawalSubmissions(): Promise<WithdrawalSubmission[]> {
    return Promise.resolve(
      this.withdrawalSubmissions.map((submission) =>
        this.toWithdrawalSubmission(submission),
      ),
    );
  }

  createWithdrawalSubmission(
    input: CreateWithdrawalSubmissionInput,
  ): Promise<WithdrawalSubmission> {
    const dashboard = this.dashboardAccounts.get(input.userId);
    if (!dashboard) {
      return Promise.reject(new Error('Dashboard account not found.'));
    }

    if (dashboard.verificationStatus !== 'verified') {
      throw new PlatformStoreConflictError(
        'KYC verification is required before requesting a withdrawal.',
      );
    }

    const syncedInterest = this.syncPlanInterestForUser(dashboard, input.userId);
    const availableBalance = Math.max(
      0,
      (Number(dashboard.accountBalance) || 0) -
        this.withdrawalSubmissions
          .filter(
            (submission) =>
              submission.userId === input.userId &&
              submission.status === 'pending',
          )
          .reduce(
            (sum, submission) => sum + Math.max(0, Number(submission.amount) || 0),
            0,
          ),
    );

    if (availableBalance < input.amount) {
      if (syncedInterest) {
        this.saveState();
      }
      throw new PlatformStoreConflictError(
        'Insufficient available balance for this withdrawal request.',
      );
    }

    const createdAt = new Date().toISOString();
    const statementEntryId = randomUUID();
    const submission: StoredWithdrawalSubmission = {
      id: randomUUID(),
      reference: buildReference('WDR'),
      userId: input.userId,
      userName: input.userName.trim(),
      userEmail: normalizeEmail(input.userEmail),
      withdrawalMethod: input.withdrawalMethod,
      amount: Number(input.amount) || 0,
      estimatedFee: Number(input.estimatedFee) || 0,
      netAmount: Number(input.netAmount) || 0,
      assetKey: input.assetKey?.trim() || null,
      assetSymbol: input.assetSymbol?.trim() || null,
      assetName: input.assetName?.trim() || null,
      network: input.network?.trim() || null,
      walletAddress: input.walletAddress?.trim() || null,
      walletLabel: input.walletLabel?.trim() || null,
      bankHolder: input.bankHolder?.trim() || null,
      bankName: input.bankName?.trim() || null,
      bankRouting: input.bankRouting?.trim() || null,
      bankAccount: input.bankAccount?.trim() || null,
      bankCountry: input.bankCountry?.trim() || null,
      wireBeneficiary: input.wireBeneficiary?.trim() || null,
      wireBankName: input.wireBankName?.trim() || null,
      wireSwift: input.wireSwift?.trim() || null,
      wireIban: input.wireIban?.trim() || null,
      wireCountry: input.wireCountry?.trim() || null,
      wireNote: input.wireNote?.trim() || null,
      status: 'pending',
      createdAt,
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null,
      statementEntryId,
    };

    dashboard.pendingItems = Math.max(0, Number(dashboard.pendingItems) || 0) + 1;
    dashboard.updatedAt = createdAt;
    dashboard.statementEntries.unshift({
      id: statementEntryId,
      kind: 'withdrawal',
      title: 'Withdrawal requested',
      description: `${this.formatWithdrawalMethodLabel(
        submission.withdrawalMethod,
      )} request is awaiting admin review.`,
      amount: submission.amount,
      status: 'pending',
      createdAt,
    });
    dashboard.statementEntries = dashboard.statementEntries.slice(0, 20);

    this.withdrawalSubmissions.unshift(submission);
    this.saveState();
    return Promise.resolve(this.toWithdrawalSubmission(submission));
  }

  reviewWithdrawalSubmission(
    input: ReviewWithdrawalSubmissionInput,
  ): Promise<WithdrawalSubmission> {
    const submission = this.withdrawalSubmissions.find(
      (item) => item.id === input.id.trim(),
    );

    if (!submission) {
      return Promise.reject(new Error('Withdrawal submission not found.'));
    }

    if (submission.status !== 'pending') {
      throw new PlatformStoreConflictError(
        'That withdrawal submission has already been reviewed.',
      );
    }

    const dashboard = this.dashboardAccounts.get(submission.userId);
    if (!dashboard) {
      return Promise.reject(new Error('Dashboard account not found.'));
    }

    const syncedInterest = this.syncPlanInterestForUser(
      dashboard,
      submission.userId,
    );

    if (
      input.status === 'approved' &&
      Math.max(0, Number(dashboard.accountBalance) || 0) < submission.amount
    ) {
      if (syncedInterest) {
        this.saveState();
      }
      throw new PlatformStoreConflictError(
        'Insufficient available balance to approve this withdrawal.',
      );
    }

    const reviewedAt = new Date().toISOString();
    submission.status = input.status;
    submission.reviewedAt = reviewedAt;
    submission.reviewedBy = input.reviewedBy.trim();
    submission.reviewNote = input.reviewNote?.trim() || null;

    dashboard.pendingItems = Math.max(
      0,
      (Number(dashboard.pendingItems) || 0) - 1,
    );
    dashboard.updatedAt = reviewedAt;

    const statementEntry = dashboard.statementEntries.find(
      (entry) => entry.id === submission.statementEntryId,
    );

    if (input.status === 'approved') {
      dashboard.totalWithdrawal = Math.max(
        0,
        Number(dashboard.totalWithdrawal) || 0,
      ) + submission.amount;
      dashboard.accountBalance = Math.max(
        0,
        Number(dashboard.accountBalance) || 0,
      ) - submission.amount;

      if (statementEntry) {
        statementEntry.title = 'Withdrawal approved';
        statementEntry.description = `${this.formatWithdrawalMethodLabel(
          submission.withdrawalMethod,
        )} payout was approved. Net payout ${submission.netAmount.toFixed(2)}.`;
        statementEntry.status = 'completed';
        statementEntry.amount = submission.amount;
      }
    } else if (statementEntry) {
      if (input.status === 'cancelled') {
        statementEntry.title = 'Withdrawal cancelled';
        statementEntry.description =
          submission.reviewNote ||
          'The withdrawal request was cancelled during admin review.';
      } else {
        statementEntry.title = 'Withdrawal rejected';
        statementEntry.description =
          submission.reviewNote ||
          'The withdrawal request was rejected by admin review.';
      }
      statementEntry.status = 'info';
      statementEntry.amount = submission.amount;
    }

    this.saveState();
    return Promise.resolve(this.toWithdrawalSubmission(submission));
  }

  listKycSubmissionsForUser(userId: string): Promise<KycSubmission[]> {
    return Promise.resolve(
      this.kycSubmissions
        .filter((submission) => submission.userId === userId)
        .map((submission) => this.toKycSubmission(submission)),
    );
  }

  listKycSubmissions(): Promise<KycSubmission[]> {
    return Promise.resolve(
      this.kycSubmissions.map((submission) => this.toKycSubmission(submission)),
    );
  }

  createKycSubmission(input: CreateKycSubmissionInput): Promise<KycSubmission> {
    const dashboard = this.dashboardAccounts.get(input.userId);
    if (!dashboard) {
      return Promise.reject(new Error('Dashboard account not found.'));
    }

    if (dashboard.verificationStatus === 'verified') {
      throw new PlatformStoreConflictError('KYC is already verified.');
    }

    if (
      this.kycSubmissions.some(
        (submission) =>
          submission.userId === input.userId && submission.status === 'pending',
      )
    ) {
      throw new PlatformStoreConflictError(
        'A KYC submission is already pending review.',
      );
    }

    const createdAt = new Date().toISOString();
    const statementEntryId = randomUUID();
    const submission: StoredKycSubmission = {
      id: randomUUID(),
      reference: buildReference('KYC'),
      userId: input.userId,
      userName: input.userName.trim(),
      userEmail: normalizeEmail(input.userEmail),
      email: normalizeEmail(input.email),
      phone: input.phone.trim(),
      firstName: input.firstName.trim(),
      middleName: input.middleName?.trim() || null,
      lastName: input.lastName.trim(),
      countryOfOrigin: input.countryOfOrigin.trim(),
      documentType: input.documentType,
      documentImageDataUrl: input.documentImageDataUrl.trim(),
      documentFileName: input.documentFileName.trim(),
      documentMimeType: input.documentMimeType.trim(),
      status: 'pending',
      createdAt,
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null,
      statementEntryId,
    };

    dashboard.verificationStatus = 'pending';
    dashboard.pendingItems = Math.max(0, Number(dashboard.pendingItems) || 0) + 1;
    dashboard.updatedAt = createdAt;
    dashboard.statementEntries.unshift({
      id: statementEntryId,
      kind: 'note',
      title: 'KYC submitted',
      description: 'Your identity verification was submitted for admin review.',
      amount: null,
      status: 'pending',
      createdAt,
    });
    dashboard.statementEntries = dashboard.statementEntries.slice(0, 20);

    this.kycSubmissions.unshift(submission);
    this.saveState();
    return Promise.resolve(this.toKycSubmission(submission));
  }

  reviewKycSubmission(
    input: ReviewKycSubmissionInput,
  ): Promise<KycSubmission> {
    const submission = this.kycSubmissions.find(
      (item) => item.id === input.id.trim(),
    );

    if (!submission) {
      return Promise.reject(new Error('KYC submission not found.'));
    }

    if (submission.status !== 'pending') {
      throw new PlatformStoreConflictError(
        'That KYC submission has already been reviewed.',
      );
    }

    const dashboard = this.dashboardAccounts.get(submission.userId);
    if (!dashboard) {
      return Promise.reject(new Error('Dashboard account not found.'));
    }

    const reviewedAt = new Date().toISOString();
    submission.status = input.status;
    submission.reviewedAt = reviewedAt;
    submission.reviewedBy = input.reviewedBy.trim();
    submission.reviewNote = input.reviewNote?.trim() || null;

    dashboard.verificationStatus =
      input.status === 'approved' ? 'verified' : 'rejected';
    dashboard.pendingItems = Math.max(
      0,
      (Number(dashboard.pendingItems) || 0) - 1,
    );
    dashboard.updatedAt = reviewedAt;

    const statementEntry = dashboard.statementEntries.find(
      (entry) => entry.id === submission.statementEntryId,
    );
    if (statementEntry) {
      statementEntry.title =
        input.status === 'approved' ? 'KYC approved' : 'KYC rejected';
      statementEntry.description =
        input.status === 'approved'
          ? 'Your identity verification has been approved.'
          : submission.reviewNote ||
            'Your identity verification was rejected. Review the note and resubmit.';
      statementEntry.status = input.status === 'approved' ? 'completed' : 'info';
    }

    this.saveState();
    return Promise.resolve(this.toKycSubmission(submission));
  }

  createContactSubmission(
    input: CreateContactSubmissionInput,
  ): Promise<ContactSubmission> {
    const submission: ContactSubmission = {
      id: randomUUID(),
      reference: buildReference('MSG'),
      topic: input.topic.trim(),
      name: input.name.trim(),
      email: normalizeEmail(input.email),
      message: input.message.trim(),
      createdAt: new Date().toISOString(),
    };

    this.contactSubmissions.push(submission);
    this.saveState();
    return Promise.resolve(submission);
  }

  consumeRateLimit(
    input: ConsumeRateLimitInput,
  ): Promise<RateLimitConsumptionResult> {
    let stateChanged = false;
    if (this.pruneExpiredRateLimitBuckets()) {
      stateChanged = true;
    }

    const now = Date.now();
    const bucketKey = `${input.scope}:${input.key}`;
    const currentBucket = this.rateLimitBuckets.get(bucketKey);

    if (!currentBucket || new Date(currentBucket.resetAt).getTime() <= now) {
      this.rateLimitBuckets.set(bucketKey, {
        scope: input.scope,
        key: input.key,
        count: 1,
        resetAt: new Date(now + input.windowMs).toISOString(),
      });
      this.saveState();
      return Promise.resolve({ allowed: true });
    }

    if (currentBucket.count >= input.limit) {
      if (stateChanged) {
        this.saveState();
      }

      return Promise.resolve({
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((new Date(currentBucket.resetAt).getTime() - now) / 1000),
        ),
      });
    }

    currentBucket.count += 1;
    this.saveState();
    return Promise.resolve({ allowed: true });
  }

  private resolveStoragePath(): string {
    const configuredPath =
      typeof process.env.MEMORY_STORE_FILE === 'string'
        ? process.env.MEMORY_STORE_FILE.trim()
        : '';

    if (configuredPath) {
      if (isAbsolute(configuredPath)) {
        return resolve(configuredPath);
      }

      const workspacePath = resolve(this.resolveWorkspaceRoot(), configuredPath);
      const currentWorkingDirectoryPath = resolve(process.cwd(), configuredPath);

      if (existsSync(workspacePath) || !existsSync(currentWorkingDirectoryPath)) {
        return workspacePath;
      }

      return currentWorkingDirectoryPath;
    }

    return resolve(this.resolveWorkspaceRoot(), 'data', 'platform-store.json');
  }

  private resolveLegacyStoragePaths(): string[] {
    const configuredPath =
      typeof process.env.MEMORY_STORE_FILE === 'string'
        ? process.env.MEMORY_STORE_FILE.trim()
        : '';

    if (configuredPath) {
      if (isAbsolute(configuredPath)) {
        return [];
      }

      return [
        resolve(this.resolveWorkspaceRoot(), configuredPath),
        resolve(process.cwd(), configuredPath),
      ].filter(
        (path, index, paths) =>
          path !== this.storagePath && paths.indexOf(path) === index,
      );
    }

    return [resolve(process.cwd(), 'data', 'platform-store.json')].filter(
      (path) => path !== this.storagePath,
    );
  }

  private resolveWorkspaceRoot(): string {
    return resolve(__dirname, '..', '..', '..', '..');
  }

  private loadState() {
    const candidatePaths = [
      this.storagePath,
      ...this.legacyStoragePaths,
    ].filter((path, index, paths) => paths.indexOf(path) === index);
    const parsedStates = candidatePaths
      .map((path) => ({
        path,
        state: this.readPersistedState(path),
      }))
      .filter(
        (
          entry,
        ): entry is { path: string; state: Partial<PersistedPlatformState> } =>
          entry.state !== null,
      );

    if (parsedStates.length === 0) {
      return;
    }

    try {
      this.users.clear();
      this.usersByEmail.clear();
      this.usersByUsername.clear();
      this.usersByPhone.clear();
      this.sessions.clear();
      this.dashboardAccounts.clear();
      this.contactSubmissions.length = 0;
      this.passwordResetRequests.length = 0;
      this.emailVerificationChallenges.length = 0;
      this.phoneVerificationChallenges.length = 0;
      this.celebrityCoupons.length = 0;
      this.paymentSubmissions.length = 0;
      this.withdrawalSubmissions.length = 0;
      this.kycSubmissions.length = 0;
      this.rateLimitBuckets.clear();

      let stateChanged = false;
      for (const parsedState of parsedStates) {
        this.mergeState(parsedState.state);

        if (parsedState.path !== this.storagePath) {
          stateChanged = true;
        }
      }

      if (this.pruneExpiredSessions()) {
        stateChanged = true;
      }

      if (this.pruneExpiredRateLimitBuckets()) {
        stateChanged = true;
      }

      for (const user of this.users.values()) {
        if (user.role === 'admin' || this.dashboardAccounts.has(user.id)) {
          continue;
        }

        this.dashboardAccounts.set(user.id, this.buildDefaultDashboardAccount(user));
        stateChanged = true;
      }

      if (stateChanged) {
        this.saveState();
      }

      this.logger.log(
        `Loaded ${this.users.size} persisted user(s) into ${this.storagePath}.`,
      );
    } catch (error) {
      this.logger.warn(
        `Unable to load persisted platform state into ${this.storagePath}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  private readPersistedState(
    filePath: string,
  ): Partial<PersistedPlatformState> | null {
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const raw = readFileSync(filePath, 'utf8').trim();
      if (!raw) {
        return null;
      }

      return JSON.parse(raw) as Partial<PersistedPlatformState>;
    } catch (error) {
      this.logger.warn(
        `Unable to read persisted platform state at ${filePath}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return null;
    }
  }

  private mergeState(parsed: Partial<PersistedPlatformState>) {
    const users = Array.isArray(parsed.users) ? parsed.users : [];
    const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
    const dashboardAccounts = Array.isArray(parsed.dashboardAccounts)
      ? parsed.dashboardAccounts
      : [];
    const contactSubmissions = Array.isArray(parsed.contactSubmissions)
      ? parsed.contactSubmissions
      : [];
    const passwordResetRequests = Array.isArray(parsed.passwordResetRequests)
      ? parsed.passwordResetRequests
      : [];
    const pendingRegistrations = Array.isArray(parsed.pendingRegistrations)
      ? parsed.pendingRegistrations
      : [];
    const celebrityCoupons = Array.isArray(parsed.celebrityCoupons)
      ? parsed.celebrityCoupons
      : [];
    const emailVerificationChallenges = Array.isArray(
      parsed.emailVerificationChallenges,
    )
      ? parsed.emailVerificationChallenges
      : [];
    const phoneVerificationChallenges = Array.isArray(
      parsed.phoneVerificationChallenges,
    )
      ? parsed.phoneVerificationChallenges
      : [];
    const paymentSubmissions = Array.isArray(parsed.paymentSubmissions)
      ? parsed.paymentSubmissions
      : [];
    const withdrawalSubmissions = Array.isArray(parsed.withdrawalSubmissions)
      ? parsed.withdrawalSubmissions
      : [];
    const kycSubmissions = Array.isArray(parsed.kycSubmissions)
      ? parsed.kycSubmissions
      : [];
    const rateLimitBuckets = Array.isArray(parsed.rateLimitBuckets)
      ? parsed.rateLimitBuckets
      : [];

    for (const user of users) {
      if (!this.isStoredUser(user)) {
        continue;
      }

      const normalizedUser: StoredUser = {
        ...user,
        role: normalizeUserRole(user.role),
        emailVerified:
          typeof user.emailVerified === 'boolean' ? user.emailVerified : true,
        phone: normalizePhoneNumber(user.phone) || user.phone.trim(),
        phoneVerified:
          typeof user.phoneVerified === 'boolean' ? user.phoneVerified : false,
        accountStatus: this.normalizeAccountStatus(user.accountStatus),
      };
      this.users.set(normalizedUser.id, normalizedUser);
      this.usersByEmail.set(normalizedUser.email, normalizedUser.id);
      this.usersByUsername.set(normalizedUser.username, normalizedUser.id);
      this.usersByPhone.set(normalizedUser.phone, normalizedUser.id);
    }

    for (const entry of sessions) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        continue;
      }

      const [tokenHash, session] = entry;
      if (typeof tokenHash !== 'string' || !this.isStoredSession(session)) {
        continue;
      }

      this.sessions.set(tokenHash, session);
    }

    for (const dashboard of dashboardAccounts) {
      if (this.isDashboardAccount(dashboard)) {
        this.dashboardAccounts.set(
          dashboard.userId,
          this.cloneDashboardAccount(dashboard),
        );
      }
    }

    for (const submission of contactSubmissions) {
      if (
        this.isContactSubmission(submission) &&
        !this.contactSubmissions.some((item) => item.id === submission.id)
      ) {
        this.contactSubmissions.push(submission);
      }
    }

    for (const request of passwordResetRequests) {
      if (
        this.isPasswordResetRequest(request) &&
        !this.passwordResetRequests.some((item) => item.id === request.id)
      ) {
        this.passwordResetRequests.push(request);
      }
    }

    for (const registration of pendingRegistrations) {
      if (
        this.isStoredPendingRegistration(registration) &&
        !this.pendingRegistrations.has(registration.id)
      ) {
        this.pendingRegistrations.set(registration.id, {
          ...registration,
          role: normalizeUserRole(registration.role),
          username: normalizeUsername(registration.username),
          email: normalizeEmail(registration.email),
          phone: normalizePhoneNumber(registration.phone) || registration.phone,
        });
      }
    }

    for (const coupon of celebrityCoupons) {
      if (
        this.isStoredCelebrityCoupon(coupon) &&
        !this.celebrityCoupons.some(
          (item) =>
            item.id === coupon.id ||
            this.normalizeCelebrityCouponCode(item.couponCode) ===
              this.normalizeCelebrityCouponCode(coupon.couponCode),
        )
      ) {
        this.celebrityCoupons.push({
          ...coupon,
          couponCode: this.normalizeCelebrityCouponCode(coupon.couponCode),
          status: this.normalizeCelebrityCouponStatus(coupon.status),
        });
      }
    }

    for (const challenge of emailVerificationChallenges) {
      if (
        this.isStoredEmailVerificationChallenge(challenge) &&
        !this.emailVerificationChallenges.some(
          (item) => item.id === challenge.id,
        )
      ) {
        this.emailVerificationChallenges.push(challenge);
      }
    }

    for (const challenge of phoneVerificationChallenges) {
      if (
        this.isStoredPhoneVerificationChallenge(challenge) &&
        !this.phoneVerificationChallenges.some((item) => item.id === challenge.id)
      ) {
        this.phoneVerificationChallenges.push(challenge);
      }
    }

    for (const submission of paymentSubmissions) {
      if (
        this.isStoredPaymentSubmission(submission) &&
        !this.paymentSubmissions.some((item) => item.id === submission.id)
      ) {
        this.paymentSubmissions.push(submission);
      }
    }

    for (const submission of withdrawalSubmissions) {
      if (
        this.isStoredWithdrawalSubmission(submission) &&
        !this.withdrawalSubmissions.some((item) => item.id === submission.id)
      ) {
        this.withdrawalSubmissions.push(submission);
      }
    }

    for (const submission of kycSubmissions) {
      if (
        this.isStoredKycSubmission(submission) &&
        !this.kycSubmissions.some((item) => item.id === submission.id)
      ) {
        this.kycSubmissions.push(submission);
      }
    }

    for (const entry of rateLimitBuckets) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        continue;
      }

      const [bucketKey, bucket] = entry;
      if (
        typeof bucketKey === 'string' &&
        this.isStoredRateLimitBucket(bucket)
      ) {
        this.rateLimitBuckets.set(bucketKey, bucket);
      }
    }
  }

  private saveState() {
    try {
      mkdirSync(dirname(this.storagePath), { recursive: true });

      const payload: PersistedPlatformState = {
        users: Array.from(this.users.values()),
        sessions: Array.from(this.sessions.entries()),
        dashboardAccounts: Array.from(this.dashboardAccounts.values()).map((item) =>
          this.cloneDashboardAccount(item),
        ),
        contactSubmissions: [...this.contactSubmissions],
        passwordResetRequests: [...this.passwordResetRequests],
        pendingRegistrations: Array.from(this.pendingRegistrations.values()).map(
          (item) => ({
            ...item,
          }),
        ),
        celebrityCoupons: this.celebrityCoupons.map((item) => ({
          ...item,
        })),
        emailVerificationChallenges: this.emailVerificationChallenges.map(
          (item) => ({
            ...item,
          }),
        ),
        phoneVerificationChallenges: this.phoneVerificationChallenges.map(
          (item) => ({
            ...item,
          }),
        ),
        paymentSubmissions: this.paymentSubmissions.map((item) => ({
          ...item,
        })),
        withdrawalSubmissions: this.withdrawalSubmissions.map((item) => ({
          ...item,
        })),
        kycSubmissions: this.kycSubmissions.map((item) => ({
          ...item,
        })),
        rateLimitBuckets: Array.from(this.rateLimitBuckets.entries()),
      };

      writeFileSync(this.storagePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (error) {
      this.logger.error(
        `Unable to persist platform state at ${this.storagePath}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  private pruneExpiredSessions(): boolean {
    let removed = false;
    const now = Date.now();

    for (const [tokenHash, session] of this.sessions.entries()) {
      if (new Date(session.expiresAt).getTime() > now) {
        continue;
      }

      this.sessions.delete(tokenHash);
      removed = true;
    }

    return removed;
  }

  private pruneExpiredRateLimitBuckets(): boolean {
    let removed = false;
    const now = Date.now();

    for (const [bucketKey, bucket] of this.rateLimitBuckets.entries()) {
      if (new Date(bucket.resetAt).getTime() > now) {
        continue;
      }

      this.rateLimitBuckets.delete(bucketKey);
      removed = true;
    }

    return removed;
  }

  private buildDefaultDashboardAccount(user: StoredUser): DashboardAccount {
    const createdAt = user.createdAt || new Date().toISOString();
    const isAdmin = user.role === 'admin';
    const celebrityRewardBonus = isAdmin ? 0 : buildCelebrityRewardBonusAmount();
    const statementEntries: DashboardStatementEntry[] = [
      {
        id: randomUUID(),
        kind: 'account_created',
        title: isAdmin ? 'Admin account created' : 'Account created',
        description: isAdmin
          ? 'Your Novabit admin account is ready.'
          : 'Your Novabit trading account is ready.',
        amount: null,
        status: 'completed',
        createdAt,
      },
    ];

    if (celebrityRewardBonus > 0) {
      statementEntries.unshift({
        id: randomUUID(),
        kind: 'bonus',
        title: 'Celebrity reward bonus',
        description:
          'Your signup reward bonus was credited to your Novabit account balance.',
        amount: celebrityRewardBonus,
        status: 'completed',
        createdAt,
      });
    }

    if (user.couponAccepted && user.coupon) {
      statementEntries.unshift({
        id: randomUUID(),
        kind: 'bonus',
        title: 'Coupon linked',
        description: `Celebrity coupon ${user.coupon.toUpperCase()} was attached to this account.`,
        amount: 0,
        status: 'completed',
        createdAt,
      });
    }

    return {
      userId: user.id,
      accountRole: isAdmin ? 'Admin Console' : 'Trading Account',
      accountState: isAdmin
        ? 'Admin access enabled'
        : this.getDashboardAccountState(this.normalizeAccountStatus(user.accountStatus)),
      verificationStatus: 'unverified',
      walletConnected: false,
      accountBalance: celebrityRewardBonus,
      totalProfit: 0,
      totalDeposit: 0,
      totalWithdrawal: 0,
      bonusBalance: celebrityRewardBonus,
      demoBalance: isAdmin ? 0 : 100000,
      activePlans: 0,
      pendingItems: 0,
      referralCode: `NOVA-${user.username.toUpperCase()}`,
      referralRatePercent: 5,
      statementEntries,
      tradeRecords: [],
      portfolioPositions: [],
      updatedAt: createdAt,
    };
  }

  private cloneDashboardAccount(value: DashboardAccount): DashboardAccount {
    return {
      ...value,
      statementEntries: value.statementEntries.map((entry) => ({ ...entry })),
      tradeRecords: value.tradeRecords.map((trade) => ({ ...trade })),
      portfolioPositions: value.portfolioPositions.map((position) => ({
        ...position,
      })),
    };
  }

  private syncPlanInterestForUser(
    dashboard: DashboardAccount,
    userId: string,
  ): boolean {
    const sync = syncDashboardAccountPlanInterest(
      dashboard,
      this.paymentSubmissions.filter(
        (submission) => submission.userId === userId,
      ),
    );

    if (!sync.changed) {
      return false;
    }

    const existingSourceKeys = new Set(
      dashboard.statementEntries
        .map((entry) => entry.sourceKey)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    );

    sync.credits.forEach((credit) => {
      if (existingSourceKeys.has(credit.sourceKey)) {
        return;
      }

      dashboard.statementEntries.unshift({
        id: randomUUID(),
        sourceKey: credit.sourceKey,
        kind: 'bonus',
        title: 'Daily interest credited',
        description: `${credit.planName} daily interest for day ${credit.accruedDay} of ${credit.cycleDays} was added to your available balance.`,
        amount: credit.amount,
        status: 'completed',
        createdAt: credit.createdAt,
        emailDeliveredAt: null,
      });
      existingSourceKeys.add(credit.sourceKey);
    });
    dashboard.statementEntries = dashboard.statementEntries
      .slice()
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      )
      .slice(0, 20);
    dashboard.totalProfit = sync.totalProfit;
    dashboard.accountBalance = sync.accountBalance;
    dashboard.activePlans = sync.activePlans;
    dashboard.updatedAt = sync.updatedAt;
    return true;
  }

  private toPaymentSubmission(
    value: StoredPaymentSubmission,
  ): PaymentSubmission {
    const { statementEntryId: _statementEntryId, ...submission } = value;
    const user = this.users.get(submission.userId);
    return {
      ...submission,
      userUsername: user ? user.username : submission.userUsername ?? null,
      userPhone: user ? user.phone : submission.userPhone ?? null,
      userCountry: user ? user.country : submission.userCountry ?? null,
      userCreatedAt: user ? user.createdAt : submission.userCreatedAt ?? null,
    };
  }

  private toWithdrawalSubmission(
    value: StoredWithdrawalSubmission,
  ): WithdrawalSubmission {
    const { statementEntryId: _statementEntryId, ...submission } = value;
    const user = this.users.get(submission.userId);
    return {
      ...submission,
      userUsername: user ? user.username : submission.userUsername ?? null,
      userPhone: user ? user.phone : submission.userPhone ?? null,
      userCountry: user ? user.country : submission.userCountry ?? null,
      userCreatedAt: user ? user.createdAt : submission.userCreatedAt ?? null,
    };
  }

  private toKycSubmission(value: StoredKycSubmission): KycSubmission {
    const { statementEntryId: _statementEntryId, ...submission } = value;
    const user = this.users.get(submission.userId);
    return {
      ...submission,
      userUsername: user ? user.username : submission.userUsername ?? null,
      userPhone: user ? user.phone : submission.userPhone ?? null,
      userCountry: user ? user.country : submission.userCountry ?? null,
      userCreatedAt: user ? user.createdAt : submission.userCreatedAt ?? null,
    };
  }

  private formatWithdrawalMethodLabel(
    method: WithdrawalSubmission['withdrawalMethod'],
  ) {
    if (method === 'bank') {
      return 'Bank transfer';
    }

    if (method === 'wire') {
      return 'Wire transfer';
    }

    return 'Crypto wallet';
  }

  private ensureCelebrityCouponSeed() {
    const defaultCode = 'LAMALAMA';
    if (
      this.celebrityCoupons.some(
        (coupon) =>
          this.normalizeCelebrityCouponCode(coupon.couponCode) === defaultCode,
      )
    ) {
      return;
    }

    this.celebrityCoupons.unshift({
      id: randomUUID(),
      celebrityName: 'Lama Lama',
      couponCode: defaultCode,
      offerDetails: 'Legacy celebrity onboarding coupon.',
      status: 'active',
      expiresAt: null,
      maxRedemptions: null,
      createdAt: new Date().toISOString(),
      createdBy: 'System seed',
    });
    this.saveState();
  }

  private normalizeCelebrityCouponCode(value: unknown) {
    if (typeof value !== 'string') {
      return '';
    }

    return value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');
  }

  private normalizeCelebrityCouponStatus(
    value: unknown,
  ): CelebrityCouponStatus {
    return value === 'inactive' ? 'inactive' : 'active';
  }

  private normalizeCelebrityCouponExpiry(value: unknown) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }

    const normalized = new Date(value.trim());
    if (Number.isNaN(normalized.getTime())) {
      throw new PlatformStoreConflictError(
        'Coupon expiry must be a valid future date.',
      );
    }

    if (normalized.getTime() <= Date.now()) {
      throw new PlatformStoreConflictError(
        'Coupon expiry must be set in the future.',
      );
    }

    return normalized.toISOString();
  }

  private normalizeCelebrityCouponMaxRedemptions(value: unknown) {
    if (value == null || value === '') {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1_000_000) {
      throw new PlatformStoreConflictError(
        'Max redemptions must be a whole number between 1 and 1000000.',
      );
    }

    return parsed;
  }

  private getCouponRedemptionMetrics(couponCode: string) {
    let currentRedemptions = 0;
    let lastRedeemedAt: string | null = null;

    for (const user of this.users.values()) {
      if (
        !user.couponAccepted ||
        this.normalizeCelebrityCouponCode(user.coupon) !== couponCode
      ) {
        continue;
      }

      currentRedemptions += 1;
      if (
        typeof user.createdAt === 'string' &&
        (!lastRedeemedAt ||
          new Date(user.createdAt).getTime() >
            new Date(lastRedeemedAt).getTime())
      ) {
        lastRedeemedAt = user.createdAt;
      }
    }

    return {
      currentRedemptions,
      lastRedeemedAt,
    };
  }

  private isCelebrityCouponExpired(coupon: StoredCelebrityCoupon) {
    if (!coupon.expiresAt) {
      return false;
    }

    return new Date(coupon.expiresAt).getTime() <= Date.now();
  }

  private getRedeemableCelebrityCoupon(code: string) {
    const normalizedCode = this.normalizeCelebrityCouponCode(code);
    const coupon = this.celebrityCoupons.find(
      (item) => this.normalizeCelebrityCouponCode(item.couponCode) === normalizedCode,
    );

    if (!coupon || coupon.status !== 'active' || this.isCelebrityCouponExpired(coupon)) {
      return null;
    }

    const metrics = this.getCouponRedemptionMetrics(normalizedCode);
    if (
      typeof coupon.maxRedemptions === 'number' &&
      metrics.currentRedemptions >= coupon.maxRedemptions
    ) {
      return null;
    }

    return coupon;
  }

  private toCelebrityCoupon(coupon: StoredCelebrityCoupon): CelebrityCoupon {
    const normalizedCode = this.normalizeCelebrityCouponCode(coupon.couponCode);
    const metrics = this.getCouponRedemptionMetrics(normalizedCode);
    const remainingRedemptions =
      typeof coupon.maxRedemptions === 'number'
        ? Math.max(coupon.maxRedemptions - metrics.currentRedemptions, 0)
        : null;

    return {
      ...coupon,
      couponCode: normalizedCode,
      status: this.normalizeCelebrityCouponStatus(coupon.status),
      currentRedemptions: metrics.currentRedemptions,
      remainingRedemptions,
      lastRedeemedAt: metrics.lastRedeemedAt,
    };
  }

  private isStoredCelebrityCoupon(value: unknown): value is StoredCelebrityCoupon {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const coupon = value as Partial<StoredCelebrityCoupon>;
    return (
      typeof coupon.id === 'string' &&
      typeof coupon.celebrityName === 'string' &&
      typeof coupon.couponCode === 'string' &&
      (typeof coupon.offerDetails === 'string' || coupon.offerDetails === null) &&
      (coupon.status === 'active' || coupon.status === 'inactive') &&
      (typeof coupon.expiresAt === 'string' || coupon.expiresAt === null) &&
      (typeof coupon.maxRedemptions === 'number' ||
        coupon.maxRedemptions === null) &&
      typeof coupon.createdAt === 'string' &&
      typeof coupon.createdBy === 'string'
    );
  }

  private isStoredUser(value: unknown): value is StoredUser {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const user = value as Partial<StoredUser>;
    return (
      typeof user.id === 'string' &&
      typeof user.username === 'string' &&
      (typeof user.role === 'string' || typeof user.role === 'undefined') &&
      typeof user.name === 'string' &&
      typeof user.email === 'string' &&
      (typeof user.emailVerified === 'boolean' ||
        typeof user.emailVerified === 'undefined') &&
      typeof user.phone === 'string' &&
      (typeof user.phoneVerified === 'boolean' ||
        typeof user.phoneVerified === 'undefined') &&
      typeof user.country === 'string' &&
      (typeof user.coupon === 'string' || user.coupon === null) &&
      typeof user.couponAccepted === 'boolean' &&
      (typeof user.accountStatus === 'string' ||
        typeof user.accountStatus === 'undefined') &&
      typeof user.createdAt === 'string' &&
      typeof user.passwordHash === 'string' &&
      typeof user.passwordSalt === 'string'
    );
  }

  private isStoredSession(value: unknown): value is StoredSession {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const session = value as Partial<StoredSession>;
    return (
      typeof session.id === 'string' &&
      typeof session.userId === 'string' &&
      typeof session.expiresAt === 'string' &&
      typeof session.remember === 'boolean'
    );
  }

  private isDashboardStatementEntry(
    value: unknown,
  ): value is DashboardStatementEntry {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const entry = value as Partial<DashboardStatementEntry>;
    return (
      typeof entry.id === 'string' &&
      typeof entry.kind === 'string' &&
      typeof entry.title === 'string' &&
      typeof entry.description === 'string' &&
      (typeof entry.amount === 'number' || entry.amount === null) &&
      typeof entry.status === 'string' &&
      typeof entry.createdAt === 'string'
    );
  }

  private isDashboardTradeRecord(
    value: unknown,
  ): value is DashboardTradeRecord {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const trade = value as Partial<DashboardTradeRecord>;
    return (
      typeof trade.id === 'string' &&
      typeof trade.assetSymbol === 'string' &&
      typeof trade.assetName === 'string' &&
      typeof trade.side === 'string' &&
      typeof trade.amount === 'number' &&
      typeof trade.status === 'string' &&
      typeof trade.openedAt === 'string'
    );
  }

  private isDashboardPortfolioPosition(
    value: unknown,
  ): value is DashboardPortfolioPosition {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const position = value as Partial<DashboardPortfolioPosition>;
    return (
      typeof position.id === 'string' &&
      typeof position.assetSymbol === 'string' &&
      typeof position.assetName === 'string' &&
      typeof position.allocationUsd === 'number' &&
      typeof position.status === 'string' &&
      typeof position.pnl === 'number' &&
      typeof position.openedAt === 'string'
    );
  }

  private isDashboardAccount(value: unknown): value is DashboardAccount {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const account = value as Partial<DashboardAccount>;
    return (
      typeof account.userId === 'string' &&
      typeof account.accountRole === 'string' &&
      typeof account.accountState === 'string' &&
      typeof account.verificationStatus === 'string' &&
      typeof account.walletConnected === 'boolean' &&
      typeof account.accountBalance === 'number' &&
      typeof account.totalProfit === 'number' &&
      typeof account.totalDeposit === 'number' &&
      typeof account.totalWithdrawal === 'number' &&
      typeof account.bonusBalance === 'number' &&
      typeof account.demoBalance === 'number' &&
      typeof account.activePlans === 'number' &&
      typeof account.pendingItems === 'number' &&
      typeof account.referralCode === 'string' &&
      typeof account.referralRatePercent === 'number' &&
      Array.isArray(account.statementEntries) &&
      account.statementEntries.every((entry) =>
        this.isDashboardStatementEntry(entry),
      ) &&
      Array.isArray(account.tradeRecords) &&
      account.tradeRecords.every((trade) => this.isDashboardTradeRecord(trade)) &&
      Array.isArray(account.portfolioPositions) &&
      account.portfolioPositions.every((position) =>
        this.isDashboardPortfolioPosition(position),
      ) &&
      typeof account.updatedAt === 'string'
    );
  }

  private isStoredPaymentSubmission(
    value: unknown,
  ): value is StoredPaymentSubmission {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const submission = value as Partial<StoredPaymentSubmission>;
    return (
      typeof submission.id === 'string' &&
      typeof submission.reference === 'string' &&
      typeof submission.userId === 'string' &&
      typeof submission.userName === 'string' &&
      typeof submission.userEmail === 'string' &&
      typeof submission.planKey === 'string' &&
      typeof submission.planName === 'string' &&
      typeof submission.fundingMethod === 'string' &&
      typeof submission.amount === 'number' &&
      (typeof submission.assetKey === 'string' || submission.assetKey === null) &&
      (typeof submission.assetSymbol === 'string' ||
        submission.assetSymbol === null) &&
      (typeof submission.assetName === 'string' || submission.assetName === null) &&
      (typeof submission.network === 'string' || submission.network === null) &&
      (typeof submission.routeAddress === 'string' ||
        submission.routeAddress === null) &&
      typeof submission.proofImageDataUrl === 'string' &&
      typeof submission.proofFileName === 'string' &&
      typeof submission.proofMimeType === 'string' &&
      (typeof submission.proofNote === 'string' || submission.proofNote === null) &&
      typeof submission.status === 'string' &&
      typeof submission.createdAt === 'string' &&
      (typeof submission.reviewedAt === 'string' || submission.reviewedAt === null) &&
      (typeof submission.reviewedBy === 'string' || submission.reviewedBy === null) &&
      (typeof submission.reviewNote === 'string' || submission.reviewNote === null) &&
      typeof submission.statementEntryId === 'string'
    );
  }

  private isStoredWithdrawalSubmission(
    value: unknown,
  ): value is StoredWithdrawalSubmission {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const submission = value as Partial<StoredWithdrawalSubmission>;
    return (
      typeof submission.id === 'string' &&
      typeof submission.reference === 'string' &&
      typeof submission.userId === 'string' &&
      typeof submission.userName === 'string' &&
      typeof submission.userEmail === 'string' &&
      typeof submission.withdrawalMethod === 'string' &&
      typeof submission.amount === 'number' &&
      typeof submission.estimatedFee === 'number' &&
      typeof submission.netAmount === 'number' &&
      (typeof submission.assetKey === 'string' || submission.assetKey === null) &&
      (typeof submission.assetSymbol === 'string' ||
        submission.assetSymbol === null) &&
      (typeof submission.assetName === 'string' || submission.assetName === null) &&
      (typeof submission.network === 'string' || submission.network === null) &&
      (typeof submission.walletAddress === 'string' ||
        submission.walletAddress === null) &&
      (typeof submission.walletLabel === 'string' ||
        submission.walletLabel === null) &&
      (typeof submission.bankHolder === 'string' ||
        submission.bankHolder === null) &&
      (typeof submission.bankName === 'string' || submission.bankName === null) &&
      (typeof submission.bankRouting === 'string' ||
        submission.bankRouting === null) &&
      (typeof submission.bankAccount === 'string' ||
        submission.bankAccount === null) &&
      (typeof submission.bankCountry === 'string' ||
        submission.bankCountry === null) &&
      (typeof submission.wireBeneficiary === 'string' ||
        submission.wireBeneficiary === null) &&
      (typeof submission.wireBankName === 'string' ||
        submission.wireBankName === null) &&
      (typeof submission.wireSwift === 'string' ||
        submission.wireSwift === null) &&
      (typeof submission.wireIban === 'string' || submission.wireIban === null) &&
      (typeof submission.wireCountry === 'string' ||
        submission.wireCountry === null) &&
      (typeof submission.wireNote === 'string' || submission.wireNote === null) &&
      typeof submission.status === 'string' &&
      typeof submission.createdAt === 'string' &&
      (typeof submission.reviewedAt === 'string' ||
        submission.reviewedAt === null) &&
      (typeof submission.reviewedBy === 'string' ||
        submission.reviewedBy === null) &&
      (typeof submission.reviewNote === 'string' ||
        submission.reviewNote === null) &&
      typeof submission.statementEntryId === 'string'
    );
  }

  private isStoredKycSubmission(value: unknown): value is StoredKycSubmission {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const submission = value as Partial<StoredKycSubmission>;
    return (
      typeof submission.id === 'string' &&
      typeof submission.reference === 'string' &&
      typeof submission.userId === 'string' &&
      typeof submission.userName === 'string' &&
      typeof submission.userEmail === 'string' &&
      typeof submission.email === 'string' &&
      typeof submission.phone === 'string' &&
      typeof submission.firstName === 'string' &&
      (typeof submission.middleName === 'string' ||
        submission.middleName === null) &&
      typeof submission.lastName === 'string' &&
      typeof submission.countryOfOrigin === 'string' &&
      typeof submission.documentType === 'string' &&
      typeof submission.documentImageDataUrl === 'string' &&
      typeof submission.documentFileName === 'string' &&
      typeof submission.documentMimeType === 'string' &&
      typeof submission.status === 'string' &&
      typeof submission.createdAt === 'string' &&
      (typeof submission.reviewedAt === 'string' ||
        submission.reviewedAt === null) &&
      (typeof submission.reviewedBy === 'string' ||
        submission.reviewedBy === null) &&
      (typeof submission.reviewNote === 'string' ||
        submission.reviewNote === null) &&
      typeof submission.statementEntryId === 'string'
    );
  }

  private isContactSubmission(value: unknown): value is ContactSubmission {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const submission = value as Partial<ContactSubmission>;
    return (
      typeof submission.id === 'string' &&
      typeof submission.reference === 'string' &&
      typeof submission.topic === 'string' &&
      typeof submission.name === 'string' &&
      typeof submission.email === 'string' &&
      typeof submission.message === 'string' &&
      typeof submission.createdAt === 'string'
    );
  }

  private isPasswordResetRequest(
    value: unknown,
  ): value is PasswordResetRequest {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const request = value as Partial<PasswordResetRequest>;
    return (
      typeof request.id === 'string' &&
      typeof request.reference === 'string' &&
      typeof request.email === 'string' &&
      typeof request.createdAt === 'string'
    );
  }

  private isStoredPendingRegistration(
    value: unknown,
  ): value is StoredPendingRegistration {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const registration = value as Partial<StoredPendingRegistration>;
    return (
      typeof registration.id === 'string' &&
      typeof registration.username === 'string' &&
      typeof registration.role === 'string' &&
      typeof registration.name === 'string' &&
      typeof registration.email === 'string' &&
      typeof registration.phone === 'string' &&
      typeof registration.country === 'string' &&
      (typeof registration.coupon === 'string' || registration.coupon === null) &&
      (registration.verificationChannel === 'email' ||
        registration.verificationChannel === 'phone') &&
      typeof registration.expiresAt === 'string' &&
      typeof registration.createdAt === 'string' &&
      typeof registration.passwordHash === 'string' &&
      typeof registration.passwordSalt === 'string' &&
      typeof registration.verificationCodeHash === 'string' &&
      typeof registration.verificationExpiresAt === 'string' &&
      typeof registration.verificationCreatedAt === 'string'
    );
  }

  private isStoredEmailVerificationChallenge(
    value: unknown,
  ): value is StoredEmailVerificationChallenge {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const challenge = value as Partial<StoredEmailVerificationChallenge>;
    return (
      typeof challenge.id === 'string' &&
      typeof challenge.userId === 'string' &&
      typeof challenge.email === 'string' &&
      typeof challenge.codeHash === 'string' &&
      typeof challenge.expiresAt === 'string' &&
      typeof challenge.createdAt === 'string' &&
      (typeof challenge.consumedAt === 'string' ||
        challenge.consumedAt === null)
    );
  }

  private isStoredPhoneVerificationChallenge(
    value: unknown,
  ): value is StoredPhoneVerificationChallenge {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const challenge = value as Partial<StoredPhoneVerificationChallenge>;
    return (
      typeof challenge.id === 'string' &&
      typeof challenge.userId === 'string' &&
      typeof challenge.phone === 'string' &&
      typeof challenge.codeHash === 'string' &&
      typeof challenge.expiresAt === 'string' &&
      typeof challenge.createdAt === 'string' &&
      (typeof challenge.consumedAt === 'string' ||
        challenge.consumedAt === null)
    );
  }

  private isStoredRateLimitBucket(
    value: unknown,
  ): value is StoredRateLimitBucket {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const bucket = value as Partial<StoredRateLimitBucket>;
    return (
      typeof bucket.scope === 'string' &&
      typeof bucket.key === 'string' &&
      typeof bucket.count === 'number' &&
      typeof bucket.resetAt === 'string'
    );
  }

  private toPublicUser(user: StoredUser): PublicUser {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
      phone: user.phone,
      phoneVerified: Boolean(user.phoneVerified),
      country: user.country,
      coupon: user.coupon,
      couponAccepted: user.couponAccepted,
      accountStatus: this.normalizeAccountStatus(user.accountStatus),
      createdAt: user.createdAt,
    };
  }

  private revokeSessionsForUser(userId: string) {
    for (const [tokenHash, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(tokenHash);
      }
    }
  }

  private normalizeAccountStatus(value: unknown): AccountStatus {
    if (value === 'suspended' || value === 'deactivated') {
      return value;
    }

    return 'active';
  }

  private getDashboardAccountState(status: AccountStatus) {
    if (status === 'suspended') {
      return 'Account suspended by admin';
    }

    if (status === 'deactivated') {
      return 'Account deactivated by admin';
    }

    return 'Session active';
  }

  private getAccountStatusEntryTitle(status: AccountStatus) {
    if (status === 'suspended') {
      return 'Account suspended';
    }

    if (status === 'deactivated') {
      return 'Account deactivated';
    }

    return 'Account activated';
  }

  private getAccountStatusEntryDescription(status: AccountStatus) {
    if (status === 'suspended') {
      return 'Admin suspended this account. Sign-in is blocked until the account is reactivated.';
    }

    if (status === 'deactivated') {
      return 'Admin deactivated this account. Sign-in is blocked until the account is activated again.';
    }

    return 'Admin reactivated this account. Dashboard access is available again.';
  }

  private ensureAdminSeed() {
    const profile = readAdminSeedProfile();
    const normalizedUsername = normalizeUsername(profile.username);
    const normalizedEmail = normalizeEmail(profile.email);
    const existingUserId =
      this.usersByUsername.get(normalizedUsername) ??
      this.usersByEmail.get(normalizedEmail);

    if (existingUserId) {
      const existingUser = this.users.get(existingUserId);
      if (existingUser && existingUser.role !== 'admin') {
        existingUser.role = 'admin';
        existingUser.emailVerified = true;
        existingUser.phoneVerified = true;
        existingUser.accountStatus = 'active';
        this.users.set(existingUser.id, existingUser);
        this.usersByPhone.set(existingUser.phone, existingUser.id);
        this.dashboardAccounts.delete(existingUser.id);
        this.saveState();
      }
      return;
    }

    const { passwordHash, passwordSalt } = hashPassword(profile.password);
    const createdAt = new Date().toISOString();
    const storedUser: StoredUser = {
      id: randomUUID(),
      username: normalizedUsername,
      role: 'admin',
      name: profile.name,
      email: normalizedEmail,
      emailVerified: true,
      phone: normalizePhoneNumber(profile.phone) || profile.phone,
      phoneVerified: true,
      country: profile.country,
      coupon: null,
      couponAccepted: false,
      accountStatus: 'active',
      createdAt,
      passwordHash,
      passwordSalt,
    };

    this.users.set(storedUser.id, storedUser);
    this.usersByUsername.set(storedUser.username, storedUser.id);
    this.usersByEmail.set(storedUser.email, storedUser.id);
    this.usersByPhone.set(storedUser.phone, storedUser.id);
    this.dashboardAccounts.delete(storedUser.id);
    this.saveState();
  }
}

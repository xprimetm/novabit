import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolConfig, type PoolClient } from 'pg';
import {
  PlatformStoreConflictError,
  PlatformStoreUnavailableError,
} from './platform-store.errors';
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
  toIsoString,
  verifyPassword,
} from './platform-store.utils';
import { syncDashboardAccountPlanInterest } from './plan-interest';

type UserRow = {
  id: string;
  username: string;
  role: string;
  name: string;
  email: string;
  email_verified: boolean;
  phone: string;
  phone_verified: boolean;
  country: string;
  coupon: string | null;
  coupon_accepted: boolean;
  account_status: string;
  password_hash: string;
  password_salt: string;
  created_at: Date | string;
};

type ContactSubmissionRow = {
  id: string;
  reference: string;
  topic: string;
  name: string;
  email: string;
  message: string;
  created_at: Date | string;
};

type PasswordResetRequestRow = {
  id: string;
  reference: string;
  email: string;
  created_at: Date | string;
};

type PendingRegistrationRow = {
  id: string;
  username: string;
  role: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  coupon: string | null;
  password_hash: string;
  password_salt: string;
  verification_channel: string;
  verification_code_hash: string;
  verification_expires_at: Date | string;
  expires_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
};

type EmailVerificationCodeRow = {
  id: string;
  user_id: string;
  email: string;
  code_hash: string;
  expires_at: Date | string;
  consumed_at: Date | string | null;
  created_at: Date | string;
};

type PhoneVerificationCodeRow = {
  id: string;
  user_id: string;
  phone: string;
  code_hash: string;
  expires_at: Date | string;
  consumed_at: Date | string | null;
  created_at: Date | string;
};

type SessionRow = {
  id: string;
  expires_at: Date | string;
  remember: boolean;
};

type DashboardAccountRow = {
  user_id: string;
  account_role: string;
  account_state: string;
  verification_status: string;
  wallet_connected: boolean;
  account_balance: number | string;
  total_profit: number | string;
  total_deposit: number | string;
  total_withdrawal: number | string;
  bonus_balance: number | string;
  demo_balance: number | string;
  active_plans: number;
  pending_items: number;
  referral_code: string;
  referral_rate_percent: number | string;
  updated_at: Date | string;
};

type AdminUserProfileRow = {
  id: string;
  username: string;
  role: string;
  name: string;
  email: string;
  email_verified: boolean;
  phone: string;
  phone_verified: boolean;
  country: string;
  coupon: string | null;
  coupon_accepted: boolean;
  account_status: string;
  created_at: Date | string;
  verification_status: string | null;
  account_state: string | null;
  account_balance: number | string | null;
  total_deposit: number | string | null;
  total_withdrawal: number | string | null;
  total_profit: number | string | null;
  bonus_balance: number | string | null;
  active_plans: number | null;
  pending_items: number | null;
  approved_deposit_count: number | string | null;
  approved_deposit_total: number | string | null;
  last_deposit_at: Date | string | null;
};

type DashboardStatementEntryRow = {
  id: string;
  source_key: string | null;
  kind: string;
  title: string;
  description: string;
  amount: number | string | null;
  status: string;
  email_delivered_at: Date | string | null;
  created_at: Date | string;
};

type DashboardTradeRecordRow = {
  id: string;
  asset_symbol: string;
  asset_name: string;
  side: string;
  amount: number | string;
  status: string;
  opened_at: Date | string;
};

type DashboardPortfolioPositionRow = {
  id: string;
  asset_symbol: string;
  asset_name: string;
  allocation_usd: number | string;
  status: string;
  pnl: number | string;
  opened_at: Date | string;
};

type RateLimitBucketRow = {
  count: number;
  reset_at: Date | string;
};

type PaymentSubmissionRow = {
  id: string;
  reference: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_username?: string | null;
  user_phone?: string | null;
  user_country?: string | null;
  user_created_at?: Date | string | null;
  plan_key: string;
  plan_name: string;
  funding_method: string;
  amount: number | string;
  asset_key: string | null;
  asset_symbol: string | null;
  asset_name: string | null;
  network: string | null;
  route_address: string | null;
  proof_image_data_url: string;
  proof_file_name: string;
  proof_mime_type: string;
  proof_note: string | null;
  status: string;
  reviewed_at: Date | string | null;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: Date | string;
};

type PaymentSubmissionAccrualRow = {
  id: string;
  plan_key: string;
  plan_name: string;
  amount: number | string;
  status: string;
  created_at: Date | string;
  reviewed_at: Date | string | null;
};

type WithdrawalSubmissionRow = {
  id: string;
  reference: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_username?: string | null;
  user_phone?: string | null;
  user_country?: string | null;
  user_created_at?: Date | string | null;
  withdrawal_method: string;
  amount: number | string;
  estimated_fee: number | string;
  net_amount: number | string;
  asset_key: string | null;
  asset_symbol: string | null;
  asset_name: string | null;
  network: string | null;
  wallet_address: string | null;
  wallet_label: string | null;
  bank_holder: string | null;
  bank_name: string | null;
  bank_routing: string | null;
  bank_account: string | null;
  bank_country: string | null;
  wire_beneficiary: string | null;
  wire_bank_name: string | null;
  wire_swift: string | null;
  wire_iban: string | null;
  wire_country: string | null;
  wire_note: string | null;
  status: string;
  reviewed_at: Date | string | null;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: Date | string;
};

type KycSubmissionRow = {
  id: string;
  reference: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_username?: string | null;
  user_phone?: string | null;
  user_country?: string | null;
  user_created_at?: Date | string | null;
  email: string;
  phone: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  country_of_origin: string;
  document_type: string;
  document_image_data_url: string;
  document_file_name: string;
  document_mime_type: string;
  status: string;
  reviewed_at: Date | string | null;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: Date | string;
};

type CelebrityCouponRow = {
  id: string;
  celebrity_name: string;
  coupon_code: string;
  offer_details: string | null;
  status: string;
  expires_at: Date | string | null;
  max_redemptions: number | null;
  created_at: Date | string;
  created_by: string;
  current_redemptions?: number | string | null;
  last_redeemed_at?: Date | string | null;
};

type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

@Injectable()
export class PostgresPlatformStore implements PlatformStoreAdapter {
  readonly driver = 'postgres' as const;

  private readonly logger = new Logger(PostgresPlatformStore.name);
  private pool: Pool | null = null;
  private schemaReady = false;
  private lastConnectionError: string | null = null;

  isConfigured() {
    return (process.env.DATABASE_URL ?? '').trim().length > 0;
  }

  isReady() {
    return this.pool !== null && this.schemaReady;
  }

  getLastConnectionError() {
    return this.lastConnectionError;
  }

  getDatabaseState() {
    return {
      configured: this.isConfigured(),
      connected: this.isReady(),
      lastError: this.lastConnectionError,
    };
  }

  async ensureReady() {
    if (!this.isConfigured()) {
      return false;
    }

    if (this.pool && this.schemaReady) {
      return true;
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return false;
    }

    if (!this.pool) {
      this.pool = new Pool(this.buildPoolConfig(databaseUrl));
    }

    try {
      await this.pool.query('SELECT 1');
      await this.ensureSchema();
      await this.ensureCelebrityCouponSeed();
      await this.ensureAdminSeed();
      this.lastConnectionError = null;
      return true;
    } catch (error) {
      this.lastConnectionError =
        error instanceof Error ? error.message : 'Unknown PostgreSQL error.';
      this.logger.error(
        `PostgreSQL initialization failed: ${this.lastConnectionError}`,
      );
      await this.disposePool();
      this.schemaReady = false;
      return false;
    }
  }

  private async purgeExpiredPendingRegistrations(client: PoolClient) {
    await client.query(
      `DELETE FROM pending_registrations
       WHERE expires_at <= NOW()`,
    );
  }

  private async assertUserIdentityAvailable(
    client: PoolClient,
    username: string,
    email: string,
    phone: string,
  ) {
    const existingResult = await client.query<
      Pick<UserRow, 'username' | 'email' | 'phone'>
    >(
      `SELECT username, email, phone
       FROM app_users
       WHERE username = $1 OR email = $2 OR phone = $3`,
      [username, email, phone],
    );

    for (const existingUser of existingResult.rows) {
      if (existingUser.username === username) {
        throw new PlatformStoreConflictError('That username is already in use.');
      }

      if (existingUser.email === email) {
        throw new PlatformStoreConflictError(
          'That email address is already registered.',
        );
      }

      if (existingUser.phone === phone) {
        throw new PlatformStoreConflictError(
          'That phone number is already registered.',
        );
      }
    }
  }

  private async insertUserRecord(
    client: PoolClient,
    input: CreateUserInput,
  ): Promise<UserRow> {
    const username = normalizeUsername(input.username);
    const email = normalizeEmail(input.email);
    const phone = normalizePhoneNumber(input.phone);
    const coupon = this.normalizeCelebrityCouponCode(input.coupon);
    const role = normalizeUserRole(input.role);
    const providedPasswordHash =
      typeof input.passwordHash === 'string' && input.passwordHash.trim()
        ? input.passwordHash.trim()
        : null;
    const providedPasswordSalt =
      typeof input.passwordSalt === 'string' && input.passwordSalt.trim()
        ? input.passwordSalt.trim()
        : null;
    const resolvedPassword =
      typeof input.password === 'string' ? input.password : '';
    const passwordBundle =
      providedPasswordHash && providedPasswordSalt
        ? {
            passwordHash: providedPasswordHash,
            passwordSalt: providedPasswordSalt,
          }
        : resolvedPassword
          ? hashPassword(resolvedPassword)
          : null;
    const emailVerified =
      typeof input.emailVerified === 'boolean'
        ? input.emailVerified
        : role === 'admin' || !isEmailVerificationRequired();
    const phoneVerified =
      typeof input.phoneVerified === 'boolean'
        ? input.phoneVerified
        : role === 'admin' || !isEmailVerificationRequired();
    const accountStatus = this.normalizeAccountStatus(input.accountStatus);

    if (!phone) {
      throw new PlatformStoreConflictError('Enter a valid phone number.');
    }

    if (!passwordBundle) {
      throw new PlatformStoreConflictError('A valid password is required.');
    }

    await this.assertUserIdentityAvailable(client, username, email, phone);

    let couponAccepted = false;
    if (coupon) {
      const redeemableCoupon = await this.findRedeemableCelebrityCoupon(
        client,
        coupon,
        true,
      );

      if (!redeemableCoupon) {
        throw new PlatformStoreConflictError(
          'That celebrity coupon is invalid, inactive, expired, or fully redeemed.',
        );
      }

      couponAccepted = true;
    }

    const result = await client.query<UserRow>(
      `INSERT INTO app_users (
        id,
        username,
        role,
        name,
        email,
        email_verified,
        phone,
        phone_verified,
        country,
        coupon,
        coupon_accepted,
        account_status,
        password_hash,
        password_salt
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING
        id,
        username,
        role,
        name,
        email,
        email_verified,
        phone,
        phone_verified,
        country,
        coupon,
        coupon_accepted,
        account_status,
        password_hash,
        password_salt,
        created_at`,
      [
        randomUUID(),
        username,
        role,
        input.name.trim(),
        email,
        emailVerified,
        phone,
        phoneVerified,
        input.country.trim(),
        coupon || null,
        couponAccepted,
        accountStatus,
        passwordBundle.passwordHash,
        passwordBundle.passwordSalt,
      ],
    );

    const row = result.rows[0];
    if (normalizeUserRole(row.role) !== 'admin') {
      await this.ensureDashboardAccountForUser(
        client,
        row,
        buildCelebrityRewardBonusAmount(),
      );
    }

    return row;
  }

  private buildPendingRegistrationChallenge(
    row: PendingRegistrationRow,
    code: string,
  ): PendingRegistrationChallenge {
    const channel =
      row.verification_channel === 'phone' ? 'phone' : 'email';

    return {
      pendingRegistrationId: row.id,
      channel,
      destination: channel === 'phone' ? row.phone : row.email,
      code,
      expiresAt: toIsoString(row.verification_expires_at),
      createdAt: toIsoString(row.updated_at),
    };
  }

  async createUser(input: CreateUserInput): Promise<PublicUser> {
    const pool = await this.requirePool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const row = await this.insertUserRecord(client, input);
      await client.query('COMMIT');
      return this.toPublicUser(row);
    } catch (error) {
      await this.safeRollback(client);

      if (error instanceof PlatformStoreConflictError) {
        throw error;
      }

      if (this.isUniqueConstraintError(error)) {
        throw new PlatformStoreConflictError(
          'That username or email is already in use.',
        );
      }

      throw new PlatformStoreUnavailableError(
        error instanceof Error ? error.message : 'User creation failed.',
      );
    } finally {
      client.release();
    }
  }

  async createPendingRegistration(
    input: CreatePendingRegistrationInput,
  ): Promise<PendingRegistrationChallenge> {
    const pool = await this.requirePool();
    const client = await pool.connect();
    const username = normalizeUsername(input.username);
    const email = normalizeEmail(input.email);
    const phone = normalizePhoneNumber(input.phone);
    const verificationChannel =
      input.verificationChannel === 'phone' ? 'phone' : 'email';

    if (!phone) {
      throw new PlatformStoreConflictError('Enter a valid phone number.');
    }

    try {
      await client.query('BEGIN');
      await this.purgeExpiredPendingRegistrations(client);
      await this.assertUserIdentityAvailable(client, username, email, phone);

      await client.query(
        `DELETE FROM pending_registrations
         WHERE username = $1 OR email = $2 OR phone = $3`,
        [username, email, phone],
      );

      const { passwordHash, passwordSalt } = hashPassword(input.password);
      const code =
        verificationChannel === 'phone'
          ? buildPhoneVerificationCode()
          : buildEmailVerificationCode();
      const verificationExpiresAt =
        verificationChannel === 'phone'
          ? buildPhoneVerificationExpiry()
          : buildEmailVerificationExpiry();
      const verificationCodeHash =
        verificationChannel === 'phone'
          ? hashPhoneVerificationCode(phone, code)
          : hashEmailVerificationCode(email, code);
      const result = await client.query<PendingRegistrationRow>(
        `INSERT INTO pending_registrations (
          id,
          username,
          role,
          name,
          email,
          phone,
          country,
          coupon,
          password_hash,
          password_salt,
          verification_channel,
          verification_code_hash,
          verification_expires_at,
          expires_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
        RETURNING
          id,
          username,
          role,
          name,
          email,
          phone,
          country,
          coupon,
          password_hash,
          password_salt,
          verification_channel,
          verification_code_hash,
          verification_expires_at,
          expires_at,
          created_at,
          updated_at`,
        [
          randomUUID(),
          username,
          normalizeUserRole(input.role),
          input.name.trim(),
          email,
          phone,
          input.country.trim(),
          this.normalizeCelebrityCouponCode(input.coupon),
          passwordHash,
          passwordSalt,
          verificationChannel,
          verificationCodeHash,
          verificationExpiresAt,
          buildPendingRegistrationExpiry(),
        ],
      );

      await client.query('COMMIT');
      return this.buildPendingRegistrationChallenge(result.rows[0], code);
    } catch (error) {
      await this.safeRollback(client);

      if (error instanceof PlatformStoreConflictError) {
        throw error;
      }

      throw new PlatformStoreUnavailableError(
        error instanceof Error
          ? error.message
          : 'Pending registration could not be created.',
      );
    } finally {
      client.release();
    }
  }

  async resendPendingRegistrationChallenge(
    pendingRegistrationId: string,
  ): Promise<PendingRegistrationChallenge> {
    const pool = await this.requirePool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await this.purgeExpiredPendingRegistrations(client);
      const existingResult = await client.query<PendingRegistrationRow>(
        `SELECT
          id,
          username,
          role,
          name,
          email,
          phone,
          country,
          coupon,
          password_hash,
          password_salt,
          verification_channel,
          verification_code_hash,
          verification_expires_at,
          expires_at,
          created_at,
          updated_at
         FROM pending_registrations
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [pendingRegistrationId],
      );

      const existing = existingResult.rows[0];
      if (!existing) {
        throw new PlatformStoreConflictError(
          'Registration verification has expired. Start signup again.',
        );
      }

      const verificationChannel =
        existing.verification_channel === 'phone' ? 'phone' : 'email';
      const code =
        verificationChannel === 'phone'
          ? buildPhoneVerificationCode()
          : buildEmailVerificationCode();
      const verificationExpiresAt =
        verificationChannel === 'phone'
          ? buildPhoneVerificationExpiry()
          : buildEmailVerificationExpiry();
      const verificationCodeHash =
        verificationChannel === 'phone'
          ? hashPhoneVerificationCode(existing.phone, code)
          : hashEmailVerificationCode(existing.email, code);
      const updatedResult = await client.query<PendingRegistrationRow>(
        `UPDATE pending_registrations
         SET verification_code_hash = $2,
             verification_expires_at = $3,
             expires_at = $4,
             updated_at = NOW()
         WHERE id = $1
         RETURNING
          id,
          username,
          role,
          name,
          email,
          phone,
          country,
          coupon,
          password_hash,
          password_salt,
          verification_channel,
          verification_code_hash,
          verification_expires_at,
          expires_at,
          created_at,
          updated_at`,
        [
          existing.id,
          verificationCodeHash,
          verificationExpiresAt,
          buildPendingRegistrationExpiry(),
        ],
      );

      await client.query('COMMIT');
      return this.buildPendingRegistrationChallenge(
        updatedResult.rows[0],
        code,
      );
    } catch (error) {
      await this.safeRollback(client);

      if (error instanceof PlatformStoreConflictError) {
        throw error;
      }

      throw new PlatformStoreUnavailableError(
        error instanceof Error
          ? error.message
          : 'Pending registration verification could not be resent.',
      );
    } finally {
      client.release();
    }
  }

  async verifyPendingRegistration(
    pendingRegistrationId: string,
    code: string,
  ): Promise<PublicUser> {
    const pool = await this.requirePool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await this.purgeExpiredPendingRegistrations(client);

      const pendingResult = await client.query<PendingRegistrationRow>(
        `SELECT
          id,
          username,
          role,
          name,
          email,
          phone,
          country,
          coupon,
          password_hash,
          password_salt,
          verification_channel,
          verification_code_hash,
          verification_expires_at,
          expires_at,
          created_at,
          updated_at
         FROM pending_registrations
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [pendingRegistrationId],
      );

      const pending = pendingResult.rows[0];
      if (!pending) {
        throw new PlatformStoreConflictError(
          'Invalid or expired verification code.',
        );
      }

      const verificationChannel =
        pending.verification_channel === 'phone' ? 'phone' : 'email';
      const expectedHash =
        verificationChannel === 'phone'
          ? hashPhoneVerificationCode(pending.phone, code)
          : hashEmailVerificationCode(pending.email, code);

      if (
        new Date(pending.verification_expires_at).getTime() <= Date.now() ||
        pending.verification_code_hash !== expectedHash
      ) {
        throw new PlatformStoreConflictError(
          'Invalid or expired verification code.',
        );
      }

      const row = await this.insertUserRecord(client, {
        username: pending.username,
        role: normalizeUserRole(pending.role),
        name: pending.name,
        email: pending.email,
        phone: pending.phone,
        country: pending.country,
        coupon: pending.coupon,
        passwordHash: pending.password_hash,
        passwordSalt: pending.password_salt,
        emailVerified: verificationChannel === 'email',
        phoneVerified: verificationChannel === 'phone',
      });

      await client.query(
        `DELETE FROM pending_registrations
         WHERE id = $1`,
        [pending.id],
      );

      await client.query('COMMIT');
      return this.toPublicUser(row);
    } catch (error) {
      await this.safeRollback(client);

      if (error instanceof PlatformStoreConflictError) {
        throw error;
      }

      if (this.isUniqueConstraintError(error)) {
        throw new PlatformStoreConflictError(
          'That username, email address, or phone number is already in use.',
        );
      }

      throw new PlatformStoreUnavailableError(
        error instanceof Error
          ? error.message
          : 'Pending registration verification failed.',
      );
    } finally {
      client.release();
    }
  }

  async checkRegistrationAvailability(
    input: RegistrationAvailabilityInput,
  ): Promise<RegistrationAvailabilityResult> {
    const pool = await this.requirePool();
    const username =
      typeof input.username === 'string' && input.username.trim()
        ? normalizeUsername(input.username)
        : null;
    const email =
      typeof input.email === 'string' && input.email.trim()
        ? normalizeEmail(input.email)
        : null;
    const phone =
      typeof input.phone === 'string' && input.phone.trim()
        ? normalizePhoneNumber(input.phone)
        : null;
    const values: string[] = [];
    const conditions: string[] = [];

    if (username) {
      values.push(username);
      conditions.push(`username = $${values.length}`);
    }

    if (email) {
      values.push(email);
      conditions.push(`email = $${values.length}`);
    }

    if (phone) {
      values.push(phone);
      conditions.push(`phone = $${values.length}`);
    }

    if (!conditions.length) {
      return {};
    }

    const result = await pool.query<Pick<UserRow, 'username' | 'email' | 'phone'>>(
      `SELECT username, email, phone
       FROM app_users
       WHERE ${conditions.join(' OR ')}`,
      values,
    );
    const pendingResult = await pool.query<
      Pick<UserRow, 'username' | 'email' | 'phone'>
    >(
      `SELECT username, email, phone
       FROM pending_registrations
       WHERE expires_at > NOW()
         AND (${conditions.join(' OR ')})`,
      values,
    );
    const matchingRows = [...result.rows, ...pendingResult.rows];

    return {
      username: username
        ? !matchingRows.some((row) => row.username === username)
        : undefined,
      email: email
        ? !matchingRows.some((row) => row.email === email)
        : undefined,
      phone: phone
        ? !matchingRows.some((row) => row.phone === phone)
        : undefined,
    };
  }

  async validateUser(
    login: string,
    password: string,
  ): Promise<PublicUser | null> {
    const pool = await this.requirePool();
    const normalizedLogin = login.trim().toLowerCase();
    const result = await pool.query<UserRow>(
      `SELECT
        id,
        username,
        role,
        name,
        email,
        email_verified,
        phone,
        phone_verified,
        country,
        coupon,
        coupon_accepted,
        account_status,
        password_hash,
        password_salt,
        created_at
       FROM app_users
       WHERE email = $1 OR username = $1
       LIMIT 1`,
      [normalizedLogin],
    );

    const user = result.rows[0];
    if (!user) {
      return null;
    }

    if (!verifyPassword(password, user.password_hash, user.password_salt)) {
      return null;
    }

    return this.toPublicUser(user);
  }

  async createPasswordResetRequest(
    email: string,
  ): Promise<PasswordResetRequest> {
    const pool = await this.requirePool();
    const result = await pool.query<PasswordResetRequestRow>(
      `INSERT INTO password_reset_requests (id, reference, email)
       VALUES ($1, $2, $3)
       RETURNING id, reference, email, created_at`,
      [randomUUID(), buildReference('RESET'), normalizeEmail(email)],
    );

    return this.toPasswordResetRequest(result.rows[0]);
  }

  async createEmailVerificationChallenge(
    email: string,
  ): Promise<EmailVerificationChallenge> {
    const pool = await this.requirePool();
    const normalizedEmail = normalizeEmail(email);
    const userResult = await pool.query<UserRow>(
      `SELECT
        id,
        username,
        role,
        name,
        email,
        email_verified,
        phone,
        phone_verified,
        country,
        coupon,
        coupon_accepted,
        account_status,
        password_hash,
        password_salt,
        created_at
       FROM app_users
       WHERE email = $1
       LIMIT 1`,
      [normalizedEmail],
    );
    const user = userResult.rows[0];

    if (!user) {
      throw new PlatformStoreConflictError('No account matches that email.');
    }

    if (user.email_verified) {
      throw new PlatformStoreConflictError('That email is already verified.');
    }

    const code = buildEmailVerificationCode();
    const expiresAt = buildEmailVerificationExpiry();
    const result = await pool.query<EmailVerificationCodeRow>(
      `INSERT INTO email_verification_codes (
        id,
        user_id,
        email,
        code_hash,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, user_id, email, code_hash, expires_at, consumed_at, created_at`,
      [
        randomUUID(),
        user.id,
        normalizedEmail,
        hashEmailVerificationCode(normalizedEmail, code),
        expiresAt,
      ],
    );

    const challenge = result.rows[0];
    return {
      id: challenge.id,
      userId: challenge.user_id,
      email: challenge.email,
      code,
      expiresAt: toIsoString(challenge.expires_at),
      createdAt: toIsoString(challenge.created_at),
    };
  }

  async createPhoneVerificationChallenge(
    phone: string,
  ): Promise<PhoneVerificationChallenge> {
    const pool = await this.requirePool();
    const normalizedPhone = normalizePhoneNumber(phone);

    if (!normalizedPhone) {
      throw new PlatformStoreConflictError('Enter a valid phone number.');
    }

    const userResult = await pool.query<UserRow>(
      `SELECT
        id,
        username,
        role,
        name,
        email,
        email_verified,
        phone,
        phone_verified,
        country,
        coupon,
        coupon_accepted,
        account_status,
        password_hash,
        password_salt,
        created_at
       FROM app_users
       WHERE phone = $1
       LIMIT 1`,
      [normalizedPhone],
    );
    const user = userResult.rows[0];

    if (!user) {
      throw new PlatformStoreConflictError(
        'No account matches that phone number.',
      );
    }

    if (user.phone_verified) {
      throw new PlatformStoreConflictError(
        'That phone number is already verified.',
      );
    }

    const code = buildPhoneVerificationCode();
    const expiresAt = buildPhoneVerificationExpiry();
    const result = await pool.query<PhoneVerificationCodeRow>(
      `INSERT INTO phone_verification_codes (
        id,
        user_id,
        phone,
        code_hash,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, user_id, phone, code_hash, expires_at, consumed_at, created_at`,
      [
        randomUUID(),
        user.id,
        normalizedPhone,
        hashPhoneVerificationCode(normalizedPhone, code),
        expiresAt,
      ],
    );

    const challenge = result.rows[0];
    return {
      id: challenge.id,
      userId: challenge.user_id,
      phone: challenge.phone,
      code,
      expiresAt: toIsoString(challenge.expires_at),
      createdAt: toIsoString(challenge.created_at),
    };
  }

  async verifyEmailCode(email: string, code: string): Promise<PublicUser> {
    const pool = await this.requirePool();
    const client = await pool.connect();
    const normalizedEmail = normalizeEmail(email);

    try {
      await client.query('BEGIN');

      const userResult = await client.query<UserRow>(
        `SELECT
          id,
          username,
          role,
          name,
          email,
          email_verified,
          phone,
          phone_verified,
          country,
          coupon,
          coupon_accepted,
          account_status,
          password_hash,
          password_salt,
          created_at
         FROM app_users
         WHERE email = $1
         LIMIT 1
         FOR UPDATE`,
        [normalizedEmail],
      );

      const user = userResult.rows[0];
      if (!user) {
        throw new PlatformStoreConflictError('Invalid verification code.');
      }

      if (!user.email_verified) {
        const challengeResult = await client.query<EmailVerificationCodeRow>(
          `SELECT
            id,
            user_id,
            email,
            code_hash,
            expires_at,
            consumed_at,
            created_at
           FROM email_verification_codes
           WHERE email = $1
             AND user_id = $2
             AND consumed_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1
           FOR UPDATE`,
          [normalizedEmail, user.id],
        );

        const challenge = challengeResult.rows[0];
        if (
          !challenge ||
          new Date(challenge.expires_at).getTime() <= Date.now() ||
          challenge.code_hash !==
            hashEmailVerificationCode(normalizedEmail, code)
        ) {
          throw new PlatformStoreConflictError(
            'Invalid or expired verification code.',
          );
        }

        await client.query(
          `UPDATE email_verification_codes
           SET consumed_at = NOW()
           WHERE id = $1`,
          [challenge.id],
        );

        const updatedUserResult = await client.query<UserRow>(
          `UPDATE app_users
           SET email_verified = TRUE
           WHERE id = $1
           RETURNING
           id,
            username,
            role,
           name,
            email,
            email_verified,
            phone,
            phone_verified,
            country,
            coupon,
            coupon_accepted,
            account_status,
            password_hash,
            password_salt,
            created_at`,
          [user.id],
        );
        Object.assign(user, updatedUserResult.rows[0]);

        await client.query(
          `INSERT INTO account_statement_entries (
            id,
            user_id,
            source_key,
            kind,
            title,
            description,
            amount,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (user_id, source_key) DO NOTHING`,
          [
            randomUUID(),
            user.id,
            'email-verified',
            'note',
            'Email verified',
            'Your account email address was verified successfully.',
            null,
            'completed',
          ],
        );
      }

      await client.query('COMMIT');
      return this.toPublicUser(user);
    } catch (error) {
      await this.safeRollback(client);

      if (error instanceof PlatformStoreConflictError) {
        throw error;
      }

      throw new PlatformStoreUnavailableError(
        error instanceof Error ? error.message : 'Email verification failed.',
      );
    } finally {
      client.release();
    }
  }

  async verifyPhoneCode(phone: string, code: string): Promise<PublicUser> {
    const pool = await this.requirePool();
    const client = await pool.connect();
    const normalizedPhone = normalizePhoneNumber(phone);

    if (!normalizedPhone) {
      throw new PlatformStoreConflictError('Invalid verification code.');
    }

    try {
      await client.query('BEGIN');

      const userResult = await client.query<UserRow>(
        `SELECT
          id,
          username,
          role,
          name,
          email,
          email_verified,
          phone,
          phone_verified,
          country,
          coupon,
          coupon_accepted,
          account_status,
          password_hash,
          password_salt,
          created_at
         FROM app_users
         WHERE phone = $1
         LIMIT 1
         FOR UPDATE`,
        [normalizedPhone],
      );

      const user = userResult.rows[0];
      if (!user) {
        throw new PlatformStoreConflictError('Invalid verification code.');
      }

      if (!user.phone_verified) {
        const challengeResult = await client.query<PhoneVerificationCodeRow>(
          `SELECT
            id,
            user_id,
            phone,
            code_hash,
            expires_at,
            consumed_at,
            created_at
           FROM phone_verification_codes
           WHERE phone = $1
             AND user_id = $2
             AND consumed_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1
           FOR UPDATE`,
          [normalizedPhone, user.id],
        );

        const challenge = challengeResult.rows[0];
        if (
          !challenge ||
          new Date(challenge.expires_at).getTime() <= Date.now() ||
          challenge.code_hash !== hashPhoneVerificationCode(normalizedPhone, code)
        ) {
          throw new PlatformStoreConflictError(
            'Invalid or expired verification code.',
          );
        }

        await client.query(
          `UPDATE phone_verification_codes
           SET consumed_at = NOW()
           WHERE id = $1`,
          [challenge.id],
        );

        const updatedUserResult = await client.query<UserRow>(
          `UPDATE app_users
           SET phone_verified = TRUE
           WHERE id = $1
           RETURNING
            id,
            username,
            role,
            name,
            email,
            email_verified,
            phone,
            phone_verified,
            country,
            coupon,
            coupon_accepted,
            account_status,
            password_hash,
            password_salt,
            created_at`,
          [user.id],
        );
        Object.assign(user, updatedUserResult.rows[0]);

        await client.query(
          `INSERT INTO account_statement_entries (
            id,
            user_id,
            source_key,
            kind,
            title,
            description,
            amount,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (user_id, source_key) DO NOTHING`,
          [
            randomUUID(),
            user.id,
            'phone-verified',
            'note',
            'Phone verified',
            'Your account phone number was verified successfully.',
            null,
            'completed',
          ],
        );
      }

      await client.query('COMMIT');
      return this.toPublicUser(user);
    } catch (error) {
      await this.safeRollback(client);

      if (error instanceof PlatformStoreConflictError) {
        throw error;
      }

      throw new PlatformStoreUnavailableError(
        error instanceof Error ? error.message : 'Phone verification failed.',
      );
    } finally {
      client.release();
    }
  }

  async createSession(
    userId: string,
    remember: boolean,
  ): Promise<PlatformSession> {
    const pool = await this.requirePool();
    const token = buildSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = buildSessionExpiry(remember);
    const result = await pool.query<SessionRow>(
      `INSERT INTO auth_sessions (
        id,
        user_id,
        session_token_hash,
        remember,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, expires_at, remember`,
      [randomUUID(), userId, tokenHash, remember, expiresAt],
    );

    return {
      token,
      expiresAt: toIsoString(result.rows[0].expires_at),
      remember: result.rows[0].remember,
    };
  }

  async refreshSession(token: string): Promise<PlatformSession | null> {
    const pool = await this.requirePool();
    const tokenHash = hashSessionToken(token);
    const existingResult = await pool.query<SessionRow>(
      `SELECT id, expires_at, remember
       FROM auth_sessions
       WHERE session_token_hash = $1
         AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash],
    );

    const existingSession = existingResult.rows[0];
    if (!existingSession) {
      await pool.query(
        `DELETE FROM auth_sessions
         WHERE session_token_hash = $1
           AND expires_at <= NOW()`,
        [tokenHash],
      );
      return null;
    }

    const expiresAt = buildSessionExpiry(existingSession.remember);
    const result = await pool.query<SessionRow>(
      `UPDATE auth_sessions
       SET expires_at = $2
       WHERE session_token_hash = $1
       RETURNING id, expires_at, remember`,
      [tokenHash, expiresAt],
    );

    return {
      token,
      expiresAt: toIsoString(result.rows[0].expires_at),
      remember: result.rows[0].remember,
    };
  }

  async getUserBySessionToken(token: string): Promise<PublicUser | null> {
    const pool = await this.requirePool();
    const tokenHash = hashSessionToken(token);
    const result = await pool.query<UserRow>(
      `SELECT
        u.id,
        u.username,
        u.role,
        u.name,
        u.email,
        u.email_verified,
        u.phone,
        u.phone_verified,
        u.country,
        u.coupon,
        u.coupon_accepted,
        u.account_status,
        u.password_hash,
        u.password_salt,
        u.created_at
       FROM auth_sessions s
       JOIN app_users u ON u.id = s.user_id
       WHERE s.session_token_hash = $1
         AND s.expires_at > NOW()
       LIMIT 1`,
      [tokenHash],
    );

    if (result.rows[0]) {
      return this.toPublicUser(result.rows[0]);
    }

    await pool.query(
      `DELETE FROM auth_sessions
       WHERE session_token_hash = $1
         AND expires_at <= NOW()`,
      [tokenHash],
    );

    return null;
  }

  async revokeSession(token: string): Promise<void> {
    const pool = await this.requirePool();
    await pool.query(
      `DELETE FROM auth_sessions
       WHERE session_token_hash = $1`,
      [hashSessionToken(token)],
    );
  }

  async listAdminUsers(): Promise<AdminUserProfile[]> {
    const pool = await this.requirePool();
    const result = await pool.query<AdminUserProfileRow>(
      `SELECT
        u.id,
        u.username,
        u.role,
        u.name,
        u.email,
        u.email_verified,
        u.phone,
        u.phone_verified,
        u.country,
        u.coupon,
        u.coupon_accepted,
        u.account_status,
        u.created_at,
        da.verification_status,
        da.account_state,
        da.account_balance,
        da.total_deposit,
        da.total_withdrawal,
        da.total_profit,
        da.bonus_balance,
        da.active_plans,
        da.pending_items,
        COALESCE(deposits.approved_deposit_count, 0) AS approved_deposit_count,
        COALESCE(deposits.approved_deposit_total, 0) AS approved_deposit_total,
        deposits.last_deposit_at
       FROM app_users u
       LEFT JOIN dashboard_accounts da ON da.user_id = u.id
       LEFT JOIN (
         SELECT
           user_id,
           COUNT(*) AS approved_deposit_count,
           COALESCE(SUM(amount), 0) AS approved_deposit_total,
           MAX(COALESCE(reviewed_at, created_at)) AS last_deposit_at
         FROM payment_submissions
         WHERE status = 'approved'
         GROUP BY user_id
       ) deposits ON deposits.user_id = u.id
       WHERE u.role <> 'admin'
       ORDER BY u.created_at DESC`,
    );

    return result.rows.map((row) => this.toAdminUserProfile(row));
  }

  async updateUserAccountStatus(
    userId: string,
    status: AccountStatus,
  ): Promise<AdminUserProfile> {
    const pool = await this.requirePool();
    const client = await pool.connect();
    const nextStatus = this.normalizeAccountStatus(status);

    try {
      await client.query('BEGIN');

      const userResult = await client.query<UserRow>(
        `SELECT
          id,
          username,
          role,
          name,
          email,
          email_verified,
          phone,
          phone_verified,
          country,
          coupon,
          coupon_accepted,
          account_status,
          password_hash,
          password_salt,
          created_at
         FROM app_users
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [userId],
      );

      const user = userResult.rows[0];
      if (!user) {
        throw new PlatformStoreConflictError('That user account was not found.');
      }

      if (normalizeUserRole(user.role) === 'admin') {
        throw new PlatformStoreConflictError(
          'Admin accounts cannot be managed from this table.',
        );
      }

      await client.query(
        `UPDATE app_users
         SET account_status = $2
         WHERE id = $1`,
        [userId, nextStatus],
      );

      await client.query(
        `DELETE FROM auth_sessions
         WHERE user_id = $1`,
        [userId],
      );

      await client.query(
        `UPDATE dashboard_accounts
         SET account_state = $2,
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId, this.getDashboardAccountState(nextStatus)],
      );

      await client.query(
        `INSERT INTO account_statement_entries (
          id,
          user_id,
          source_key,
          kind,
          title,
          description,
          amount,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (user_id, source_key) DO UPDATE
        SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          status = EXCLUDED.status,
          created_at = NOW()`,
        [
          randomUUID(),
          userId,
          'account-status-admin',
          'note',
          this.getAccountStatusEntryTitle(nextStatus),
          this.getAccountStatusEntryDescription(nextStatus),
          null,
          'completed',
        ],
      );

      await client.query('COMMIT');
    } catch (error) {
      await this.safeRollback(client);

      if (error instanceof PlatformStoreConflictError) {
        throw error;
      }

      throw new PlatformStoreUnavailableError(
        error instanceof Error
          ? error.message
          : 'Unable to update the user account status.',
      );
    } finally {
      client.release();
    }

    const profile = (await this.listAdminUsers()).find((entry) => entry.id === userId);
    if (!profile) {
      throw new PlatformStoreConflictError('That user account was not found.');
    }

    return profile;
  }

  async deleteUserAccount(userId: string): Promise<void> {
    const pool = await this.requirePool();
    const result = await pool.query<{ id: string }>(
      `DELETE FROM app_users
       WHERE id = $1
         AND role <> 'admin'
       RETURNING id`,
      [userId],
    );

    if (!result.rows[0]) {
      throw new PlatformStoreConflictError(
        'That user account was not found or cannot be deleted.',
      );
    }
  }

  async listCelebrityCoupons(): Promise<CelebrityCoupon[]> {
    const pool = await this.requirePool();
    const result = await pool.query<CelebrityCouponRow>(
      `SELECT
        c.id,
        c.celebrity_name,
        c.coupon_code,
        c.offer_details,
        c.status,
        c.expires_at,
        c.max_redemptions,
        c.created_at,
        c.created_by,
        COUNT(u.id) AS current_redemptions,
        MAX(u.created_at) AS last_redeemed_at
       FROM celebrity_coupons c
       LEFT JOIN app_users u
         ON u.coupon_accepted = TRUE
        AND UPPER(COALESCE(u.coupon, '')) = c.coupon_code
       GROUP BY
        c.id,
        c.celebrity_name,
        c.coupon_code,
        c.offer_details,
        c.status,
        c.expires_at,
        c.max_redemptions,
        c.created_at,
        c.created_by
       ORDER BY c.created_at DESC`,
    );

    return result.rows.map((row) => this.toCelebrityCoupon(row));
  }

  async createCelebrityCoupon(
    input: CreateCelebrityCouponInput,
  ): Promise<CelebrityCoupon> {
    const pool = await this.requirePool();
    const couponCode = this.normalizeCelebrityCouponCode(input.couponCode);
    const celebrityName = input.celebrityName.trim();
    const offerDetails = input.offerDetails?.trim() || null;
    const status = this.normalizeCelebrityCouponStatus(input.status);
    const expiresAt = this.normalizeCelebrityCouponExpiry(input.expiresAt);
    const maxRedemptions = this.normalizeCelebrityCouponMaxRedemptions(
      input.maxRedemptions,
    );
    const createdBy = input.createdBy.trim() || 'Admin Console';

    if (!celebrityName) {
      throw new PlatformStoreConflictError('Celebrity name is required.');
    }

    if (!couponCode || !/^[A-Z0-9_-]{4,32}$/.test(couponCode)) {
      throw new PlatformStoreConflictError(
        'Coupon code must be 4-32 characters using letters, numbers, underscores, or hyphens.',
      );
    }

    try {
      await pool.query(
        `INSERT INTO celebrity_coupons (
          id,
          celebrity_name,
          coupon_code,
          offer_details,
          status,
          expires_at,
          max_redemptions,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          randomUUID(),
          celebrityName,
          couponCode,
          offerDetails,
          status,
          expiresAt,
          maxRedemptions,
          createdBy,
        ],
      );
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new PlatformStoreConflictError(
          'That celebrity coupon code already exists.',
        );
      }

      throw error;
    }

    const coupon = await this.findCelebrityCouponByCode(pool, couponCode);
    if (!coupon) {
      throw new PlatformStoreConflictError(
        'Unable to load the newly created celebrity coupon.',
      );
    }

    return coupon;
  }

  async validateCelebrityCoupon(code: string): Promise<CelebrityCoupon | null> {
    const pool = await this.requirePool();
    return this.findRedeemableCelebrityCoupon(pool, code, false);
  }

  async getDashboardAccount(userId: string): Promise<DashboardAccount> {
    const pool = await this.requirePool();
    const userResult = await pool.query<UserRow>(
      `SELECT
        id,
        username,
        role,
        name,
        email,
        email_verified,
        phone,
        phone_verified,
        country,
        coupon,
        coupon_accepted,
        account_status,
        password_hash,
        password_salt,
        created_at
       FROM app_users
       WHERE id = $1
       LIMIT 1`,
      [userId],
    );

    const user = userResult.rows[0];
    if (!user) {
      throw new PlatformStoreUnavailableError('Dashboard account not found.');
    }

    await this.ensureDashboardAccountForUser(pool, user);

    const account = await this.syncPlanInterestForUser(pool, userId);
    if (!account) {
      throw new PlatformStoreUnavailableError('Dashboard account not found.');
    }

    const [statementResult, tradeResult, portfolioResult] = await Promise.all([
      pool.query<DashboardStatementEntryRow>(
        `SELECT
          id,
          source_key,
          kind,
          title,
          description,
          amount,
          status,
          email_delivered_at,
          created_at
         FROM account_statement_entries
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 12`,
        [userId],
      ),
      pool.query<DashboardTradeRecordRow>(
        `SELECT
          id,
          asset_symbol,
          asset_name,
          side,
          amount,
          status,
          opened_at
         FROM trade_records
         WHERE user_id = $1
         ORDER BY opened_at DESC
         LIMIT 12`,
        [userId],
      ),
      pool.query<DashboardPortfolioPositionRow>(
        `SELECT
          id,
          asset_symbol,
          asset_name,
          allocation_usd,
          status,
          pnl,
          opened_at
         FROM portfolio_positions
         WHERE user_id = $1
         ORDER BY opened_at DESC
         LIMIT 12`,
        [userId],
      ),
    ]);

    return this.toDashboardAccount(
      account,
      statementResult.rows,
      tradeResult.rows,
      portfolioResult.rows,
    );
  }

  async claimPendingDailyInterestEmailDispatch(
    userId: string,
  ): Promise<DailyInterestEmailDispatch> {
    const pool = await this.requirePool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const account = await this.syncPlanInterestForUser(client, userId, true);
      if (!account) {
        throw new PlatformStoreUnavailableError('Dashboard account not found.');
      }

      const pendingResult = await client.query<DashboardStatementEntryRow>(
        `SELECT
          id,
          source_key,
          kind,
          title,
          description,
          amount,
          status,
          email_delivered_at,
          created_at
         FROM account_statement_entries
         WHERE user_id = $1
           AND source_key LIKE 'interest-credit:%'
           AND email_delivered_at IS NULL
         ORDER BY created_at ASC
         FOR UPDATE`,
        [userId],
      );

      if (pendingResult.rows.length) {
        const entryIds = pendingResult.rows.map((row) => row.id);
        await client.query(
          `UPDATE account_statement_entries
           SET email_delivered_at = NOW()
           WHERE user_id = $1
             AND id = ANY($2::uuid[])`,
          [userId, entryIds],
        );
      }

      await client.query('COMMIT');

      return {
        entries: pendingResult.rows.map((row) => this.toDashboardStatementEntry(row)),
        availableBalance: this.toNumber(account.account_balance),
        totalProfit: this.toNumber(account.total_profit),
      };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async listPaymentSubmissionsForUser(
    userId: string,
  ): Promise<PaymentSubmission[]> {
    const pool = await this.requirePool();
    const result = await pool.query<PaymentSubmissionRow>(
      `SELECT
        ps.id,
        ps.reference,
        ps.user_id,
        ps.user_name,
        ps.user_email,
        u.username AS user_username,
        u.phone AS user_phone,
        u.country AS user_country,
        u.created_at AS user_created_at,
        ps.plan_key,
        ps.plan_name,
        ps.funding_method,
        ps.amount,
        ps.asset_key,
        ps.asset_symbol,
        ps.asset_name,
        ps.network,
        ps.route_address,
        ps.proof_image_data_url,
        ps.proof_file_name,
        ps.proof_mime_type,
        ps.proof_note,
        ps.status,
        ps.reviewed_at,
        ps.reviewed_by,
        ps.review_note,
        ps.created_at
       FROM payment_submissions ps
       LEFT JOIN app_users u ON u.id = ps.user_id
       WHERE ps.user_id = $1
       ORDER BY ps.created_at DESC`,
      [userId],
    );

    return result.rows.map((row) => this.toPaymentSubmission(row));
  }

  async listPaymentSubmissions(): Promise<PaymentSubmission[]> {
    const pool = await this.requirePool();
    const result = await pool.query<PaymentSubmissionRow>(
      `SELECT
        ps.id,
        ps.reference,
        ps.user_id,
        ps.user_name,
        ps.user_email,
        u.username AS user_username,
        u.phone AS user_phone,
        u.country AS user_country,
        u.created_at AS user_created_at,
        ps.plan_key,
        ps.plan_name,
        ps.funding_method,
        ps.amount,
        ps.asset_key,
        ps.asset_symbol,
        ps.asset_name,
        ps.network,
        ps.route_address,
        ps.proof_image_data_url,
        ps.proof_file_name,
        ps.proof_mime_type,
        ps.proof_note,
        ps.status,
        ps.reviewed_at,
        ps.reviewed_by,
        ps.review_note,
        ps.created_at
       FROM payment_submissions ps
       LEFT JOIN app_users u ON u.id = ps.user_id
       ORDER BY ps.created_at DESC`,
    );

    return result.rows.map((row) => this.toPaymentSubmission(row));
  }

  async createPaymentSubmission(
    input: CreatePaymentSubmissionInput,
  ): Promise<PaymentSubmission> {
    const pool = await this.requirePool();
    const client = await pool.connect();
    const submissionId = randomUUID();
    const reference = buildReference('PAY');
    const sourceKey = `payment-submission:${submissionId}`;

    try {
      await client.query('BEGIN');

      const result = await client.query<PaymentSubmissionRow>(
        `INSERT INTO payment_submissions (
          id,
          reference,
          user_id,
          user_name,
          user_email,
          plan_key,
          plan_name,
          funding_method,
          amount,
          asset_key,
          asset_symbol,
          asset_name,
          network,
          route_address,
          proof_image_data_url,
          proof_file_name,
          proof_mime_type,
          proof_note,
          status
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, 'pending'
        )
        RETURNING
          id,
          reference,
          user_id,
          user_name,
          user_email,
          plan_key,
          plan_name,
          funding_method,
          amount,
          asset_key,
          asset_symbol,
          asset_name,
          network,
          route_address,
          proof_image_data_url,
          proof_file_name,
          proof_mime_type,
          proof_note,
          status,
          reviewed_at,
          reviewed_by,
          review_note,
          created_at`,
        [
          submissionId,
          reference,
          input.userId,
          input.userName.trim(),
          normalizeEmail(input.userEmail),
          input.planKey.trim(),
          input.planName.trim(),
          input.fundingMethod,
          input.amount,
          input.assetKey?.trim() || null,
          input.assetSymbol?.trim() || null,
          input.assetName?.trim() || null,
          input.network?.trim() || null,
          input.routeAddress?.trim() || null,
          input.proofImageDataUrl.trim(),
          input.proofFileName.trim(),
          input.proofMimeType.trim(),
          input.proofNote?.trim() || null,
        ],
      );

      await client.query(
        `UPDATE dashboard_accounts
         SET pending_items = GREATEST(pending_items, 0) + 1,
             updated_at = NOW()
         WHERE user_id = $1`,
        [input.userId],
      );

      await client.query(
        `INSERT INTO account_statement_entries (
          id,
          user_id,
          source_key,
          kind,
          title,
          description,
          amount,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          randomUUID(),
          input.userId,
          sourceKey,
          'deposit',
          'Payment proof submitted',
          `Awaiting admin approval for ${input.planName.trim()}.`,
          input.amount,
          'pending',
        ],
      );

      await client.query('COMMIT');
      return this.toPaymentSubmission(result.rows[0]);
    } catch (error) {
      await this.safeRollback(client);

      if (error instanceof PlatformStoreConflictError) {
        throw error;
      }

      throw new PlatformStoreUnavailableError(
        error instanceof Error ? error.message : 'Payment submission failed.',
      );
    } finally {
      client.release();
    }
  }

  async reviewPaymentSubmission(
    input: ReviewPaymentSubmissionInput,
  ): Promise<PaymentSubmission> {
    const pool = await this.requirePool();
    const client = await pool.connect();
    const submissionId = input.id.trim();
    const sourceKey = `payment-submission:${submissionId}`;

    try {
      await client.query('BEGIN');

      const existingResult = await client.query<PaymentSubmissionRow>(
        `SELECT
          id,
          reference,
          user_id,
          user_name,
          user_email,
          plan_key,
          plan_name,
          funding_method,
          amount,
          asset_key,
          asset_symbol,
          asset_name,
          network,
          route_address,
          proof_image_data_url,
          proof_file_name,
          proof_mime_type,
          proof_note,
          status,
          reviewed_at,
          reviewed_by,
          review_note,
          created_at
         FROM payment_submissions
         WHERE id = $1
         FOR UPDATE`,
        [submissionId],
      );

      const submission = existingResult.rows[0];
      if (!submission) {
        throw new PlatformStoreUnavailableError('Payment submission not found.');
      }

      if (submission.status !== 'pending') {
        throw new PlatformStoreConflictError(
          'That payment submission has already been reviewed.',
        );
      }

      const result = await client.query<PaymentSubmissionRow>(
        `UPDATE payment_submissions
         SET status = $2,
             reviewed_at = NOW(),
             reviewed_by = $3,
             review_note = $4
         WHERE id = $1
         RETURNING
          id,
          reference,
          user_id,
          user_name,
          user_email,
          plan_key,
          plan_name,
          funding_method,
          amount,
          asset_key,
          asset_symbol,
          asset_name,
          network,
          route_address,
          proof_image_data_url,
          proof_file_name,
          proof_mime_type,
          proof_note,
          status,
          reviewed_at,
          reviewed_by,
          review_note,
          created_at`,
        [
          submissionId,
          input.status,
          input.reviewedBy.trim(),
          input.reviewNote?.trim() || null,
        ],
      );

      if (input.status === 'approved') {
        await client.query(
          `UPDATE dashboard_accounts
           SET pending_items = GREATEST(pending_items - 1, 0),
               total_deposit = total_deposit + $2,
               account_balance = account_balance + $2,
               updated_at = NOW()
           WHERE user_id = $1`,
          [submission.user_id, submission.amount],
        );

        await client.query(
          `UPDATE account_statement_entries
           SET title = 'Deposit approved',
               description = $3,
               status = 'completed'
           WHERE user_id = $1
             AND source_key = $2`,
          [
            submission.user_id,
            sourceKey,
            `${submission.plan_name} payment was approved.`,
          ],
        );
      } else {
        await client.query(
          `UPDATE dashboard_accounts
           SET pending_items = GREATEST(pending_items - 1, 0),
               updated_at = NOW()
           WHERE user_id = $1`,
          [submission.user_id],
        );

        await client.query(
          `UPDATE account_statement_entries
           SET title = $3,
               description = $4,
               status = 'info'
           WHERE user_id = $1
             AND source_key = $2`,
          [
            submission.user_id,
            sourceKey,
            input.status === 'cancelled'
              ? 'Deposit cancelled'
              : 'Deposit rejected',
            input.status === 'cancelled'
              ? input.reviewNote?.trim() ||
                'The payment proof was cancelled during admin review.'
              : input.reviewNote?.trim() ||
                'The payment proof was rejected by admin review.',
          ],
        );
      }

      await client.query('COMMIT');
      return this.toPaymentSubmission(result.rows[0]);
    } catch (error) {
      await this.safeRollback(client);

      if (error instanceof PlatformStoreConflictError) {
        throw error;
      }

      throw new PlatformStoreUnavailableError(
        error instanceof Error ? error.message : 'Payment review failed.',
      );
    } finally {
      client.release();
    }
  }

  async listWithdrawalSubmissionsForUser(
    userId: string,
  ): Promise<WithdrawalSubmission[]> {
    const pool = await this.requirePool();
    const result = await pool.query<WithdrawalSubmissionRow>(
      `SELECT
        ws.id,
        ws.reference,
        ws.user_id,
        ws.user_name,
        ws.user_email,
        u.username AS user_username,
        u.phone AS user_phone,
        u.country AS user_country,
        u.created_at AS user_created_at,
        ws.withdrawal_method,
        ws.amount,
        ws.estimated_fee,
        ws.net_amount,
        ws.asset_key,
        ws.asset_symbol,
        ws.asset_name,
        ws.network,
        ws.wallet_address,
        ws.wallet_label,
        ws.bank_holder,
        ws.bank_name,
        ws.bank_routing,
        ws.bank_account,
        ws.bank_country,
        ws.wire_beneficiary,
        ws.wire_bank_name,
        ws.wire_swift,
        ws.wire_iban,
        ws.wire_country,
        ws.wire_note,
        ws.status,
        ws.reviewed_at,
        ws.reviewed_by,
        ws.review_note,
        ws.created_at
       FROM withdrawal_submissions ws
       LEFT JOIN app_users u ON u.id = ws.user_id
       WHERE ws.user_id = $1
       ORDER BY ws.created_at DESC`,
      [userId],
    );

    return result.rows.map((row) => this.toWithdrawalSubmission(row));
  }

  async listWithdrawalSubmissions(): Promise<WithdrawalSubmission[]> {
    const pool = await this.requirePool();
    const result = await pool.query<WithdrawalSubmissionRow>(
      `SELECT
        ws.id,
        ws.reference,
        ws.user_id,
        ws.user_name,
        ws.user_email,
        u.username AS user_username,
        u.phone AS user_phone,
        u.country AS user_country,
        u.created_at AS user_created_at,
        ws.withdrawal_method,
        ws.amount,
        ws.estimated_fee,
        ws.net_amount,
        ws.asset_key,
        ws.asset_symbol,
        ws.asset_name,
        ws.network,
        ws.wallet_address,
        ws.wallet_label,
        ws.bank_holder,
        ws.bank_name,
        ws.bank_routing,
        ws.bank_account,
        ws.bank_country,
        ws.wire_beneficiary,
        ws.wire_bank_name,
        ws.wire_swift,
        ws.wire_iban,
        ws.wire_country,
        ws.wire_note,
        ws.status,
        ws.reviewed_at,
        ws.reviewed_by,
        ws.review_note,
        ws.created_at
       FROM withdrawal_submissions ws
       LEFT JOIN app_users u ON u.id = ws.user_id
       ORDER BY ws.created_at DESC`,
    );

    return result.rows.map((row) => this.toWithdrawalSubmission(row));
  }

  async createWithdrawalSubmission(
    input: CreateWithdrawalSubmissionInput,
  ): Promise<WithdrawalSubmission> {
    const pool = await this.requirePool();
    const client = await pool.connect();
    const submissionId = randomUUID();
    const reference = buildReference('WDR');
    const sourceKey = `withdrawal-submission:${submissionId}`;

    try {
      await client.query('BEGIN');

      const account = await this.syncPlanInterestForUser(
        client,
        input.userId,
        true,
      );

      if (!account) {
        throw new PlatformStoreUnavailableError('Dashboard account not found.');
      }

      if (account.verification_status !== 'verified') {
        throw new PlatformStoreConflictError(
          'KYC verification is required before requesting a withdrawal.',
        );
      }

      const pendingWithdrawalResult = await client.query<{
        pending_total: number | string | null;
      }>(
        `SELECT COALESCE(SUM(amount), 0) AS pending_total
         FROM withdrawal_submissions
         WHERE user_id = $1
           AND status = 'pending'`,
        [input.userId],
      );
      const settledBalance = this.toNumber(account.account_balance);
      const pendingWithdrawalTotal = this.toNumber(
        pendingWithdrawalResult.rows[0]?.pending_total ?? 0,
      );
      const availableBalance = Math.max(
        0,
        settledBalance - pendingWithdrawalTotal,
      );

      if (availableBalance < input.amount) {
        throw new PlatformStoreConflictError(
          'Insufficient available balance for this withdrawal request.',
        );
      }

      const result = await client.query<WithdrawalSubmissionRow>(
        `INSERT INTO withdrawal_submissions (
          id,
          reference,
          user_id,
          user_name,
          user_email,
          withdrawal_method,
          amount,
          estimated_fee,
          net_amount,
          asset_key,
          asset_symbol,
          asset_name,
          network,
          wallet_address,
          wallet_label,
          bank_holder,
          bank_name,
          bank_routing,
          bank_account,
          bank_country,
          wire_beneficiary,
          wire_bank_name,
          wire_swift,
          wire_iban,
          wire_country,
          wire_note,
          status
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, 'pending'
        )
        RETURNING
          id,
          reference,
          user_id,
          user_name,
          user_email,
          withdrawal_method,
          amount,
          estimated_fee,
          net_amount,
          asset_key,
          asset_symbol,
          asset_name,
          network,
          wallet_address,
          wallet_label,
          bank_holder,
          bank_name,
          bank_routing,
          bank_account,
          bank_country,
          wire_beneficiary,
          wire_bank_name,
          wire_swift,
          wire_iban,
          wire_country,
          wire_note,
          status,
          reviewed_at,
          reviewed_by,
          review_note,
          created_at`,
        [
          submissionId,
          reference,
          input.userId,
          input.userName.trim(),
          normalizeEmail(input.userEmail),
          input.withdrawalMethod,
          input.amount,
          input.estimatedFee,
          input.netAmount,
          input.assetKey?.trim() || null,
          input.assetSymbol?.trim() || null,
          input.assetName?.trim() || null,
          input.network?.trim() || null,
          input.walletAddress?.trim() || null,
          input.walletLabel?.trim() || null,
          input.bankHolder?.trim() || null,
          input.bankName?.trim() || null,
          input.bankRouting?.trim() || null,
          input.bankAccount?.trim() || null,
          input.bankCountry?.trim() || null,
          input.wireBeneficiary?.trim() || null,
          input.wireBankName?.trim() || null,
          input.wireSwift?.trim() || null,
          input.wireIban?.trim() || null,
          input.wireCountry?.trim() || null,
          input.wireNote?.trim() || null,
        ],
      );

      await client.query(
        `UPDATE dashboard_accounts
         SET pending_items = GREATEST(pending_items, 0) + 1,
             updated_at = NOW()
         WHERE user_id = $1`,
        [input.userId],
      );

      await client.query(
        `INSERT INTO account_statement_entries (
          id,
          user_id,
          source_key,
          kind,
          title,
          description,
          amount,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          randomUUID(),
          input.userId,
          sourceKey,
          'withdrawal',
          'Withdrawal requested',
          `${this.formatWithdrawalMethodLabel(
            input.withdrawalMethod,
          )} request is awaiting admin review.`,
          input.amount,
          'pending',
        ],
      );

      await client.query('COMMIT');
      return this.toWithdrawalSubmission(result.rows[0]);
    } catch (error) {
      await this.safeRollback(client);

      if (error instanceof PlatformStoreConflictError) {
        throw error;
      }

      if (error instanceof PlatformStoreUnavailableError) {
        throw error;
      }

      throw new PlatformStoreUnavailableError(
        error instanceof Error ? error.message : 'Withdrawal submission failed.',
      );
    } finally {
      client.release();
    }
  }

  async reviewWithdrawalSubmission(
    input: ReviewWithdrawalSubmissionInput,
  ): Promise<WithdrawalSubmission> {
    const pool = await this.requirePool();
    const client = await pool.connect();
    const submissionId = input.id.trim();
    const sourceKey = `withdrawal-submission:${submissionId}`;

    try {
      await client.query('BEGIN');

      const existingResult = await client.query<WithdrawalSubmissionRow>(
        `SELECT
          id,
          reference,
          user_id,
          user_name,
          user_email,
          withdrawal_method,
          amount,
          estimated_fee,
          net_amount,
          asset_key,
          asset_symbol,
          asset_name,
          network,
          wallet_address,
          wallet_label,
          bank_holder,
          bank_name,
          bank_routing,
          bank_account,
          bank_country,
          wire_beneficiary,
          wire_bank_name,
          wire_swift,
          wire_iban,
          wire_country,
          wire_note,
          status,
          reviewed_at,
          reviewed_by,
          review_note,
          created_at
         FROM withdrawal_submissions
         WHERE id = $1
         FOR UPDATE`,
        [submissionId],
      );

      const submission = existingResult.rows[0];
      if (!submission) {
        throw new PlatformStoreUnavailableError(
          'Withdrawal submission not found.',
        );
      }

      if (submission.status !== 'pending') {
        throw new PlatformStoreConflictError(
          'That withdrawal submission has already been reviewed.',
        );
      }

      const account = await this.syncPlanInterestForUser(
        client,
        submission.user_id,
        true,
      );

      if (!account) {
        throw new PlatformStoreUnavailableError('Dashboard account not found.');
      }

      if (
        input.status === 'approved' &&
        this.toNumber(account.account_balance) < this.toNumber(submission.amount)
      ) {
        throw new PlatformStoreConflictError(
          'Insufficient available balance to approve this withdrawal.',
        );
      }

      const result = await client.query<WithdrawalSubmissionRow>(
        `UPDATE withdrawal_submissions
         SET status = $2,
             reviewed_at = NOW(),
             reviewed_by = $3,
             review_note = $4
         WHERE id = $1
         RETURNING
          id,
          reference,
          user_id,
          user_name,
          user_email,
          withdrawal_method,
          amount,
          estimated_fee,
          net_amount,
          asset_key,
          asset_symbol,
          asset_name,
          network,
          wallet_address,
          wallet_label,
          bank_holder,
          bank_name,
          bank_routing,
          bank_account,
          bank_country,
          wire_beneficiary,
          wire_bank_name,
          wire_swift,
          wire_iban,
          wire_country,
          wire_note,
          status,
          reviewed_at,
          reviewed_by,
          review_note,
          created_at`,
        [
          submissionId,
          input.status,
          input.reviewedBy.trim(),
          input.reviewNote?.trim() || null,
        ],
      );

      if (input.status === 'approved') {
        await client.query(
          `UPDATE dashboard_accounts
           SET pending_items = GREATEST(pending_items - 1, 0),
               total_withdrawal = total_withdrawal + $2,
               account_balance = GREATEST(account_balance - $2, 0),
               updated_at = NOW()
           WHERE user_id = $1`,
          [submission.user_id, submission.amount],
        );

        await client.query(
          `UPDATE account_statement_entries
           SET title = 'Withdrawal approved',
               description = $3,
               status = 'completed'
           WHERE user_id = $1
             AND source_key = $2`,
          [
            submission.user_id,
            sourceKey,
            `${this.formatWithdrawalMethodLabel(
              submission.withdrawal_method as WithdrawalSubmission['withdrawalMethod'],
            )} payout was approved. Net payout ${this.toNumber(
              submission.net_amount,
            ).toFixed(2)}.`,
          ],
        );
      } else {
        await client.query(
          `UPDATE dashboard_accounts
           SET pending_items = GREATEST(pending_items - 1, 0),
               updated_at = NOW()
           WHERE user_id = $1`,
          [submission.user_id],
        );

        await client.query(
          `UPDATE account_statement_entries
           SET title = $3,
               description = $4,
               status = 'info'
           WHERE user_id = $1
             AND source_key = $2`,
          [
            submission.user_id,
            sourceKey,
            input.status === 'cancelled'
              ? 'Withdrawal cancelled'
              : 'Withdrawal rejected',
            input.status === 'cancelled'
              ? input.reviewNote?.trim() ||
                'The withdrawal request was cancelled during admin review.'
              : input.reviewNote?.trim() ||
                'The withdrawal request was rejected by admin review.',
          ],
        );
      }

      await client.query('COMMIT');
      return this.toWithdrawalSubmission(result.rows[0]);
    } catch (error) {
      await this.safeRollback(client);

      if (error instanceof PlatformStoreConflictError) {
        throw error;
      }

      if (error instanceof PlatformStoreUnavailableError) {
        throw error;
      }

      throw new PlatformStoreUnavailableError(
        error instanceof Error ? error.message : 'Withdrawal review failed.',
      );
    } finally {
      client.release();
    }
  }

  async listKycSubmissionsForUser(userId: string): Promise<KycSubmission[]> {
    const pool = await this.requirePool();
    const result = await pool.query<KycSubmissionRow>(
      this.buildKycSubmissionSelectClause(
        `WHERE ks.user_id = $1
         ORDER BY ks.created_at DESC`,
      ),
      [userId],
    );

    return result.rows.map((row) => this.toKycSubmission(row));
  }

  async listKycSubmissions(): Promise<KycSubmission[]> {
    const pool = await this.requirePool();
    const result = await pool.query<KycSubmissionRow>(
      this.buildKycSubmissionSelectClause('ORDER BY ks.created_at DESC'),
    );

    return result.rows.map((row) => this.toKycSubmission(row));
  }

  async createKycSubmission(
    input: CreateKycSubmissionInput,
  ): Promise<KycSubmission> {
    const pool = await this.requirePool();
    const client = await pool.connect();
    const submissionId = randomUUID();
    const reference = buildReference('KYC');
    const sourceKey = `kyc-submission:${submissionId}`;

    try {
      await client.query('BEGIN');

      const account = await this.syncPlanInterestForUser(
        client,
        input.userId,
        true,
      );

      if (!account) {
        throw new PlatformStoreUnavailableError('Dashboard account not found.');
      }

      if (account.verification_status === 'verified') {
        throw new PlatformStoreConflictError('KYC is already verified.');
      }

      const pendingResult = await client.query<{ id: string }>(
        `SELECT id
         FROM kyc_submissions
         WHERE user_id = $1
           AND status = 'pending'
         LIMIT 1`,
        [input.userId],
      );

      if (pendingResult.rows[0]) {
        throw new PlatformStoreConflictError(
          'A KYC submission is already pending review.',
        );
      }

      const result = await client.query<KycSubmissionRow>(
        `INSERT INTO kyc_submissions (
          id,
          reference,
          user_id,
          user_name,
          user_email,
          email,
          phone,
          first_name,
          middle_name,
          last_name,
          country_of_origin,
          document_type,
          document_image_data_url,
          document_file_name,
          document_mime_type,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending')
        RETURNING
          id,
          reference,
          user_id,
          user_name,
          user_email,
          email,
          phone,
          first_name,
          middle_name,
          last_name,
          country_of_origin,
          document_type,
          document_image_data_url,
          document_file_name,
          document_mime_type,
          status,
          reviewed_at,
          reviewed_by,
          review_note,
          created_at`,
        [
          submissionId,
          reference,
          input.userId,
          input.userName.trim(),
          normalizeEmail(input.userEmail),
          normalizeEmail(input.email),
          input.phone.trim(),
          input.firstName.trim(),
          input.middleName?.trim() || null,
          input.lastName.trim(),
          input.countryOfOrigin.trim(),
          input.documentType,
          input.documentImageDataUrl.trim(),
          input.documentFileName.trim(),
          input.documentMimeType.trim(),
        ],
      );

      await client.query(
        `UPDATE dashboard_accounts
         SET verification_status = 'pending',
             pending_items = GREATEST(pending_items, 0) + 1,
             updated_at = NOW()
         WHERE user_id = $1`,
        [input.userId],
      );

      await client.query(
        `INSERT INTO account_statement_entries (
          id,
          user_id,
          source_key,
          kind,
          title,
          description,
          amount,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          randomUUID(),
          input.userId,
          sourceKey,
          'note',
          'KYC submitted',
          'Your identity verification was submitted for admin review.',
          null,
          'pending',
        ],
      );

      await client.query('COMMIT');
      return this.toKycSubmission(result.rows[0]);
    } catch (error) {
      await this.safeRollback(client);

      if (
        error instanceof PlatformStoreConflictError ||
        error instanceof PlatformStoreUnavailableError
      ) {
        throw error;
      }

      throw new PlatformStoreUnavailableError(
        error instanceof Error ? error.message : 'KYC submission failed.',
      );
    } finally {
      client.release();
    }
  }

  async reviewKycSubmission(
    input: ReviewKycSubmissionInput,
  ): Promise<KycSubmission> {
    const pool = await this.requirePool();
    const client = await pool.connect();
    const submissionId = input.id.trim();
    const sourceKey = `kyc-submission:${submissionId}`;

    try {
      await client.query('BEGIN');

      const existingResult = await client.query<KycSubmissionRow>(
        `SELECT
          id,
          reference,
          user_id,
          user_name,
          user_email,
          email,
          phone,
          first_name,
          middle_name,
          last_name,
          country_of_origin,
          document_type,
          document_image_data_url,
          document_file_name,
          document_mime_type,
          status,
          reviewed_at,
          reviewed_by,
          review_note,
          created_at
         FROM kyc_submissions
         WHERE id = $1
         FOR UPDATE`,
        [submissionId],
      );

      const submission = existingResult.rows[0];
      if (!submission) {
        throw new PlatformStoreUnavailableError('KYC submission not found.');
      }

      if (submission.status !== 'pending') {
        throw new PlatformStoreConflictError(
          'That KYC submission has already been reviewed.',
        );
      }

      const result = await client.query<KycSubmissionRow>(
        `UPDATE kyc_submissions
         SET status = $2,
             reviewed_at = NOW(),
             reviewed_by = $3,
             review_note = $4
         WHERE id = $1
         RETURNING
          id,
          reference,
          user_id,
          user_name,
          user_email,
          email,
          phone,
          first_name,
          middle_name,
          last_name,
          country_of_origin,
          document_type,
          document_image_data_url,
          document_file_name,
          document_mime_type,
          status,
          reviewed_at,
          reviewed_by,
          review_note,
          created_at`,
        [
          submissionId,
          input.status,
          input.reviewedBy.trim(),
          input.reviewNote?.trim() || null,
        ],
      );

      await client.query(
        `UPDATE dashboard_accounts
         SET verification_status = $2,
             pending_items = GREATEST(pending_items - 1, 0),
             updated_at = NOW()
         WHERE user_id = $1`,
        [
          submission.user_id,
          input.status === 'approved' ? 'verified' : 'rejected',
        ],
      );

      await client.query(
        `UPDATE account_statement_entries
         SET title = $3,
             description = $4,
             status = $5
         WHERE user_id = $1
           AND source_key = $2`,
        [
          submission.user_id,
          sourceKey,
          input.status === 'approved' ? 'KYC approved' : 'KYC rejected',
          input.status === 'approved'
            ? 'Your identity verification has been approved.'
            : input.reviewNote?.trim() ||
              'Your identity verification was rejected. Review the note and resubmit.',
          input.status === 'approved' ? 'completed' : 'info',
        ],
      );

      await client.query('COMMIT');
      return this.toKycSubmission(result.rows[0]);
    } catch (error) {
      await this.safeRollback(client);

      if (
        error instanceof PlatformStoreConflictError ||
        error instanceof PlatformStoreUnavailableError
      ) {
        throw error;
      }

      throw new PlatformStoreUnavailableError(
        error instanceof Error ? error.message : 'KYC review failed.',
      );
    } finally {
      client.release();
    }
  }

  async createContactSubmission(
    input: CreateContactSubmissionInput,
  ): Promise<ContactSubmission> {
    const pool = await this.requirePool();
    const result = await pool.query<ContactSubmissionRow>(
      `INSERT INTO contact_submissions (
        id,
        reference,
        topic,
        name,
        email,
        message
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, reference, topic, name, email, message, created_at`,
      [
        randomUUID(),
        buildReference('MSG'),
        input.topic.trim(),
        input.name.trim(),
        normalizeEmail(input.email),
        input.message.trim(),
      ],
    );

    return this.toContactSubmission(result.rows[0]);
  }

  async consumeRateLimit(
    input: ConsumeRateLimitInput,
  ): Promise<RateLimitConsumptionResult> {
    const pool = await this.requirePool();
    const client = await pool.connect();
    const bucketKey = `${input.scope}:${input.key}`;
    const resetAt = new Date(Date.now() + input.windowMs).toISOString();

    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM rate_limit_buckets
         WHERE bucket_key = $1
           AND reset_at <= NOW()`,
        [bucketKey],
      );

      const current = await client.query<RateLimitBucketRow>(
        `SELECT count, reset_at
         FROM rate_limit_buckets
         WHERE bucket_key = $1
         FOR UPDATE`,
        [bucketKey],
      );

      const row = current.rows[0];
      if (!row) {
        await client.query(
          `INSERT INTO rate_limit_buckets (
            bucket_key,
            scope,
            subject_key,
            count,
            reset_at
          )
          VALUES ($1, $2, $3, $4, $5)`,
          [bucketKey, input.scope, input.key, 1, resetAt],
        );
        await client.query('COMMIT');
        return { allowed: true };
      }

      if (row.count >= input.limit) {
        await client.query('ROLLBACK');
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000),
          ),
        };
      }

      await client.query(
        `UPDATE rate_limit_buckets
         SET count = count + 1,
             updated_at = NOW()
         WHERE bucket_key = $1`,
        [bucketKey],
      );
      await client.query('COMMIT');
      return { allowed: true };
    } catch (error) {
      await this.safeRollback(client);
      throw new PlatformStoreUnavailableError(
        error instanceof Error ? error.message : 'Rate limit persistence failed.',
      );
    } finally {
      client.release();
    }
  }

  private async requirePool() {
    const ready = await this.ensureReady();

    if (!ready || !this.pool) {
      throw new PlatformStoreUnavailableError(
        this.lastConnectionError ?? 'PostgreSQL persistence is not ready.',
      );
    }

    return this.pool;
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

  private async ensureSchema() {
    if (this.schemaReady || !this.pool) {
      return;
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id UUID PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'user',
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        email_verified BOOLEAN NOT NULL DEFAULT TRUE,
        phone TEXT NOT NULL,
        phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
        country TEXT NOT NULL,
        coupon TEXT,
        coupon_accepted BOOLEAN NOT NULL DEFAULT FALSE,
        account_status TEXT NOT NULL DEFAULT 'active',
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_app_users_email
      ON app_users (email);

      CREATE INDEX IF NOT EXISTS idx_app_users_username
      ON app_users (username);

      CREATE INDEX IF NOT EXISTS idx_app_users_phone
      ON app_users (phone);

      ALTER TABLE app_users
      ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

      ALTER TABLE app_users
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;

      ALTER TABLE app_users
      ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;

      ALTER TABLE app_users
      ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

      UPDATE app_users
      SET role = 'user'
      WHERE role IS NULL OR role = '';

      UPDATE app_users
      SET phone_verified = TRUE
      WHERE role = 'admin' AND phone_verified = FALSE;

      UPDATE app_users
      SET account_status = 'active'
      WHERE account_status IS NULL OR account_status = '';

      CREATE TABLE IF NOT EXISTS celebrity_coupons (
        id UUID PRIMARY KEY,
        celebrity_name TEXT NOT NULL,
        coupon_code TEXT NOT NULL UNIQUE,
        offer_details TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        expires_at TIMESTAMPTZ,
        max_redemptions INTEGER,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_celebrity_coupons_status
      ON celebrity_coupons (status, created_at DESC);

      CREATE TABLE IF NOT EXISTS password_reset_requests (
        id UUID PRIMARY KEY,
        reference TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_password_reset_requests_email
      ON password_reset_requests (email);

      CREATE TABLE IF NOT EXISTS pending_registrations (
        id UUID PRIMARY KEY,
        username TEXT NOT NULL,
        role TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        country TEXT NOT NULL,
        coupon TEXT,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        verification_channel TEXT NOT NULL,
        verification_code_hash TEXT NOT NULL,
        verification_expires_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_pending_registrations_username
      ON pending_registrations (username);

      CREATE INDEX IF NOT EXISTS idx_pending_registrations_email
      ON pending_registrations (email);

      CREATE INDEX IF NOT EXISTS idx_pending_registrations_phone
      ON pending_registrations (phone);

      CREATE INDEX IF NOT EXISTS idx_pending_registrations_expires_at
      ON pending_registrations (expires_at);

      CREATE TABLE IF NOT EXISTS email_verification_codes (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_email_verification_codes_email
      ON email_verification_codes (email, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_email_verification_codes_user_id
      ON email_verification_codes (user_id);

      CREATE TABLE IF NOT EXISTS phone_verification_codes (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        phone TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_phone_verification_codes_phone
      ON phone_verification_codes (phone, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_phone_verification_codes_user_id
      ON phone_verification_codes (user_id);

      CREATE TABLE IF NOT EXISTS auth_sessions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        session_token_hash TEXT NOT NULL UNIQUE,
        remember BOOLEAN NOT NULL DEFAULT FALSE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
      ON auth_sessions (user_id);

      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
      ON auth_sessions (expires_at);

      CREATE TABLE IF NOT EXISTS contact_submissions (
        id UUID PRIMARY KEY,
        reference TEXT NOT NULL UNIQUE,
        topic TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_contact_submissions_email
      ON contact_submissions (email);

      CREATE TABLE IF NOT EXISTS payment_submissions (
        id UUID PRIMARY KEY,
        reference TEXT NOT NULL UNIQUE,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        user_name TEXT NOT NULL,
        user_email TEXT NOT NULL,
        plan_key TEXT NOT NULL,
        plan_name TEXT NOT NULL,
        funding_method TEXT NOT NULL,
        amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
        asset_key TEXT,
        asset_symbol TEXT,
        asset_name TEXT,
        network TEXT,
        route_address TEXT,
        proof_image_data_url TEXT NOT NULL,
        proof_file_name TEXT NOT NULL,
        proof_mime_type TEXT NOT NULL,
        proof_note TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        reviewed_at TIMESTAMPTZ,
        reviewed_by TEXT,
        review_note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_payment_submissions_user_id
      ON payment_submissions (user_id);

      CREATE INDEX IF NOT EXISTS idx_payment_submissions_status
      ON payment_submissions (status, created_at DESC);

      CREATE TABLE IF NOT EXISTS withdrawal_submissions (
        id UUID PRIMARY KEY,
        reference TEXT NOT NULL UNIQUE,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        user_name TEXT NOT NULL,
        user_email TEXT NOT NULL,
        withdrawal_method TEXT NOT NULL,
        amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
        estimated_fee NUMERIC(18, 2) NOT NULL DEFAULT 0,
        net_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
        asset_key TEXT,
        asset_symbol TEXT,
        asset_name TEXT,
        network TEXT,
        wallet_address TEXT,
        wallet_label TEXT,
        bank_holder TEXT,
        bank_name TEXT,
        bank_routing TEXT,
        bank_account TEXT,
        bank_country TEXT,
        wire_beneficiary TEXT,
        wire_bank_name TEXT,
        wire_swift TEXT,
        wire_iban TEXT,
        wire_country TEXT,
        wire_note TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        reviewed_at TIMESTAMPTZ,
        reviewed_by TEXT,
        review_note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_withdrawal_submissions_user_id
      ON withdrawal_submissions (user_id);

      CREATE INDEX IF NOT EXISTS idx_withdrawal_submissions_status
      ON withdrawal_submissions (status, created_at DESC);

      CREATE TABLE IF NOT EXISTS kyc_submissions (
        id UUID PRIMARY KEY,
        reference TEXT NOT NULL UNIQUE,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        user_name TEXT NOT NULL,
        user_email TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        first_name TEXT NOT NULL,
        middle_name TEXT,
        last_name TEXT NOT NULL,
        country_of_origin TEXT NOT NULL,
        document_type TEXT NOT NULL,
        document_image_data_url TEXT NOT NULL,
        document_file_name TEXT NOT NULL,
        document_mime_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        reviewed_at TIMESTAMPTZ,
        reviewed_by TEXT,
        review_note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_kyc_submissions_user_id
      ON kyc_submissions (user_id);

      CREATE INDEX IF NOT EXISTS idx_kyc_submissions_status
      ON kyc_submissions (status, created_at DESC);

      CREATE TABLE IF NOT EXISTS dashboard_accounts (
        user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        account_role TEXT NOT NULL DEFAULT 'Trading Account',
        account_state TEXT NOT NULL DEFAULT 'Session active',
        verification_status TEXT NOT NULL DEFAULT 'unverified',
        wallet_connected BOOLEAN NOT NULL DEFAULT FALSE,
        account_balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
        total_profit NUMERIC(18, 2) NOT NULL DEFAULT 0,
        total_deposit NUMERIC(18, 2) NOT NULL DEFAULT 0,
        total_withdrawal NUMERIC(18, 2) NOT NULL DEFAULT 0,
        bonus_balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
        demo_balance NUMERIC(18, 2) NOT NULL DEFAULT 100000,
        active_plans INTEGER NOT NULL DEFAULT 0,
        pending_items INTEGER NOT NULL DEFAULT 0,
        referral_code TEXT NOT NULL,
        referral_rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 5,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS account_statement_entries (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        source_key TEXT,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        amount NUMERIC(18, 2),
        status TEXT NOT NULL,
        email_delivered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE account_statement_entries
      ADD COLUMN IF NOT EXISTS email_delivered_at TIMESTAMPTZ;

      CREATE INDEX IF NOT EXISTS idx_account_statement_entries_user_id
      ON account_statement_entries (user_id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_account_statement_entries_source_key
      ON account_statement_entries (user_id, source_key)
      WHERE source_key IS NOT NULL;

      CREATE TABLE IF NOT EXISTS trade_records (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        asset_symbol TEXT NOT NULL,
        asset_name TEXT NOT NULL,
        side TEXT NOT NULL,
        amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_trade_records_user_id
      ON trade_records (user_id);

      CREATE TABLE IF NOT EXISTS portfolio_positions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        asset_symbol TEXT NOT NULL,
        asset_name TEXT NOT NULL,
        allocation_usd NUMERIC(18, 2) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        pnl NUMERIC(18, 2) NOT NULL DEFAULT 0,
        opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_portfolio_positions_user_id
      ON portfolio_positions (user_id);

      CREATE TABLE IF NOT EXISTS rate_limit_buckets (
        bucket_key TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        subject_key TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        reset_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_reset_at
      ON rate_limit_buckets (reset_at);
    `);

    this.schemaReady = true;
  }

  private async ensureCelebrityCouponSeed() {
    if (!this.pool) {
      return;
    }

    await this.pool.query(
      `INSERT INTO celebrity_coupons (
        id,
        celebrity_name,
        coupon_code,
        offer_details,
        status,
        expires_at,
        max_redemptions,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (coupon_code) DO NOTHING`,
      [
        randomUUID(),
        'Lama Lama',
        'LAMALAMA',
        'Legacy celebrity onboarding coupon.',
        'active',
        null,
        null,
        'System seed',
      ],
    );
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

  private async findCelebrityCouponByCode(
    queryable: Queryable,
    code: string,
    forUpdate = false,
  ): Promise<CelebrityCoupon | null> {
    const couponCode = this.normalizeCelebrityCouponCode(code);
    if (!couponCode) {
      return null;
    }

    const lockClause = forUpdate ? ' FOR UPDATE' : '';
    const couponResult = await queryable.query<CelebrityCouponRow>(
      `SELECT
        id,
        celebrity_name,
        coupon_code,
        offer_details,
        status,
        expires_at,
        max_redemptions,
        created_at,
        created_by
       FROM celebrity_coupons
       WHERE coupon_code = $1${lockClause}`,
      [couponCode],
    );

    const coupon = couponResult.rows[0];
    if (!coupon) {
      return null;
    }

    const metricsResult = await queryable.query<{
      current_redemptions: number | string;
      last_redeemed_at: Date | string | null;
    }>(
      `SELECT
        COUNT(*) AS current_redemptions,
        MAX(created_at) AS last_redeemed_at
       FROM app_users
       WHERE coupon_accepted = TRUE
         AND UPPER(COALESCE(coupon, '')) = $1`,
      [couponCode],
    );
    const metrics = metricsResult.rows[0];

    return this.toCelebrityCoupon({
      ...coupon,
      current_redemptions: metrics?.current_redemptions ?? 0,
      last_redeemed_at: metrics?.last_redeemed_at ?? null,
    });
  }

  private async findRedeemableCelebrityCoupon(
    queryable: Queryable,
    code: string,
    forUpdate = false,
  ): Promise<CelebrityCoupon | null> {
    const coupon = await this.findCelebrityCouponByCode(queryable, code, forUpdate);
    if (!coupon) {
      return null;
    }

    if (
      coupon.status !== 'active' ||
      (coupon.expiresAt &&
        new Date(coupon.expiresAt).getTime() <= Date.now()) ||
      (typeof coupon.maxRedemptions === 'number' &&
        coupon.currentRedemptions >= coupon.maxRedemptions)
    ) {
      return null;
    }

    return coupon;
  }

  private async ensureDashboardAccountForUser(
    queryable: Queryable,
    user: UserRow,
    welcomeBonusAmount?: number,
  ) {
    if (normalizeUserRole(user.role) === 'admin') {
      return;
    }

    const welcomeBonus = Math.max(
      0,
      Number.isFinite(welcomeBonusAmount)
        ? Number(welcomeBonusAmount)
        : buildCelebrityRewardBonusAmount(),
    );
    const accountState = this.getDashboardAccountState(
      this.normalizeAccountStatus(user.account_status),
    );
    const accountInsertResult = await queryable.query<{
      bonus_balance: number | string;
    }>(
      `INSERT INTO dashboard_accounts (
        user_id,
        referral_code,
        account_state,
        account_balance,
        bonus_balance
      )
      VALUES ($1, $2, $3, $4, $4)
      ON CONFLICT (user_id) DO NOTHING
      RETURNING bonus_balance`,
      [
        user.id,
        `NOVA-${user.username.toUpperCase()}`,
        accountState,
        welcomeBonus,
      ],
    );
    const accountWasCreated = accountInsertResult.rows.length > 0;

    await queryable.query(
      `UPDATE dashboard_accounts
       SET account_state = $2
       WHERE user_id = $1
         AND account_state IS DISTINCT FROM $2`,
      [user.id, accountState],
    );

    await queryable.query(
      `INSERT INTO account_statement_entries (
        id,
        user_id,
        source_key,
        kind,
        title,
        description,
        amount,
        status,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (user_id, source_key) DO NOTHING`,
      [
        randomUUID(),
        user.id,
        'account-created',
        'account_created',
        'Account created',
        'Your Novabit trading account is ready.',
        null,
        'completed',
        user.created_at,
      ],
    );

    if (accountWasCreated && welcomeBonus > 0) {
      await queryable.query(
        `INSERT INTO account_statement_entries (
          id,
          user_id,
          source_key,
          kind,
          title,
          description,
          amount,
          status,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id, source_key) DO NOTHING`,
        [
          randomUUID(),
          user.id,
          'celebrity-reward-bonus',
          'bonus',
          'Celebrity reward bonus',
          'Your signup reward bonus was credited to your Novabit account balance.',
          welcomeBonus,
          'completed',
          user.created_at,
        ],
      );
    }

    if (user.coupon_accepted && user.coupon) {
      await queryable.query(
        `INSERT INTO account_statement_entries (
          id,
          user_id,
          source_key,
          kind,
          title,
          description,
          amount,
          status,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id, source_key) DO NOTHING`,
        [
          randomUUID(),
          user.id,
          'coupon-linked',
          'bonus',
          'Coupon linked',
          `Celebrity coupon ${user.coupon.toUpperCase()} was attached to this account.`,
          0,
          'completed',
          user.created_at,
        ],
      );
    }
  }

  private async syncPlanInterestForUser(
    queryable: Queryable,
    userId: string,
    forUpdate = false,
  ): Promise<DashboardAccountRow | null> {
    const lockClause = forUpdate ? ' FOR UPDATE' : '';
    const accountResult = await queryable.query<DashboardAccountRow>(
      `SELECT
        user_id,
        account_role,
        account_state,
        verification_status,
        wallet_connected,
        account_balance,
        total_profit,
        total_deposit,
        total_withdrawal,
        bonus_balance,
        demo_balance,
        active_plans,
        pending_items,
        referral_code,
        referral_rate_percent,
        updated_at
       FROM dashboard_accounts
       WHERE user_id = $1
       LIMIT 1${lockClause}`,
      [userId],
    );

    const account = accountResult.rows[0];
    if (!account) {
      return null;
    }

    const approvedSubmissionResult =
      await queryable.query<PaymentSubmissionAccrualRow>(
        `SELECT
          id,
          plan_key,
          plan_name,
          amount,
          status,
          created_at,
          reviewed_at
         FROM payment_submissions
         WHERE user_id = $1
           AND status = 'approved'
         ORDER BY created_at DESC`,
        [userId],
      );

    const planInterestSync = syncDashboardAccountPlanInterest(
      this.toDashboardAccount(account, [], [], []),
      approvedSubmissionResult.rows.map((row) => ({
        id: row.id,
        status: row.status as PaymentSubmission['status'],
        planKey: row.plan_key,
        planName: row.plan_name,
        amount: this.toNumber(row.amount),
        createdAt: toIsoString(row.created_at),
        reviewedAt: row.reviewed_at ? toIsoString(row.reviewed_at) : null,
      })),
    );

    if (!planInterestSync.changed) {
      return account;
    }

    for (const credit of planInterestSync.credits) {
      await queryable.query(
        `INSERT INTO account_statement_entries (
          id,
          user_id,
          source_key,
          kind,
          title,
          description,
          amount,
          status,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id, source_key) DO NOTHING`,
        [
          randomUUID(),
          userId,
          credit.sourceKey,
          'bonus',
          'Daily interest credited',
          `${credit.planName} daily interest for day ${credit.accruedDay} of ${credit.cycleDays} was added to your available balance.`,
          credit.amount,
          'completed',
          credit.createdAt,
        ],
      );
    }

    await queryable.query(
      `UPDATE dashboard_accounts
       SET total_profit = $2,
           account_balance = $3,
           active_plans = $4,
           updated_at = $5
       WHERE user_id = $1`,
      [
        userId,
        planInterestSync.totalProfit,
        planInterestSync.accountBalance,
        planInterestSync.activePlans,
        planInterestSync.updatedAt,
      ],
    );

    account.total_profit = planInterestSync.totalProfit;
    account.account_balance = planInterestSync.accountBalance;
    account.active_plans = planInterestSync.activePlans;
    account.updated_at = planInterestSync.updatedAt;

    return account;
  }

  private async safeRollback(client: PoolClient) {
    try {
      await client.query('ROLLBACK');
    } catch {}
  }

  private async disposePool() {
    if (!this.pool) {
      return;
    }

    const pool = this.pool;
    this.pool = null;

    try {
      await pool.end();
    } catch {
      this.logger.warn('Failed to close PostgreSQL pool cleanly.');
    }
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    );
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

  private toPublicUser(user: UserRow): PublicUser {
    return {
      id: user.id,
      username: user.username,
      role: normalizeUserRole(user.role),
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.email_verified),
      phone: user.phone,
      phoneVerified: Boolean(user.phone_verified),
      country: user.country,
      coupon: user.coupon,
      couponAccepted: user.coupon_accepted,
      accountStatus: this.normalizeAccountStatus(user.account_status),
      createdAt: toIsoString(user.created_at),
    };
  }

  private toAdminUserProfile(row: AdminUserProfileRow): AdminUserProfile {
    const totalDeposit = Math.max(
      this.toNumber(row.total_deposit),
      this.toNumber(row.approved_deposit_total),
    );
    const approvedDepositCount = Number(row.approved_deposit_count || 0);

    return {
      id: row.id,
      username: row.username,
      role: normalizeUserRole(row.role),
      name: row.name,
      email: row.email,
      emailVerified: Boolean(row.email_verified),
      phone: row.phone,
      phoneVerified: Boolean(row.phone_verified),
      country: row.country,
      coupon: row.coupon,
      couponAccepted: row.coupon_accepted,
      accountStatus: this.normalizeAccountStatus(row.account_status),
      createdAt: toIsoString(row.created_at),
      verificationStatus: (row.verification_status ||
        'unverified') as DashboardAccount['verificationStatus'],
      accountState: row.account_state || 'Session active',
      accountBalance: this.toNumber(row.account_balance),
      totalDeposit,
      totalWithdrawal: this.toNumber(row.total_withdrawal),
      totalProfit: this.toNumber(row.total_profit),
      bonusBalance: this.toNumber(row.bonus_balance),
      activePlans: Number(row.active_plans || 0),
      pendingItems: Number(row.pending_items || 0),
      isInvestor: totalDeposit > 0 || approvedDepositCount > 0,
      approvedDepositCount,
      approvedDepositTotal: this.toNumber(row.approved_deposit_total),
      lastDepositAt: row.last_deposit_at ? toIsoString(row.last_deposit_at) : null,
    };
  }

  private toCelebrityCoupon(row: CelebrityCouponRow): CelebrityCoupon {
    const currentRedemptions = Number(row.current_redemptions || 0);
    const maxRedemptions =
      row.max_redemptions == null ? null : Number(row.max_redemptions);

    return {
      id: row.id,
      celebrityName: row.celebrity_name,
      couponCode: this.normalizeCelebrityCouponCode(row.coupon_code),
      offerDetails: row.offer_details,
      status: this.normalizeCelebrityCouponStatus(row.status),
      expiresAt: row.expires_at ? toIsoString(row.expires_at) : null,
      maxRedemptions,
      currentRedemptions,
      remainingRedemptions:
        typeof maxRedemptions === 'number'
          ? Math.max(maxRedemptions - currentRedemptions, 0)
          : null,
      lastRedeemedAt: row.last_redeemed_at
        ? toIsoString(row.last_redeemed_at)
        : null,
      createdAt: toIsoString(row.created_at),
      createdBy: row.created_by,
    };
  }

  private async ensureAdminSeed() {
    if (!this.pool) {
      return;
    }

    const profile = readAdminSeedProfile();
    const username = normalizeUsername(profile.username);
    const email = normalizeEmail(profile.email);
    const existingResult = await this.pool.query<UserRow>(
      `SELECT
        id,
        username,
        role,
        name,
        email,
        email_verified,
        phone,
        phone_verified,
        country,
        coupon,
        coupon_accepted,
        account_status,
        password_hash,
        password_salt,
        created_at
       FROM app_users
       WHERE username = $1 OR email = $2
       LIMIT 1`,
      [username, email],
    );

    const existingUser = existingResult.rows[0];
    if (existingUser) {
      if (normalizeUserRole(existingUser.role) !== 'admin') {
        await this.pool.query(
          `UPDATE app_users
           SET role = 'admin',
               email_verified = TRUE,
               phone_verified = TRUE,
               account_status = 'active'
           WHERE id = $1`,
          [existingUser.id],
        );
      }

      return;
    }

    const { passwordHash, passwordSalt } = hashPassword(profile.password);
    await this.pool.query(
      `INSERT INTO app_users (
        id,
        username,
        role,
        name,
        email,
        email_verified,
        phone,
        phone_verified,
        country,
        coupon,
        coupon_accepted,
        account_status,
        password_hash,
        password_salt
      )
      VALUES ($1, $2, $3, $4, $5, TRUE, $6, TRUE, $7, NULL, FALSE, 'active', $8, $9)`,
      [
        randomUUID(),
        username,
        'admin',
        profile.name,
        email,
        normalizePhoneNumber(profile.phone) || profile.phone,
        profile.country,
        passwordHash,
        passwordSalt,
      ],
    );
  }

  private toPasswordResetRequest(
    request: PasswordResetRequestRow,
  ): PasswordResetRequest {
    return {
      id: request.id,
      reference: request.reference,
      email: request.email,
      createdAt: toIsoString(request.created_at),
    };
  }

  private toContactSubmission(
    submission: ContactSubmissionRow,
  ): ContactSubmission {
    return {
      id: submission.id,
      reference: submission.reference,
      topic: submission.topic,
      name: submission.name,
      email: submission.email,
      message: submission.message,
      createdAt: toIsoString(submission.created_at),
    };
  }

  private toPaymentSubmission(row: PaymentSubmissionRow): PaymentSubmission {
    return {
      id: row.id,
      reference: row.reference,
      userId: row.user_id,
      userName: row.user_name,
      userEmail: row.user_email,
      userUsername: row.user_username ?? null,
      userPhone: row.user_phone ?? null,
      userCountry: row.user_country ?? null,
      userCreatedAt: row.user_created_at ? toIsoString(row.user_created_at) : null,
      planKey: row.plan_key,
      planName: row.plan_name,
      fundingMethod: row.funding_method as PaymentSubmission['fundingMethod'],
      amount: this.toNumber(row.amount),
      assetKey: row.asset_key,
      assetSymbol: row.asset_symbol,
      assetName: row.asset_name,
      network: row.network,
      routeAddress: row.route_address,
      proofImageDataUrl: row.proof_image_data_url,
      proofFileName: row.proof_file_name,
      proofMimeType: row.proof_mime_type,
      proofNote: row.proof_note,
      status: row.status as PaymentSubmission['status'],
      createdAt: toIsoString(row.created_at),
      reviewedAt: row.reviewed_at ? toIsoString(row.reviewed_at) : null,
      reviewedBy: row.reviewed_by,
      reviewNote: row.review_note,
    };
  }

  private toWithdrawalSubmission(
    row: WithdrawalSubmissionRow,
  ): WithdrawalSubmission {
    return {
      id: row.id,
      reference: row.reference,
      userId: row.user_id,
      userName: row.user_name,
      userEmail: row.user_email,
      userUsername: row.user_username ?? null,
      userPhone: row.user_phone ?? null,
      userCountry: row.user_country ?? null,
      userCreatedAt: row.user_created_at ? toIsoString(row.user_created_at) : null,
      withdrawalMethod:
        row.withdrawal_method as WithdrawalSubmission['withdrawalMethod'],
      amount: this.toNumber(row.amount),
      estimatedFee: this.toNumber(row.estimated_fee),
      netAmount: this.toNumber(row.net_amount),
      assetKey: row.asset_key,
      assetSymbol: row.asset_symbol,
      assetName: row.asset_name,
      network: row.network,
      walletAddress: row.wallet_address,
      walletLabel: row.wallet_label,
      bankHolder: row.bank_holder,
      bankName: row.bank_name,
      bankRouting: row.bank_routing,
      bankAccount: row.bank_account,
      bankCountry: row.bank_country,
      wireBeneficiary: row.wire_beneficiary,
      wireBankName: row.wire_bank_name,
      wireSwift: row.wire_swift,
      wireIban: row.wire_iban,
      wireCountry: row.wire_country,
      wireNote: row.wire_note,
      status: row.status as WithdrawalSubmission['status'],
      createdAt: toIsoString(row.created_at),
      reviewedAt: row.reviewed_at ? toIsoString(row.reviewed_at) : null,
      reviewedBy: row.reviewed_by,
      reviewNote: row.review_note,
    };
  }

  private toKycSubmission(row: KycSubmissionRow): KycSubmission {
    return {
      id: row.id,
      reference: row.reference,
      userId: row.user_id,
      userName: row.user_name,
      userEmail: row.user_email,
      userUsername: row.user_username ?? null,
      userPhone: row.user_phone ?? null,
      userCountry: row.user_country ?? null,
      userCreatedAt: row.user_created_at ? toIsoString(row.user_created_at) : null,
      email: row.email,
      phone: row.phone,
      firstName: row.first_name,
      middleName: row.middle_name,
      lastName: row.last_name,
      countryOfOrigin: row.country_of_origin,
      documentType: row.document_type as KycSubmission['documentType'],
      documentImageDataUrl: row.document_image_data_url,
      documentFileName: row.document_file_name,
      documentMimeType: row.document_mime_type,
      status: row.status as KycSubmission['status'],
      createdAt: toIsoString(row.created_at),
      reviewedAt: row.reviewed_at ? toIsoString(row.reviewed_at) : null,
      reviewedBy: row.reviewed_by,
      reviewNote: row.review_note,
    };
  }

  private buildKycSubmissionSelectClause(tailClause: string) {
    return `
      SELECT
        ks.id,
        ks.reference,
        ks.user_id,
        ks.user_name,
        ks.user_email,
        u.username AS user_username,
        u.phone AS user_phone,
        u.country AS user_country,
        u.created_at AS user_created_at,
        ks.email,
        ks.phone,
        ks.first_name,
        ks.middle_name,
        ks.last_name,
        ks.country_of_origin,
        ks.document_type,
        ks.document_image_data_url,
        ks.document_file_name,
        ks.document_mime_type,
        ks.status,
        ks.reviewed_at,
        ks.reviewed_by,
        ks.review_note,
        ks.created_at
      FROM kyc_submissions ks
      LEFT JOIN app_users u ON u.id = ks.user_id
      ${tailClause}`;
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

  private toDashboardAccount(
    account: DashboardAccountRow,
    statementRows: DashboardStatementEntryRow[],
    tradeRows: DashboardTradeRecordRow[],
    portfolioRows: DashboardPortfolioPositionRow[],
  ): DashboardAccount {
    return {
      userId: account.user_id,
      accountRole: account.account_role,
      accountState: account.account_state,
      verificationStatus: account.verification_status as DashboardAccount['verificationStatus'],
      walletConnected: account.wallet_connected,
      accountBalance: this.toNumber(account.account_balance),
      totalProfit: this.toNumber(account.total_profit),
      totalDeposit: this.toNumber(account.total_deposit),
      totalWithdrawal: this.toNumber(account.total_withdrawal),
      bonusBalance: this.toNumber(account.bonus_balance),
      demoBalance: this.toNumber(account.demo_balance),
      activePlans: Number(account.active_plans || 0),
      pendingItems: Number(account.pending_items || 0),
      referralCode: account.referral_code,
      referralRatePercent: this.toNumber(account.referral_rate_percent),
      statementEntries: statementRows.map((row) => this.toDashboardStatementEntry(row)),
      tradeRecords: tradeRows.map((row) => this.toDashboardTradeRecord(row)),
      portfolioPositions: portfolioRows.map((row) =>
        this.toDashboardPortfolioPosition(row),
      ),
      updatedAt: toIsoString(account.updated_at),
    };
  }

  private toDashboardStatementEntry(
    row: DashboardStatementEntryRow,
  ): DashboardStatementEntry {
    return {
      id: row.id,
      sourceKey: row.source_key,
      kind: row.kind as DashboardStatementEntry['kind'],
      title: row.title,
      description: row.description,
      amount: row.amount === null ? null : this.toNumber(row.amount),
      status: row.status as DashboardStatementEntry['status'],
      emailDeliveredAt: row.email_delivered_at
        ? toIsoString(row.email_delivered_at)
        : null,
      createdAt: toIsoString(row.created_at),
    };
  }

  private toDashboardTradeRecord(
    row: DashboardTradeRecordRow,
  ): DashboardTradeRecord {
    return {
      id: row.id,
      assetSymbol: row.asset_symbol,
      assetName: row.asset_name,
      side: row.side as DashboardTradeRecord['side'],
      amount: this.toNumber(row.amount),
      status: row.status as DashboardTradeRecord['status'],
      openedAt: toIsoString(row.opened_at),
    };
  }

  private toDashboardPortfolioPosition(
    row: DashboardPortfolioPositionRow,
  ): DashboardPortfolioPosition {
    return {
      id: row.id,
      assetSymbol: row.asset_symbol,
      assetName: row.asset_name,
      allocationUsd: this.toNumber(row.allocation_usd),
      status: row.status as DashboardPortfolioPosition['status'],
      pnl: this.toNumber(row.pnl),
      openedAt: toIsoString(row.opened_at),
    };
  }

  private toNumber(value: number | string | null | undefined) {
    if (typeof value === 'number') {
      return value;
    }

    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}

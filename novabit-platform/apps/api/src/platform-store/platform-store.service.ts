import { Injectable, Logger } from '@nestjs/common';
import { loadApiEnv } from '../config/load-env';
import { InMemoryPlatformStore } from './in-memory-platform.store';
import { PostgresPlatformStore } from './postgres-platform.store';
import { PlatformStoreUnavailableError } from './platform-store.errors';
import type {
  ConfiguredPlatformStoreDriver,
  ConsumeRateLimitInput,
  CreateContactSubmissionInput,
  CreatePendingRegistrationInput,
  CreateKycSubmissionInput,
  CreatePaymentSubmissionInput,
  CreateWithdrawalSubmissionInput,
  CreateUserInput,
  DailyInterestEmailDispatch,
  DashboardAccount,
  AccountStatus,
  PendingRegistrationChallenge,
  PlatformStoreAdapter,
  PlatformStoreDriver,
  PlatformSession,
  PlatformStoreStatus,
  ReviewPaymentSubmissionInput,
  ReviewKycSubmissionInput,
  ReviewWithdrawalSubmissionInput,
  RateLimitConsumptionResult,
  AdminUserProfile,
  CreateCelebrityCouponInput,
  RegistrationAvailabilityInput,
} from './platform-store.types';

@Injectable()
export class PlatformStoreService {
  private readonly logger = new Logger(PlatformStoreService.name);
  private activeStore: PlatformStoreAdapter | null = null;
  private fallbackLogged = false;

  constructor(
    private readonly inMemoryStore: InMemoryPlatformStore,
    private readonly postgresStore: PostgresPlatformStore,
  ) {
    loadApiEnv();
  }

  async createUser(input: CreateUserInput) {
    const store = await this.resolveStore();
    return store.createUser(input);
  }

  async createPendingRegistration(
    input: CreatePendingRegistrationInput,
  ): Promise<PendingRegistrationChallenge> {
    const store = await this.resolveStore();
    return store.createPendingRegistration(input);
  }

  async resendPendingRegistrationChallenge(
    pendingRegistrationId: string,
  ): Promise<PendingRegistrationChallenge> {
    const store = await this.resolveStore();
    return store.resendPendingRegistrationChallenge(pendingRegistrationId);
  }

  async verifyPendingRegistration(
    pendingRegistrationId: string,
    code: string,
  ) {
    const store = await this.resolveStore();
    return store.verifyPendingRegistration(pendingRegistrationId, code);
  }

  async checkRegistrationAvailability(input: RegistrationAvailabilityInput) {
    const store = await this.resolveStore();
    return store.checkRegistrationAvailability(input);
  }

  async validateUser(login: string, password: string) {
    const store = await this.resolveStore();
    return store.validateUser(login, password);
  }

  async createPasswordResetRequest(email: string) {
    const store = await this.resolveStore();
    return store.createPasswordResetRequest(email);
  }

  async createEmailVerificationChallenge(email: string) {
    const store = await this.resolveStore();
    return store.createEmailVerificationChallenge(email);
  }

  async createPhoneVerificationChallenge(phone: string) {
    const store = await this.resolveStore();
    return store.createPhoneVerificationChallenge(phone);
  }

  async verifyEmailCode(email: string, code: string) {
    const store = await this.resolveStore();
    return store.verifyEmailCode(email, code);
  }

  async verifyPhoneCode(phone: string, code: string) {
    const store = await this.resolveStore();
    return store.verifyPhoneCode(phone, code);
  }

  async createSession(
    userId: string,
    remember: boolean,
  ): Promise<PlatformSession> {
    const store = await this.resolveStore();
    return store.createSession(userId, remember);
  }

  async refreshSession(token: string): Promise<PlatformSession | null> {
    const store = await this.resolveStore();
    return store.refreshSession(token);
  }

  async getUserBySessionToken(token: string) {
    const store = await this.resolveStore();
    return store.getUserBySessionToken(token);
  }

  async revokeSession(token: string) {
    const store = await this.resolveStore();
    return store.revokeSession(token);
  }

  async listAdminUsers(): Promise<AdminUserProfile[]> {
    const store = await this.resolveStore();
    return store.listAdminUsers();
  }

  async updateUserAccountStatus(
    userId: string,
    status: AccountStatus,
  ): Promise<AdminUserProfile> {
    const store = await this.resolveStore();
    return store.updateUserAccountStatus(userId, status);
  }

  async deleteUserAccount(userId: string): Promise<void> {
    const store = await this.resolveStore();
    return store.deleteUserAccount(userId);
  }

  async listCelebrityCoupons() {
    const store = await this.resolveStore();
    return store.listCelebrityCoupons();
  }

  async createCelebrityCoupon(input: CreateCelebrityCouponInput) {
    const store = await this.resolveStore();
    return store.createCelebrityCoupon(input);
  }

  async validateCelebrityCoupon(code: string) {
    const store = await this.resolveStore();
    return store.validateCelebrityCoupon(code);
  }

  async getDashboardAccount(userId: string): Promise<DashboardAccount> {
    const store = await this.resolveStore();
    return store.getDashboardAccount(userId);
  }

  async claimPendingDailyInterestEmailDispatch(
    userId: string,
  ): Promise<DailyInterestEmailDispatch> {
    const store = await this.resolveStore();
    return store.claimPendingDailyInterestEmailDispatch(userId);
  }

  async listPaymentSubmissionsForUser(userId: string) {
    const store = await this.resolveStore();
    return store.listPaymentSubmissionsForUser(userId);
  }

  async listPaymentSubmissions() {
    const store = await this.resolveStore();
    return store.listPaymentSubmissions();
  }

  async createPaymentSubmission(input: CreatePaymentSubmissionInput) {
    const store = await this.resolveStore();
    return store.createPaymentSubmission(input);
  }

  async reviewPaymentSubmission(input: ReviewPaymentSubmissionInput) {
    const store = await this.resolveStore();
    return store.reviewPaymentSubmission(input);
  }

  async listWithdrawalSubmissionsForUser(userId: string) {
    const store = await this.resolveStore();
    return store.listWithdrawalSubmissionsForUser(userId);
  }

  async listWithdrawalSubmissions() {
    const store = await this.resolveStore();
    return store.listWithdrawalSubmissions();
  }

  async createWithdrawalSubmission(input: CreateWithdrawalSubmissionInput) {
    const store = await this.resolveStore();
    return store.createWithdrawalSubmission(input);
  }

  async reviewWithdrawalSubmission(input: ReviewWithdrawalSubmissionInput) {
    const store = await this.resolveStore();
    return store.reviewWithdrawalSubmission(input);
  }

  async listKycSubmissionsForUser(userId: string) {
    const store = await this.resolveStore();
    return store.listKycSubmissionsForUser(userId);
  }

  async listKycSubmissions() {
    const store = await this.resolveStore();
    return store.listKycSubmissions();
  }

  async createKycSubmission(input: CreateKycSubmissionInput) {
    const store = await this.resolveStore();
    return store.createKycSubmission(input);
  }

  async reviewKycSubmission(input: ReviewKycSubmissionInput) {
    const store = await this.resolveStore();
    return store.reviewKycSubmission(input);
  }

  async createContactSubmission(input: CreateContactSubmissionInput) {
    const store = await this.resolveStore();
    return store.createContactSubmission(input);
  }

  async consumeRateLimit(
    input: ConsumeRateLimitInput,
  ): Promise<RateLimitConsumptionResult> {
    const store = await this.resolveStore();
    return store.consumeRateLimit(input);
  }

  async getResolvedDriver(): Promise<PlatformStoreDriver> {
    const store = await this.resolveStore();
    return store.driver;
  }

  async getStatus(): Promise<PlatformStoreStatus> {
    const configuredDriver = this.getConfiguredDriver();
    const database = this.postgresStore.getDatabaseState();

    if (this.activeStore) {
      return {
        configuredDriver,
        resolvedDriver: this.activeStore.driver,
        fallbackActive:
          this.activeStore.driver === 'in-memory' &&
          configuredDriver !== 'memory' &&
          database.configured,
        database,
      };
    }

    if (configuredDriver === 'memory') {
      return {
        configuredDriver,
        resolvedDriver: 'in-memory',
        fallbackActive: false,
        database,
      };
    }

    if (!database.configured) {
      return {
        configuredDriver,
        resolvedDriver: configuredDriver === 'auto' ? 'in-memory' : null,
        fallbackActive: false,
        database,
      };
    }

    const ready = await this.postgresStore.ensureReady();
    const refreshedDatabase = this.postgresStore.getDatabaseState();

    if (ready) {
      return {
        configuredDriver,
        resolvedDriver: 'postgres',
        fallbackActive: false,
        database: refreshedDatabase,
      };
    }

    return {
      configuredDriver,
      resolvedDriver: configuredDriver === 'auto' ? 'in-memory' : null,
      fallbackActive: configuredDriver === 'auto',
      database: refreshedDatabase,
    };
  }

  private getConfiguredDriver(): ConfiguredPlatformStoreDriver {
    const rawDriver = (process.env.PERSISTENCE_DRIVER ?? 'auto')
      .trim()
      .toLowerCase();

    if (rawDriver === 'memory' || rawDriver === 'postgres') {
      return rawDriver;
    }

    return 'auto';
  }

  private async resolveStore(): Promise<PlatformStoreAdapter> {
    if (this.activeStore) {
      return this.activeStore;
    }

    const configuredDriver = this.getConfiguredDriver();

    if (configuredDriver === 'memory') {
      this.activeStore = this.inMemoryStore;
      return this.activeStore;
    }

    if (!this.postgresStore.isConfigured()) {
      if (configuredDriver === 'postgres') {
        throw new PlatformStoreUnavailableError(
          'PERSISTENCE_DRIVER is set to postgres but DATABASE_URL is not configured.',
        );
      }

      this.activeStore = this.inMemoryStore;
      return this.activeStore;
    }

    const ready = await this.postgresStore.ensureReady();
    if (ready) {
      this.activeStore = this.postgresStore;
      return this.activeStore;
    }

    const lastError =
      this.postgresStore.getLastConnectionError() ??
      'Unable to connect to PostgreSQL.';

    if (configuredDriver === 'postgres') {
      throw new PlatformStoreUnavailableError(lastError);
    }

    this.activeStore = this.inMemoryStore;
    this.logFallback(lastError);
    return this.activeStore;
  }

  private logFallback(message: string) {
    if (this.fallbackLogged) {
      return;
    }

    this.fallbackLogged = true;
    this.logger.warn(`Falling back to in-memory persistence. ${message}`);
  }
}

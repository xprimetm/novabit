import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  PlatformStoreConflictError,
  PlatformStoreUnavailableError,
} from '../platform-store/platform-store.errors';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { PlatformStoreService } from '../platform-store/platform-store.service';
import { SESSION_IDLE_TIMEOUT_MINUTES } from '../platform-store/platform-store.utils';
import type {
  CelebrityCoupon,
  PlatformSession,
  PublicUser,
  PlatformStoreDriver,
  VerificationChannel,
} from '../platform-store/platform-store.types';

export type ContactVerificationPayload = {
  required: boolean;
  channel: VerificationChannel;
  destination: string;
  deliveryMode: string;
  sent: boolean;
  expiresAt: string | null;
  pendingRegistrationId?: string;
  devCode?: string;
};

export type RegisterResponse = {
  success: true;
  message: string;
  pendingRegistrationId: string;
  verification: ContactVerificationPayload;
  emailVerification?: ContactVerificationPayload;
};

export type LoginResponse = {
  success: true;
  message: string;
  user: PublicUser;
  sessionMode: PlatformStoreDriver;
  remember: boolean;
  sessionExpiresAt: string;
  redirectTo: '/dashboard' | '/admin-dashboard';
};

export type ForgotPasswordResponse = {
  success: true;
  message: string;
  reference: string;
};

export type ContactVerificationResponse = {
  success: true;
  message: string;
  user: PublicUser;
  channel: VerificationChannel;
  sessionMode: PlatformStoreDriver;
  remember: boolean;
  sessionExpiresAt: string;
  redirectTo: '/dashboard';
};

export type ContactVerificationResendResponse = {
  success: true;
  message: string;
  verification: ContactVerificationPayload;
  emailVerification?: ContactVerificationPayload;
};

export type EmailVerificationResponse = ContactVerificationResponse;
export type EmailVerificationResendResponse =
  ContactVerificationResendResponse;

export type CelebrityCouponValidationResponse = {
  valid: boolean;
  coupon: CelebrityCoupon | null;
  message: string;
};

export type RegistrationAvailabilityField = {
  value: string;
  available: boolean;
};

export type RegistrationAvailabilityResponse = {
  success: true;
  username?: RegistrationAvailabilityField;
  email?: RegistrationAvailabilityField;
  phone?: RegistrationAvailabilityField;
};

export type AuthenticatedUserResponse = {
  authenticated: boolean;
  user: PublicUser | null;
  sessionMode: PlatformStoreDriver | null;
};

export type LogoutResponse = {
  success: true;
  message: string;
};

export type SessionRefreshResponse = {
  success: true;
  sessionExpiresAt: string;
  idleTimeoutMinutes: number;
};

type LoginResult = LoginResponse & {
  session: PlatformSession;
};

type ContactVerificationResult = ContactVerificationResponse & {
  session: PlatformSession;
};

type SessionRefreshResult = SessionRefreshResponse & {
  session: PlatformSession;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly store: PlatformStoreService,
    private readonly emailNotifications: EmailNotificationService,
  ) {}

  async register(payload: Record<string, unknown>): Promise<RegisterResponse> {
    const username = this.readRequiredString(payload, 'username');
    const firstName = this.readOptionalString(payload, 'firstName');
    const lastName = this.readOptionalString(payload, 'lastName');
    const name = this.resolveDisplayName(payload, firstName, lastName);
    const email = this.readRequiredString(payload, 'email');
    const phone = this.readRequiredString(payload, 'phone');
    const country =
      this.readOptionalString(payload, 'country') || 'United States';
    const password = this.readRequiredString(payload, 'password');
    const passwordConfirmation = this.readRequiredString(
      payload,
      'passwordConfirmation',
    );
    const agree = payload.agree === true;
    const coupon = this.readOptionalString(payload, 'coupon');
    const requestedVerificationMethod = this.readVerificationChannel(
      payload,
      'verificationMethod',
    );
    const verificationMethod = this.resolveSignupVerificationChannel(
      requestedVerificationMethod,
    );

    if (!email.includes('@')) {
      throw new BadRequestException('Enter a valid email address.');
    }

    if (password.length < 8) {
      throw new BadRequestException(
        'Password must be at least 8 characters long.',
      );
    }

    if (password !== passwordConfirmation) {
      throw new BadRequestException('Passwords do not match.');
    }

    if (!agree) {
      throw new BadRequestException(
        'You must accept the terms before creating an account.',
      );
    }

    try {
      const challenge = await this.store.createPendingRegistration({
        username,
        name,
        email,
        phone,
        country,
        password,
        coupon,
        verificationChannel: verificationMethod,
      });
      const verification = await this.deliverPendingRegistrationChallenge(
        {
          username,
          name,
          email,
          phone,
          country,
          coupon: coupon || null,
        },
        challenge,
      );

      return {
        success: true,
        message:
          'Enter the verification code to finish creating your account.',
        pendingRegistrationId: challenge.pendingRegistrationId,
        verification,
        emailVerification:
          verification.channel === 'email' ? verification : undefined,
      };
    } catch (error) {
      if (error instanceof PlatformStoreConflictError) {
        throw new BadRequestException(error.message);
      }

      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw new BadRequestException(
        error instanceof Error ? error.message : 'Registration failed.',
      );
    }
  }

  async checkRegistrationAvailability(
    payload: Record<string, unknown>,
  ): Promise<RegistrationAvailabilityResponse> {
    const username = this.readOptionalString(payload, 'username');
    const email = this.readOptionalString(payload, 'email');
    const phone = this.readOptionalString(payload, 'phone');

    if (!username && !email && !phone) {
      throw new BadRequestException(
        'Provide a username, email address, or phone number to check.',
      );
    }

    if (email && !email.includes('@')) {
      throw new BadRequestException('Enter a valid email address.');
    }

    if (phone && !phone.replace(/\D/g, '')) {
      throw new BadRequestException('Enter a valid phone number.');
    }

    try {
      const availability = await this.store.checkRegistrationAvailability({
        username,
        email,
        phone,
      });

      return {
        success: true,
        username: username
          ? {
              value: username,
              available: availability.username !== false,
            }
          : undefined,
        email: email
          ? {
              value: email,
              available: availability.email !== false,
            }
          : undefined,
        phone: phone
          ? {
              value: phone,
              available: availability.phone !== false,
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async login(payload: Record<string, unknown>): Promise<LoginResult> {
    const emailOrUsername = this.readRequiredString(payload, 'emailOrUsername');
    const password = this.readRequiredString(payload, 'password');
    const remember = payload.remember === true;
    let user: PublicUser | null;

    try {
      user = await this.store.validateUser(emailOrUsername, password);
    } catch (error) {
      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }

    if (!user) {
      throw new UnauthorizedException('Invalid email, username, or password.');
    }

    if (user.role === 'admin') {
      throw new UnauthorizedException(
        'Use the admin console to sign in with this account.',
      );
    }

    this.assertAccountIsActive(user);

    if (!this.isContactVerified(user)) {
      throw new UnauthorizedException(
        'Verify your email address or phone number before opening the dashboard.',
      );
    }

    const session = await this.store.createSession(user.id, remember);
    const sessionMode = await this.store.getResolvedDriver();
    void this.emailNotifications.sendSecurityAlert(user, 'New dashboard sign-in', [
      'A new sign-in was completed on your Novabit dashboard.',
      'If this was not you, contact Novabit support immediately.',
    ]);

    return {
      success: true,
      message: 'Credentials verified by the Novabit platform API.',
      user,
      sessionMode,
      remember,
      sessionExpiresAt: session.expiresAt,
      redirectTo: '/dashboard',
      session,
    };
  }

  async adminLogin(payload: Record<string, unknown>): Promise<LoginResult> {
    const emailOrUsername = this.readRequiredString(payload, 'emailOrUsername');
    const password = this.readRequiredString(payload, 'password');
    const remember = payload.remember === true;
    let user: PublicUser | null;

    try {
      user = await this.store.validateUser(emailOrUsername, password);
    } catch (error) {
      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }

    if (!user || user.role !== 'admin') {
      throw new UnauthorizedException('Invalid admin username or password.');
    }

    this.assertAccountIsActive(user);

    const session = await this.store.createSession(user.id, remember);
    const sessionMode = await this.store.getResolvedDriver();
    void this.emailNotifications.sendSecurityAlert(user, 'New admin sign-in', [
      'A new sign-in was completed on the Novabit admin console.',
      'If this was not you, rotate the admin password immediately.',
    ]);

    return {
      success: true,
      message: 'Admin credentials verified by the Novabit platform API.',
      user,
      sessionMode,
      remember,
      sessionExpiresAt: session.expiresAt,
      redirectTo: '/admin-dashboard',
      session,
    };
  }

  async forgotPassword(
    payload: Record<string, unknown>,
  ): Promise<ForgotPasswordResponse> {
    const email = this.readRequiredString(payload, 'email');

    if (!email.includes('@')) {
      throw new BadRequestException('Enter a valid email address.');
    }

    try {
      const request = await this.store.createPasswordResetRequest(email);
      void this.emailNotifications.sendPasswordResetRequest(
        request.email,
        request.reference,
      );

      return {
        success: true,
        message:
          'If an account matches that email, a reset request has been queued by the Novabit platform API.',
        reference: request.reference,
      };
    } catch (error) {
      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async verifyContact(
    payload: Record<string, unknown>,
  ): Promise<ContactVerificationResult> {
    const pendingRegistrationId = this.readOptionalString(
      payload,
      'pendingRegistrationId',
    );
    const channel = this.readVerificationChannel(payload, 'channel');
    const code = this.readRequiredString(payload, 'code');

    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException('Enter the 6-digit verification code.');
    }

    try {
      let user: PublicUser;
      let resolvedChannel = channel;

      if (pendingRegistrationId) {
        user = await this.store.verifyPendingRegistration(
          pendingRegistrationId,
          code,
        );
      } else if (channel === 'phone') {
        const phone = this.readRequiredString(payload, 'phone');
        user = await this.store.verifyPhoneCode(phone, code);
      } else {
        const email = this.readRequiredString(payload, 'email');

        if (!email.includes('@')) {
          throw new BadRequestException('Enter a valid email address.');
        }

        user = await this.store.verifyEmailCode(email, code);
      }

      const session = await this.store.createSession(user.id, false);
      const sessionMode = await this.store.getResolvedDriver();
      const dashboard = await this.store.getDashboardAccount(user.id);

      if (Number(dashboard.bonusBalance) > 0) {
        void this.emailNotifications.sendWelcomeBonus(
          user,
          dashboard.bonusBalance,
          dashboard.accountBalance,
        );
      }

      if (pendingRegistrationId) {
        resolvedChannel = user.phoneVerified ? 'phone' : 'email';
      }

      void this.emailNotifications.sendSecurityAlert(
        user,
        resolvedChannel === 'phone' ? 'Phone verified' : 'Email verified',
        [
          resolvedChannel === 'phone'
            ? 'Your Novabit account phone number has been verified.'
            : 'Your Novabit account email address has been verified.',
          'Your account is ready and your dashboard session has started.',
        ],
      );

      return {
        success: true,
        message: 'Verification complete. Redirecting to your dashboard.',
        user,
        channel: resolvedChannel,
        sessionMode,
        remember: false,
        sessionExpiresAt: session.expiresAt,
        redirectTo: '/dashboard',
        session,
      };
    } catch (error) {
      if (error instanceof PlatformStoreConflictError) {
        throw new BadRequestException(error.message);
      }

      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async verifyEmail(
    payload: Record<string, unknown>,
  ): Promise<EmailVerificationResponse> {
    return this.verifyContact({
      ...payload,
      channel: 'email',
    });
  }

  async resendContactVerification(
    payload: Record<string, unknown>,
  ): Promise<ContactVerificationResendResponse> {
    const pendingRegistrationId = this.readOptionalString(
      payload,
      'pendingRegistrationId',
    );

    try {
      if (pendingRegistrationId) {
        const challenge = await this.store.resendPendingRegistrationChallenge(
          pendingRegistrationId,
        );
        const verification = await this.deliverPendingRegistrationChallenge(
          {
            username: '',
            name: 'Investor',
            email: challenge.channel === 'email' ? challenge.destination : '',
            phone: challenge.channel === 'phone' ? challenge.destination : '',
            country: '',
            coupon: null,
          },
          challenge,
        );

        return {
          success: true,
          message: 'A new verification code has been sent.',
          verification,
          emailVerification:
            verification.channel === 'email' ? verification : undefined,
        };
      }

      const channel = this.readVerificationChannel(payload, 'channel');

      if (channel === 'phone') {
        const phone = this.readRequiredString(payload, 'phone');
        const challenge = await this.store.createPhoneVerificationChallenge(
          phone,
        );
        const delivery = await this.emailNotifications.sendPhoneVerificationCode(
          challenge.phone,
          challenge.code,
        );
        const verification = this.buildVerificationResponse(
          channel,
          challenge.phone,
          challenge.expiresAt,
          delivery.mode,
          delivery.accepted,
          challenge.code,
        );

        return {
          success: true,
          message: 'A new verification code has been sent.',
          verification,
        };
      }

      const email = this.readRequiredString(payload, 'email');

      if (!email.includes('@')) {
        throw new BadRequestException('Enter a valid email address.');
      }

      const challenge = await this.store.createEmailVerificationChallenge(email);
      const delivery = await this.emailNotifications.sendEmailVerificationCode(
        {
          id: challenge.userId,
          username: '',
          role: 'user',
          name: 'Investor',
          email: challenge.email,
          emailVerified: false,
          phone: '',
          phoneVerified: false,
          country: '',
          coupon: null,
          couponAccepted: false,
          accountStatus: 'active',
          createdAt: challenge.createdAt,
        },
        challenge.code,
      );
      const verification = this.buildVerificationResponse(
        channel,
        challenge.email,
        challenge.expiresAt,
        delivery.mode,
        delivery.accepted,
        challenge.code,
      );

      return {
        success: true,
        message: 'A new verification code has been sent.',
        verification,
        emailVerification: verification,
      };
    } catch (error) {
      if (error instanceof PlatformStoreConflictError) {
        throw new BadRequestException(error.message);
      }

      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async resendEmailVerification(
    payload: Record<string, unknown>,
  ): Promise<EmailVerificationResendResponse> {
    return this.resendContactVerification({
      ...payload,
      channel: 'email',
    });
  }

  async validateCelebrityCoupon(
    payload: Record<string, unknown>,
  ): Promise<CelebrityCouponValidationResponse> {
    const coupon = this.readOptionalString(payload, 'coupon');
    if (!coupon) {
      return {
        valid: false,
        coupon: null,
        message: 'Enter a celebrity coupon code.',
      };
    }

    try {
      const validatedCoupon = await this.store.validateCelebrityCoupon(coupon);
      if (!validatedCoupon) {
        return {
          valid: false,
          coupon: null,
          message:
            'That celebrity coupon is invalid, inactive, expired, or fully redeemed.',
        };
      }

      return {
        valid: true,
        coupon: validatedCoupon,
        message: 'Celebrity coupon is active.',
      };
    } catch (error) {
      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async refreshSession(
    sessionToken: string | null,
  ): Promise<SessionRefreshResult> {
    if (!sessionToken) {
      throw new UnauthorizedException('Session expired. Sign in again.');
    }

    try {
      const session = await this.store.refreshSession(sessionToken);

      if (!session) {
        throw new UnauthorizedException('Session expired. Sign in again.');
      }

      const user = await this.store.getUserBySessionToken(sessionToken);
      if (!user || user.accountStatus !== 'active') {
        await this.store.revokeSession(sessionToken);
        throw new UnauthorizedException('Session expired. Sign in again.');
      }

      return {
        success: true,
        sessionExpiresAt: session.expiresAt,
        idleTimeoutMinutes: SESSION_IDLE_TIMEOUT_MINUTES,
        session,
      };
    } catch (error) {
      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async getAuthenticatedUser(
    sessionToken: string | null,
  ): Promise<AuthenticatedUserResponse> {
    if (!sessionToken) {
      return {
        authenticated: false,
        user: null,
        sessionMode: null,
      };
    }

    try {
      const user = await this.store.getUserBySessionToken(sessionToken);

      if (!user) {
        return {
          authenticated: false,
          user: null,
          sessionMode: null,
        };
      }

      if (user.accountStatus !== 'active') {
        return {
          authenticated: false,
          user: null,
          sessionMode: null,
        };
      }

      const sessionMode = await this.store.getResolvedDriver();

      return {
        authenticated: true,
        user,
        sessionMode,
      };
    } catch (error) {
      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async getAuthenticatedAdmin(
    sessionToken: string | null,
  ): Promise<AuthenticatedUserResponse> {
    if (!sessionToken) {
      return {
        authenticated: false,
        user: null,
        sessionMode: null,
      };
    }

    try {
      const user = await this.store.getUserBySessionToken(sessionToken);

      if (!user || user.role !== 'admin' || user.accountStatus !== 'active') {
        return {
          authenticated: false,
          user: null,
          sessionMode: null,
        };
      }

      const sessionMode = await this.store.getResolvedDriver();

      return {
        authenticated: true,
        user,
        sessionMode,
      };
    } catch (error) {
      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  async refreshAdminSession(
    sessionToken: string | null,
  ): Promise<SessionRefreshResult> {
    if (!sessionToken) {
      throw new UnauthorizedException('Session expired. Sign in again.');
    }

    const user = await this.store.getUserBySessionToken(sessionToken);
    if (!user || user.role !== 'admin' || user.accountStatus !== 'active') {
      throw new UnauthorizedException('Session expired. Sign in again.');
    }

    return this.refreshSession(sessionToken);
  }

  async logout(sessionToken: string | null): Promise<LogoutResponse> {
    if (!sessionToken) {
      return {
        success: true,
        message: 'Session cleared.',
      };
    }

    try {
      await this.store.revokeSession(sessionToken);

      return {
        success: true,
        message: 'Session cleared.',
      };
    } catch (error) {
      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  private readRequiredString(
    payload: Record<string, unknown>,
    key: string,
  ): string {
    const value = payload[key];

    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`Missing required field: ${key}.`);
    }

    return value.trim();
  }

  private readOptionalString(
    payload: Record<string, unknown>,
    key: string,
  ): string | null {
    const value = payload[key];

    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private readVerificationChannel(
    payload: Record<string, unknown>,
    key: string,
  ): VerificationChannel {
    const value = this.readOptionalString(payload, key);
    if (!value) {
      return 'email';
    }

    if (value === 'email' || value === 'phone') {
      return value;
    }

    throw new BadRequestException('Select a valid verification method.');
  }

  private resolveSignupVerificationChannel(
    requestedChannel: VerificationChannel,
  ): VerificationChannel {
    if (
      requestedChannel === 'phone' &&
      this.emailNotifications.isPhoneVerificationAvailable()
    ) {
      return 'phone';
    }

    return 'email';
  }

  private assertAccountIsActive(user: PublicUser) {
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
  }

  private resolveDisplayName(
    payload: Record<string, unknown>,
    firstName: string | null,
    lastName: string | null,
  ) {
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (fullName) {
      return fullName;
    }

    const legacyName = this.readOptionalString(payload, 'name');
    if (legacyName) {
      return legacyName;
    }

    throw new BadRequestException(
      'First name and last name are required for account creation.',
    );
  }

  private isContactVerified(user: PublicUser) {
    return user.role === 'admin' || user.emailVerified || user.phoneVerified;
  }

  private async deliverPendingRegistrationChallenge(
    registration: {
      username: string;
      name: string;
      email: string;
      phone: string;
      country: string;
      coupon: string | null;
    },
    challenge: {
      pendingRegistrationId: string;
      channel: VerificationChannel;
      destination: string;
      code: string;
      expiresAt: string;
      createdAt: string;
    },
  ): Promise<ContactVerificationPayload> {
    if (challenge.channel === 'phone') {
      const delivery = await this.emailNotifications.sendPhoneVerificationCode(
        challenge.destination,
        challenge.code,
      );

      return this.buildVerificationResponse(
        challenge.channel,
        challenge.destination,
        challenge.expiresAt,
        delivery.mode,
        delivery.accepted,
        challenge.code,
        challenge.pendingRegistrationId,
      );
    }

    const delivery = await this.emailNotifications.sendEmailVerificationCode(
      {
        id: challenge.pendingRegistrationId,
        username: registration.username || 'investor',
        role: 'user',
        name: registration.name || 'Investor',
        email: registration.email,
        emailVerified: false,
        phone: registration.phone,
        phoneVerified: false,
        country: registration.country,
        coupon: registration.coupon,
        couponAccepted: false,
        accountStatus: 'active',
        createdAt: challenge.createdAt,
      },
      challenge.code,
    );

    return this.buildVerificationResponse(
      challenge.channel,
      challenge.destination,
      challenge.expiresAt,
      delivery.mode,
      delivery.accepted,
      challenge.code,
      challenge.pendingRegistrationId,
    );
  }

  private async prepareContactVerification(
    user: PublicUser,
    channel: VerificationChannel,
  ): Promise<ContactVerificationPayload> {
    const destination = channel === 'phone' ? user.phone : user.email;

    if (this.isContactVerified(user)) {
      return {
        required: false,
        channel,
        destination,
        deliveryMode:
          channel === 'email' ? this.emailNotifications.getDeliveryMode() : 'log',
        sent: false,
        expiresAt: null,
      };
    }

    if (channel === 'phone') {
      const challenge = await this.store.createPhoneVerificationChallenge(
        user.phone,
      );
      const delivery = await this.emailNotifications.sendPhoneVerificationCode(
        challenge.phone,
        challenge.code,
      );

      return this.buildVerificationResponse(
        channel,
        challenge.phone,
        challenge.expiresAt,
        delivery.mode,
        delivery.accepted,
        challenge.code,
      );
    }

    const challenge = await this.store.createEmailVerificationChallenge(
      user.email,
    );
    const delivery = await this.emailNotifications.sendEmailVerificationCode(
      user,
      challenge.code,
    );

    return this.buildVerificationResponse(
      channel,
      challenge.email,
      challenge.expiresAt,
      delivery.mode,
      delivery.accepted,
      challenge.code,
    );
  }

  private buildVerificationResponse(
    channel: VerificationChannel,
    destination: string,
    expiresAt: string | null,
    deliveryMode: string,
    sent: boolean,
    code?: string,
    pendingRegistrationId?: string,
  ) {
    const response: ContactVerificationPayload = {
      required: true,
      channel,
      destination,
      deliveryMode,
      sent,
      expiresAt,
    };

    if (pendingRegistrationId) {
      response.pendingRegistrationId = pendingRegistrationId;
    }

    if (code && deliveryMode === 'log') {
      response.devCode = code;
    }

    return response;
  }
}

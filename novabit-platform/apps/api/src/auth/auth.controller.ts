import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ActivityService } from '../activity/activity.service';
import { RequestSecurityService } from '../security/request-security.service';
import {
  NOVABIT_ADMIN_SESSION_COOKIE,
  buildClearedSessionCookieOptions,
  buildSessionCookieOptions,
  NOVABIT_SESSION_COOKIE,
  readCookieValue,
} from './auth-session';
import { AuthService } from './auth.service';
import type {
  AuthenticatedUserResponse,
  CelebrityCouponValidationResponse,
  ContactVerificationResendResponse,
  ContactVerificationResponse,
  EmailVerificationResendResponse,
  EmailVerificationResponse,
  ForgotPasswordResponse,
  LoginResponse,
  LogoutResponse,
  RegistrationAvailabilityResponse,
  RegisterResponse,
  SessionRefreshResponse,
} from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly requestSecurityService: RequestSecurityService,
    private readonly activityService: ActivityService,
  ) {}

  @Post('register')
  async register(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ): Promise<RegisterResponse> {
    await this.requestSecurityService.protectRequest({
      request,
      payload: body,
      scope: 'auth-register',
      actionLabel: 'account creation',
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    return this.authService.register(body);
  }

  @Post('register-availability')
  @HttpCode(HttpStatus.OK)
  async checkRegistrationAvailability(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ): Promise<RegistrationAvailabilityResponse> {
    await this.requestSecurityService.protectRequest({
      request,
      payload: body,
      scope: 'auth-register-availability',
      actionLabel: 'registration availability check',
      limit: 50,
      windowMs: 10 * 60 * 1000,
    });

    return this.authService.checkRegistrationAvailability(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    await this.requestSecurityService.protectRequest({
      request,
      payload: body,
      scope: 'auth-login',
      actionLabel: 'login',
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });

    try {
      const loginResult = await this.authService.login(body);
      const { session, ...responseBody } = loginResult;

      response.cookie(
        NOVABIT_SESSION_COOKIE,
        session.token,
        buildSessionCookieOptions(session.expiresAt),
      );
      void this.activityService.logUserLoginSuccess(request, responseBody.user);

      return responseBody;
    } catch (error) {
      const identifier =
        typeof body.emailOrUsername === 'string' ? body.emailOrUsername.trim() : '';
      void this.activityService.logUserLoginFailure(
        request,
        identifier,
        error instanceof Error ? error.message : 'Sign-in failed.',
      );
      throw error;
    }
  }

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    await this.requestSecurityService.protectRequest({
      request,
      payload: body,
      scope: 'auth-admin-login',
      actionLabel: 'admin login',
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });

    try {
      const loginResult = await this.authService.adminLogin(body);
      const { session, ...responseBody } = loginResult;

      response.cookie(
        NOVABIT_ADMIN_SESSION_COOKIE,
        session.token,
        buildSessionCookieOptions(session.expiresAt),
      );

      return responseBody;
    } catch (error) {
      const identifier =
        typeof body.emailOrUsername === 'string' ? body.emailOrUsername.trim() : '';
      void this.activityService.logUserLoginFailure(
        request,
        identifier,
        error instanceof Error ? error.message : 'Admin sign-in failed.',
        '/admin/login',
      );
      throw error;
    }
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ): Promise<ForgotPasswordResponse> {
    await this.requestSecurityService.protectRequest({
      request,
      payload: body,
      scope: 'auth-forgot-password',
      actionLabel: 'password reset',
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    const result = await this.authService.forgotPassword(body);
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (email) {
      void this.activityService.logPasswordResetRequested(request, email);
    }

    return result;
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EmailVerificationResponse> {
    await this.requestSecurityService.protectRequest({
      request,
      payload: body,
      scope: 'auth-verify-email',
      actionLabel: 'email verification',
      limit: 8,
      windowMs: 15 * 60 * 1000,
    });

    const verificationResult = await this.authService.verifyEmail(body);
    const { session, ...responseBody } = verificationResult as EmailVerificationResponse & {
      session: { token: string; expiresAt: string };
    };

    response.cookie(
      NOVABIT_SESSION_COOKIE,
      session.token,
      buildSessionCookieOptions(session.expiresAt),
    );
    void this.activityService.logEmailVerified(request, responseBody.user);

    return responseBody;
  }

  @Post('verify-contact')
  @HttpCode(HttpStatus.OK)
  async verifyContact(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ContactVerificationResponse> {
    await this.requestSecurityService.protectRequest({
      request,
      payload: body,
      scope: 'auth-verify-contact',
      actionLabel: 'contact verification',
      limit: 8,
      windowMs: 15 * 60 * 1000,
    });

    const verificationResult = await this.authService.verifyContact(body);
    const { session, ...responseBody } = verificationResult as ContactVerificationResponse & {
      session: { token: string; expiresAt: string };
    };

    response.cookie(
      NOVABIT_SESSION_COOKIE,
      session.token,
      buildSessionCookieOptions(session.expiresAt),
    );
    void this.activityService.logEmailVerified(request, responseBody.user);

    return responseBody;
  }

  @Post('resend-email-verification')
  @HttpCode(HttpStatus.OK)
  async resendEmailVerification(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ): Promise<EmailVerificationResendResponse> {
    await this.requestSecurityService.protectRequest({
      request,
      payload: body,
      scope: 'auth-resend-email-verification',
      actionLabel: 'email verification resend',
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    return this.authService.resendEmailVerification(body);
  }

  @Post('resend-contact-verification')
  @HttpCode(HttpStatus.OK)
  async resendContactVerification(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ): Promise<ContactVerificationResendResponse> {
    await this.requestSecurityService.protectRequest({
      request,
      payload: body,
      scope: 'auth-resend-contact-verification',
      actionLabel: 'contact verification resend',
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    return this.authService.resendContactVerification(body);
  }

  @Post('celebrity-coupons/validate')
  @HttpCode(HttpStatus.OK)
  async validateCelebrityCoupon(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ): Promise<CelebrityCouponValidationResponse> {
    await this.requestSecurityService.protectRequest({
      request,
      payload: body,
      scope: 'auth-celebrity-coupon-validate',
      actionLabel: 'celebrity coupon validation',
      limit: 30,
      windowMs: 10 * 60 * 1000,
    });

    return this.authService.validateCelebrityCoupon(body);
  }

  @Get('me')
  me(@Req() request: Request): Promise<AuthenticatedUserResponse> {
    return this.authService.getAuthenticatedUser(
      readCookieValue(request.headers.cookie, NOVABIT_SESSION_COOKIE),
    );
  }

  @Get('admin/me')
  adminMe(@Req() request: Request): Promise<AuthenticatedUserResponse> {
    return this.authService.getAuthenticatedAdmin(
      readCookieValue(request.headers.cookie, NOVABIT_ADMIN_SESSION_COOKIE),
    );
  }

  @Post('session/refresh')
  @HttpCode(HttpStatus.OK)
  async refreshSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionRefreshResponse> {
    const refreshResult = await this.authService.refreshSession(
      readCookieValue(request.headers.cookie, NOVABIT_SESSION_COOKIE),
    );
    const { session, ...responseBody } = refreshResult;

    response.cookie(
      NOVABIT_SESSION_COOKIE,
      session.token,
      buildSessionCookieOptions(session.expiresAt),
    );

    return responseBody;
  }

  @Post('admin/session/refresh')
  @HttpCode(HttpStatus.OK)
  async refreshAdminSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionRefreshResponse> {
    const refreshResult = await this.authService.refreshAdminSession(
      readCookieValue(request.headers.cookie, NOVABIT_ADMIN_SESSION_COOKIE),
    );
    const { session, ...responseBody } = refreshResult;

    response.cookie(
      NOVABIT_ADMIN_SESSION_COOKIE,
      session.token,
      buildSessionCookieOptions(session.expiresAt),
    );

    return responseBody;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LogoutResponse> {
    const result = await this.authService.logout(
      readCookieValue(request.headers.cookie, NOVABIT_SESSION_COOKIE),
    );

    response.clearCookie(
      NOVABIT_SESSION_COOKIE,
      buildClearedSessionCookieOptions(),
    );

    return result;
  }

  @Post('admin/logout')
  @HttpCode(HttpStatus.OK)
  async adminLogout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LogoutResponse> {
    const result = await this.authService.logout(
      readCookieValue(request.headers.cookie, NOVABIT_ADMIN_SESSION_COOKIE),
    );

    response.clearCookie(
      NOVABIT_ADMIN_SESSION_COOKIE,
      buildClearedSessionCookieOptions(),
    );

    return result;
  }
}

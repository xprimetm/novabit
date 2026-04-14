import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ActivityService } from '../activity/activity.service';
import {
  NOVABIT_ADMIN_SESSION_COOKIE,
  NOVABIT_SESSION_COOKIE,
  readCookieValue,
} from '../auth/auth-session';
import { DashboardService } from './dashboard.service';
import type {
  AdminUserAccountActionResponse,
  AdminCelebrityCouponsResponse,
  AdminPaymentQueueResponse,
  AdminKycQueueResponse,
  PublicInvestmentPlansResponse,
  AdminWithdrawalQueueResponse,
  AdminUsersResponse,
  CreateCelebrityCouponPayload,
  CreateKycSubmissionPayload,
  CreatePaymentSubmissionPayload,
  CreateWithdrawalSubmissionPayload,
  DashboardResponse,
  ManageAdminUserPayload,
  ReviewKycSubmissionPayload,
  ReviewPaymentSubmissionPayload,
  ReviewWithdrawalSubmissionPayload,
} from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly activityService: ActivityService,
  ) {}

  @Get('public-plans')
  getPublicInvestmentPlans(): Promise<PublicInvestmentPlansResponse> {
    return this.dashboardService.getPublicInvestmentPlans();
  }

  @Get()
  getDashboard(@Req() request: Request): Promise<DashboardResponse> {
    return this.dashboardService.getDashboard(
      readCookieValue(request.headers.cookie, NOVABIT_SESSION_COOKIE),
    );
  }

  @Post('payment-submissions')
  async createPaymentSubmission(
    @Req() request: Request,
    @Body() body: CreatePaymentSubmissionPayload,
  ) {
    const result = await this.dashboardService.createPaymentSubmission(
      readCookieValue(request.headers.cookie, NOVABIT_SESSION_COOKIE),
      body,
    );
    const submission = result.submission;
    void this.activityService.logDepositSubmitted(
      request,
      {
        id: submission.userId,
        name: submission.userName,
        email: submission.userEmail,
        username: submission.userUsername || submission.userEmail,
      },
      {
        reference: submission.reference,
        amount: submission.amount,
        planKey: submission.planKey,
        planName: submission.planName,
        fundingMethod: submission.fundingMethod,
        assetSymbol: submission.assetSymbol,
        network: submission.network,
      },
    );

    return result;
  }

  @Post('withdrawal-submissions')
  async createWithdrawalSubmission(
    @Req() request: Request,
    @Body() body: CreateWithdrawalSubmissionPayload,
  ) {
    const result = await this.dashboardService.createWithdrawalSubmission(
      readCookieValue(request.headers.cookie, NOVABIT_SESSION_COOKIE),
      body,
    );
    const submission = result.submission;
    void this.activityService.logWithdrawalSubmitted(
      request,
      {
        id: submission.userId,
        name: submission.userName,
        email: submission.userEmail,
        username: submission.userUsername || submission.userEmail,
      },
      {
        reference: submission.reference,
        amount: submission.amount,
        netAmount: submission.netAmount,
        method: submission.withdrawalMethod,
        assetSymbol: submission.assetSymbol,
        network: submission.network,
      },
    );

    return result;
  }

  @Post('kyc-submissions')
  async createKycSubmission(
    @Req() request: Request,
    @Body() body: CreateKycSubmissionPayload,
  ) {
    const result = await this.dashboardService.createKycSubmission(
      readCookieValue(request.headers.cookie, NOVABIT_SESSION_COOKIE),
      body,
    );
    const submission = result.submission;
    void this.activityService.logKycSubmitted(
      request,
      {
        id: submission.userId,
        name: submission.userName,
        email: submission.userEmail,
        username: submission.userUsername || submission.userEmail,
      },
      {
        reference: submission.reference,
        documentType: submission.documentType,
        countryOfOrigin: submission.countryOfOrigin,
      },
    );

    return result;
  }

  @Get('admin/payment-submissions')
  getAdminPaymentQueue(
    @Req() request: Request,
  ): Promise<AdminPaymentQueueResponse> {
    return this.dashboardService.getAdminPaymentQueue(
      readCookieValue(request.headers.cookie, NOVABIT_ADMIN_SESSION_COOKIE),
    );
  }

  @Get('admin/withdrawal-submissions')
  getAdminWithdrawalQueue(
    @Req() request: Request,
  ): Promise<AdminWithdrawalQueueResponse> {
    return this.dashboardService.getAdminWithdrawalQueue(
      readCookieValue(request.headers.cookie, NOVABIT_ADMIN_SESSION_COOKIE),
    );
  }

  @Get('admin/kyc-submissions')
  getAdminKycQueue(
    @Req() request: Request,
  ): Promise<AdminKycQueueResponse> {
    return this.dashboardService.getAdminKycQueue(
      readCookieValue(request.headers.cookie, NOVABIT_ADMIN_SESSION_COOKIE),
    );
  }

  @Get('admin/users')
  getAdminUsers(@Req() request: Request): Promise<AdminUsersResponse> {
    return this.dashboardService.getAdminUsers(
      readCookieValue(request.headers.cookie, NOVABIT_ADMIN_SESSION_COOKIE),
    );
  }

  @Post('admin/users/:userId/action')
  async manageAdminUser(
    @Req() request: Request,
    @Param('userId') userId: string,
    @Body() body: ManageAdminUserPayload,
  ): Promise<AdminUserAccountActionResponse> {
    const result = await this.dashboardService.manageAdminUser(
      readCookieValue(request.headers.cookie, NOVABIT_ADMIN_SESSION_COOKIE),
      userId,
      body,
    );
    void this.activityService.logAdminUserAccountAction(
      request,
      'deleted' in result
        ? {
            id: result.userId,
          }
        : result.user,
      result.action,
    );

    return result;
  }

  @Get('admin/celebrity-coupons')
  getAdminCelebrityCoupons(
    @Req() request: Request,
  ): Promise<AdminCelebrityCouponsResponse> {
    return this.dashboardService.getAdminCelebrityCoupons(
      readCookieValue(request.headers.cookie, NOVABIT_ADMIN_SESSION_COOKIE),
    );
  }

  @Post('admin/celebrity-coupons')
  createAdminCelebrityCoupon(
    @Req() request: Request,
    @Body() body: CreateCelebrityCouponPayload,
  ) {
    return this.dashboardService.createCelebrityCoupon(
      readCookieValue(request.headers.cookie, NOVABIT_ADMIN_SESSION_COOKIE),
      body,
    );
  }

  @Post('admin/payment-submissions/:submissionId/review')
  async reviewPaymentSubmission(
    @Req() request: Request,
    @Param('submissionId') submissionId: string,
    @Body() body: ReviewPaymentSubmissionPayload,
  ) {
    const result = await this.dashboardService.reviewPaymentSubmission(
      readCookieValue(request.headers.cookie, NOVABIT_ADMIN_SESSION_COOKIE),
      submissionId,
      body,
    );
    const submission = result.submission;
    void this.activityService.logAdminReviewToUserActivity(
      request,
      {
        id: submission.userId,
        name: submission.userName,
        email: submission.userEmail,
        username: submission.userUsername || submission.userEmail,
      },
      {
        activityType: 'deposit_reviewed',
        activityCategory: 'investment',
        activityLabel: 'Deposit review updated',
        details: {
          reference: submission.reference,
          status: submission.status,
          amount: submission.amount,
          reviewNote: submission.reviewNote,
        },
        pagePath: '/dashboard#deposit-funds',
      },
    );

    return result;
  }

  @Post('admin/withdrawal-submissions/:submissionId/review')
  async reviewWithdrawalSubmission(
    @Req() request: Request,
    @Param('submissionId') submissionId: string,
    @Body() body: ReviewWithdrawalSubmissionPayload,
  ) {
    const result = await this.dashboardService.reviewWithdrawalSubmission(
      readCookieValue(request.headers.cookie, NOVABIT_ADMIN_SESSION_COOKIE),
      submissionId,
      body,
    );
    const submission = result.submission;
    void this.activityService.logAdminReviewToUserActivity(
      request,
      {
        id: submission.userId,
        name: submission.userName,
        email: submission.userEmail,
        username: submission.userUsername || submission.userEmail,
      },
      {
        activityType: 'withdrawal_reviewed',
        activityCategory: 'investment',
        activityLabel: 'Withdrawal review updated',
        details: {
          reference: submission.reference,
          status: submission.status,
          amount: submission.amount,
          netAmount: submission.netAmount,
          reviewNote: submission.reviewNote,
        },
        pagePath: '/dashboard#withdraw-funds',
      },
    );

    return result;
  }

  @Post('admin/kyc-submissions/:submissionId/review')
  async reviewKycSubmission(
    @Req() request: Request,
    @Param('submissionId') submissionId: string,
    @Body() body: ReviewKycSubmissionPayload,
  ) {
    const result = await this.dashboardService.reviewKycSubmission(
      readCookieValue(request.headers.cookie, NOVABIT_ADMIN_SESSION_COOKIE),
      submissionId,
      body,
    );
    const submission = result.submission;
    void this.activityService.logAdminReviewToUserActivity(
      request,
      {
        id: submission.userId,
        name: submission.userName,
        email: submission.userEmail,
        username: submission.userUsername || submission.userEmail,
      },
      {
        activityType: 'kyc_reviewed',
        activityCategory: 'security',
        activityLabel: 'KYC review updated',
        details: {
          reference: submission.reference,
          status: submission.status,
          reviewNote: submission.reviewNote,
        },
        pagePath: '/dashboard#verification',
      },
    );

    return result;
  }
}

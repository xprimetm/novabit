import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Post,
  Query,
  Req,
  Sse,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import {
  NOVABIT_ADMIN_SESSION_COOKIE,
  NOVABIT_SESSION_COOKIE,
  readCookieValue,
} from '../auth/auth-session';
import type {
  AdminActivityFeedResponse,
  AdminUserActivityHistoryResponse,
  ReviewActivityPayload,
  ReviewActivityResponse,
  TrackUserActivityPayload,
  TrackUserActivityResponse,
} from './activity.types';
import { ActivityService } from './activity.service';

@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get('admin/feed')
  getAdminFeed(
    @Req() request: Request,
    @Query() query: Record<string, unknown>,
  ): Promise<AdminActivityFeedResponse> {
    return this.activityService.getAdminActivityFeed(
      readCookieValue(request.headers.cookie, NOVABIT_ADMIN_SESSION_COOKIE),
      query,
    );
  }

  @Get('admin/users/:userId/history')
  getAdminUserHistory(
    @Req() request: Request,
    @Param('userId') userId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<AdminUserActivityHistoryResponse> {
    return this.activityService.getAdminUserActivityHistory(
      readCookieValue(request.headers.cookie, NOVABIT_ADMIN_SESSION_COOKIE),
      userId,
      query,
    );
  }

  @Post('admin/:activityId/review')
  reviewActivity(
    @Req() request: Request,
    @Param('activityId') activityId: string,
    @Body() body: ReviewActivityPayload,
  ): Promise<ReviewActivityResponse> {
    return this.activityService.reviewActivity(
      readCookieValue(request.headers.cookie, NOVABIT_ADMIN_SESSION_COOKIE),
      activityId,
      body,
    );
  }

  @Sse('admin/stream')
  streamAdminFeed(@Req() request: Request): Observable<MessageEvent> {
    return this.activityService.streamAdminActivity(
      readCookieValue(request.headers.cookie, NOVABIT_ADMIN_SESSION_COOKIE),
    );
  }

  @Post('track')
  trackAuthenticatedUserActivity(
    @Req() request: Request,
    @Body() body: TrackUserActivityPayload,
  ): Promise<TrackUserActivityResponse> {
    return this.activityService.trackAuthenticatedUserActivity(
      readCookieValue(request.headers.cookie, NOVABIT_SESSION_COOKIE),
      request,
      body,
    );
  }
}

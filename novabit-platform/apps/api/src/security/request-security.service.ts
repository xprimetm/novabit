import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { getClientIp } from './client-ip';
import { RateLimitService } from './rate-limit.service';
import { TurnstileService } from './turnstile.service';

type ProtectRequestOptions = {
  request: Request;
  payload: Record<string, unknown>;
  scope: string;
  actionLabel: string;
  limit: number;
  windowMs: number;
};

@Injectable()
export class RequestSecurityService {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly turnstileService: TurnstileService,
  ) {}

  async protectRequest(options: ProtectRequestOptions) {
    const clientIp = getClientIp(options.request);

    await this.rateLimitService.assertWithinLimit({
      scope: options.scope,
      key: clientIp,
      limit: options.limit,
      windowMs: options.windowMs,
      actionLabel: options.actionLabel,
    });

    await this.turnstileService.verifyOrSkip(
      this.readOptionalString(options.payload, 'turnstileToken'),
      clientIp,
    );
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
}

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PlatformStoreService } from '../platform-store/platform-store.service';

type RateLimitOptions = {
  scope: string;
  key: string;
  limit: number;
  windowMs: number;
  actionLabel: string;
};

@Injectable()
export class RateLimitService {
  constructor(private readonly store: PlatformStoreService) {}

  async assertWithinLimit(options: RateLimitOptions) {
    const result = await this.store.consumeRateLimit({
      scope: options.scope,
      key: options.key,
      limit: options.limit,
      windowMs: options.windowMs,
    });

    if (!result.allowed) {
      throw new HttpException(
        `Too many ${options.actionLabel} attempts. Please wait ${result.retryAfterSeconds} seconds and try again.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

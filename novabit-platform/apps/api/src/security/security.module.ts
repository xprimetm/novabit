import { Module } from '@nestjs/common';
import { PlatformStoreModule } from '../platform-store/platform-store.module';
import { RateLimitService } from './rate-limit.service';
import { RequestSecurityService } from './request-security.service';
import { TurnstileService } from './turnstile.service';

@Module({
  imports: [PlatformStoreModule],
  providers: [RateLimitService, TurnstileService, RequestSecurityService],
  exports: [RequestSecurityService],
})
export class SecurityModule {}

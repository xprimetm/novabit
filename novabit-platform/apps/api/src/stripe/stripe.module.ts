import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformStoreModule } from '../platform-store/platform-store.module';
import { StripeController } from './stripe.controller';
import { StripeService } from './stripe.service';

@Module({
  imports: [PlatformStoreModule, NotificationsModule],
  controllers: [StripeController],
  providers: [StripeService],
})
export class StripeModule {}

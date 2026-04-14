import { Module } from '@nestjs/common';
import { ActivityModule } from './activity/activity.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ContactModule } from './contact/contact.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlatformStoreModule } from './platform-store/platform-store.module';
import { StripeModule } from './stripe/stripe.module';

@Module({
  imports: [
    ActivityModule,
    PlatformStoreModule,
    AuthModule,
    ContactModule,
    DashboardModule,
    NotificationsModule,
    StripeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformStoreModule } from '../platform-store/platform-store.module';
import { SecurityModule } from '../security/security.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    PlatformStoreModule,
    SecurityModule,
    NotificationsModule,
    ActivityModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}

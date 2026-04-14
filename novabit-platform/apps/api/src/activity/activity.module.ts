import { Module } from '@nestjs/common';
import { PlatformStoreModule } from '../platform-store/platform-store.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

@Module({
  imports: [PlatformStoreModule],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}

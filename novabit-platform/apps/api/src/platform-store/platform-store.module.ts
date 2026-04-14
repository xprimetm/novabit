import { Module } from '@nestjs/common';
import { InMemoryPlatformStore } from './in-memory-platform.store';
import { PlatformStoreService } from './platform-store.service';
import { PostgresPlatformStore } from './postgres-platform.store';

@Module({
  providers: [
    InMemoryPlatformStore,
    PostgresPlatformStore,
    PlatformStoreService,
  ],
  exports: [PlatformStoreService],
})
export class PlatformStoreModule {}

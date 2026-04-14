import { Module } from '@nestjs/common';
import { PlatformStoreModule } from '../platform-store/platform-store.module';
import { SecurityModule } from '../security/security.module';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

@Module({
  imports: [PlatformStoreModule, SecurityModule],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}

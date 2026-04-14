import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import type { PlatformHealth, PlatformInfo } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getPlatformInfo(): Promise<PlatformInfo> {
    return this.appService.getPlatformInfo();
  }

  @Get('health')
  getHealth(): Promise<PlatformHealth> {
    return this.appService.getHealth();
  }
}

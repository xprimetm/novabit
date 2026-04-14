import { Injectable } from '@nestjs/common';
import { PlatformStoreService } from './platform-store/platform-store.service';
import type { PlatformStoreStatus } from './platform-store/platform-store.types';

export type PlatformInfo = {
  name: string;
  version: string;
  status: 'ready';
  docs: string;
  environment: string;
  persistence: PlatformStoreStatus;
};

export type PlatformHealth = {
  service: string;
  status: 'ok' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  persistence: PlatformStoreStatus;
};

@Injectable()
export class AppService {
  constructor(private readonly platformStore: PlatformStoreService) {}

  async getPlatformInfo(): Promise<PlatformInfo> {
    const persistence = await this.platformStore.getStatus();

    return {
      name: 'Novabit Platform API',
      version: '0.1.0',
      status: 'ready',
      docs: '/api/v1/health',
      environment: process.env.NODE_ENV ?? 'development',
      persistence,
    };
  }

  async getHealth(): Promise<PlatformHealth> {
    const persistence = await this.platformStore.getStatus();

    return {
      service: 'novabit-api',
      status:
        persistence.fallbackActive || persistence.resolvedDriver === null
          ? 'degraded'
          : 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      persistence,
    };
  }
}

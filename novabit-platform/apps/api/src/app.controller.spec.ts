import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PlatformStoreModule } from './platform-store/platform-store.module';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    process.env.PERSISTENCE_DRIVER = 'memory';
    delete process.env.DATABASE_URL;

    const app: TestingModule = await Test.createTestingModule({
      imports: [PlatformStoreModule],
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return platform info', async () => {
      await expect(appController.getPlatformInfo()).resolves.toMatchObject({
        name: 'Novabit Platform API',
        version: '0.1.0',
        status: 'ready',
        docs: '/api/v1/health',
        persistence: {
          configuredDriver: 'memory',
          resolvedDriver: 'in-memory',
        },
      });
    });

    it('should return health status', async () => {
      await expect(appController.getHealth()).resolves.toMatchObject({
        service: 'novabit-api',
        status: 'ok',
        persistence: {
          configuredDriver: 'memory',
          resolvedDriver: 'in-memory',
        },
      });
    });
  });
});

import { loadApiEnv } from './config/load-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function buildCorsOriginValidator() {
  const configuredOrigins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = origin.trim().toLowerCase();

    if (normalizedOrigin === 'null') {
      callback(null, true);
      return;
    }

    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    if (
      configuredOrigins.includes('*') ||
      configuredOrigins.includes(normalizedOrigin)
    ) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin not allowed: ${origin}`));
  };
}

async function bootstrap() {
  loadApiEnv();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({
    origin: buildCorsOriginValidator(),
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
  const host = process.env.API_HOST?.trim() || '::';
  await app.listen(port, host);
}
void bootstrap();

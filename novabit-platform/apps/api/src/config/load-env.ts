import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

let envLoaded = false;

export function loadApiEnv() {
  if (envLoaded) {
    return;
  }

  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/api/.env'),
    resolve(process.cwd(), '..', '.env'),
    resolve(process.cwd(), '..', '..', '.env'),
    resolve(__dirname, '../../.env'),
    resolve(__dirname, '../../../../.env'),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) {
      continue;
    }

    config({ path, override: false });
    envLoaded = true;
    return;
  }

  envLoaded = true;
}

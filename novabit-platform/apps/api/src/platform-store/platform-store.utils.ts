import {
  createHash,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import type { CreateUserInput, UserRole } from './platform-store.types';

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizePhoneNumber(phone: string) {
  const trimmed = phone.trim();
  if (!trimmed) {
    return '';
  }

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function hashPassword(password: string) {
  const passwordSalt = randomBytes(16).toString('hex');
  const passwordHash = scryptSync(password, passwordSalt, 64).toString('hex');

  return { passwordHash, passwordSalt };
}

export function verifyPassword(
  password: string,
  passwordHash: string,
  passwordSalt: string,
) {
  const candidateHash = scryptSync(password, passwordSalt, 64);
  const storedHash = Buffer.from(passwordHash, 'hex');

  return (
    candidateHash.byteLength === storedHash.byteLength &&
    timingSafeEqual(candidateHash, storedHash)
  );
}

export function buildReference(prefix: string) {
  return `NBT-${prefix}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export function buildSessionToken() {
  return randomBytes(32).toString('hex');
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function buildEmailVerificationCode() {
  return randomInt(100000, 1000000).toString();
}

export function buildPhoneVerificationCode() {
  return buildEmailVerificationCode();
}

export function hashEmailVerificationCode(email: string, code: string) {
  return createHash('sha256')
    .update(`${normalizeEmail(email)}:${code.trim()}`)
    .digest('hex');
}

export function hashPhoneVerificationCode(phone: string, code: string) {
  return createHash('sha256')
    .update(`${normalizePhoneNumber(phone)}:${code.trim()}`)
    .digest('hex');
}

export function buildEmailVerificationExpiry() {
  return new Date(Date.now() + 15 * 60 * 1000).toISOString();
}

export function buildPhoneVerificationExpiry() {
  return buildEmailVerificationExpiry();
}

export function buildPendingRegistrationExpiry() {
  return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

export function isEmailVerificationRequired() {
  return (process.env.EMAIL_VERIFICATION_REQUIRED ?? 'true')
    .trim()
    .toLowerCase() !== 'false';
}

export function buildCelebrityRewardBonusAmount() {
  const fixed = Number(process.env.CELEBRITY_REWARD_BONUS_FIXED);
  if (Number.isFinite(fixed) && fixed >= 5000 && fixed <= 30000) {
    return Math.round(fixed * 100) / 100;
  }

  return randomInt(50, 301) * 100;
}

export const SESSION_IDLE_TIMEOUT_MINUTES = 10;

export function buildSessionExpiry(_remember: boolean) {
  return new Date(
    Date.now() + SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000,
  ).toISOString();
}

export function toIsoString(value: Date | string) {
  return new Date(value).toISOString();
}

export function normalizeUserRole(value: unknown): UserRole {
  return value === 'admin' ? 'admin' : 'user';
}

export function readAdminSeedProfile(): Required<
  Pick<CreateUserInput, 'username' | 'name' | 'email' | 'phone' | 'country' | 'password'> & {
    role: UserRole;
  }
> {
  return {
    username:
      (process.env.NOVABIT_ADMIN_USERNAME ?? '').trim() || 'novabitadmin',
    role: 'admin',
    name: (process.env.NOVABIT_ADMIN_NAME ?? '').trim() || 'Novabit Admin',
    email:
      (process.env.NOVABIT_ADMIN_EMAIL ?? '').trim() ||
      'admin@novabit.local',
    phone:
      (process.env.NOVABIT_ADMIN_PHONE ?? '').trim() || '+15550000000',
    country:
      (process.env.NOVABIT_ADMIN_COUNTRY ?? '').trim() || 'United States',
    password:
      (process.env.NOVABIT_ADMIN_PASSWORD ?? '').trim() ||
      'NovabitAdmin123!',
  };
}

import type { CookieOptions } from 'express';

export const NOVABIT_SESSION_COOKIE = 'novabit_session';
export const NOVABIT_ADMIN_SESSION_COOKIE = 'novabit_admin_session';

export function buildSessionCookieOptions(expiresAt: string): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt),
  };
}

export function buildClearedSessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  };
}

export function readCookieValue(
  cookieHeader: string | string[] | undefined,
  name: string,
) {
  const rawCookie = Array.isArray(cookieHeader)
    ? cookieHeader.join(';')
    : cookieHeader;

  if (!rawCookie) {
    return null;
  }

  const entries = rawCookie.split(';');

  for (const entry of entries) {
    const [rawName, ...valueParts] = entry.trim().split('=');

    if (rawName === name) {
      return decodeURIComponent(valueParts.join('='));
    }
  }

  return null;
}

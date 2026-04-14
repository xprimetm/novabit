import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

type TurnstileVerificationResponse = {
  success: boolean;
  'error-codes'?: string[];
};

const DEFAULT_TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

@Injectable()
export class TurnstileService {
  async verifyOrSkip(token: string | null, remoteIp: string) {
    const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim();

    if (!secretKey) {
      return {
        enforced: false,
      } as const;
    }

    if (!token) {
      throw new BadRequestException(
        'Complete the security verification and try again.',
      );
    }

    const verifyUrl =
      process.env.TURNSTILE_VERIFY_URL?.trim() || DEFAULT_TURNSTILE_VERIFY_URL;
    const payload = new URLSearchParams({
      secret: secretKey,
      response: token,
    });

    if (remoteIp && remoteIp !== 'unknown') {
      payload.set('remoteip', remoteIp);
    }

    let response: Response;

    try {
      response = await fetch(verifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: payload.toString(),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Security verification is temporarily unavailable. Please try again.',
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Security verification is temporarily unavailable. Please try again.',
      );
    }

    const result =
      (await response.json()) as TurnstileVerificationResponse | null;

    if (!result?.success) {
      throw new BadRequestException(
        'Security verification failed. Please refresh the form and try again.',
      );
    }

    return {
      enforced: true,
    } as const;
  }
}

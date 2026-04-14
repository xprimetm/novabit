import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PlatformStoreUnavailableError } from '../platform-store/platform-store.errors';
import { PlatformStoreService } from '../platform-store/platform-store.service';

export type ContactResponse = {
  success: true;
  message: string;
  reference: string;
  estimatedResponseWindow: string;
};

@Injectable()
export class ContactService {
  constructor(private readonly store: PlatformStoreService) {}

  async submit(payload: Record<string, unknown>): Promise<ContactResponse> {
    const topic =
      this.readOptionalString(payload, 'topic') || 'General Support';
    const name = this.readRequiredString(payload, 'name');
    const email = this.readRequiredString(payload, 'email');
    const message = this.readRequiredString(payload, 'message');

    if (!email.includes('@')) {
      throw new BadRequestException('Enter a valid email address.');
    }

    if (message.length < 10) {
      throw new BadRequestException(
        'Please provide a little more detail in your message.',
      );
    }

    try {
      const submission = await this.store.createContactSubmission({
        topic,
        name,
        email,
        message,
      });

      return {
        success: true,
        message:
          'Your message has been received by the Novabit platform API and routed to the support queue.',
        reference: submission.reference,
        estimatedResponseWindow: '1-2 hours',
      };
    } catch (error) {
      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  private readRequiredString(
    payload: Record<string, unknown>,
    key: string,
  ): string {
    const value = payload[key];

    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`Missing required field: ${key}.`);
    }

    return value.trim();
  }

  private readOptionalString(
    payload: Record<string, unknown>,
    key: string,
  ): string | null {
    const value = payload[key];

    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}

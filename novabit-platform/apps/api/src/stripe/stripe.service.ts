import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { loadApiEnv } from '../config/load-env';
import { EmailNotificationService } from '../notifications/email-notification.service';
import {
  PlatformStoreConflictError,
  PlatformStoreUnavailableError,
} from '../platform-store/platform-store.errors';
import { PlatformStoreService } from '../platform-store/platform-store.service';
import type { PublicUser } from '../platform-store/platform-store.types';

const STRIPE_PLACEHOLDER_PROOF_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn8m2QAAAAASUVORK5CYII=';

export type CreateStripePaymentPayload = {
  planKey?: unknown;
  planName?: unknown;
  amount?: unknown;
  billingEmail?: unknown;
  billingName?: unknown;
  cardType?: unknown;
};

export type CreateStripeCheckoutSessionPayload = CreateStripePaymentPayload;
export type CreateStripePaymentIntentPayload = CreateStripePaymentPayload;

export type CompleteStripeCheckoutSessionPayload = {
  sessionId?: unknown;
};

export type CompleteStripePaymentIntentPayload = {
  paymentIntentId?: unknown;
};

type NormalizedStripePaymentPayload = {
  planKey: string;
  planName: string;
  amount: number;
  billingEmail: string;
  billingName: string;
  cardType: 'credit' | 'debit';
};

@Injectable()
export class StripeService {
  private client: any | null = null;

  constructor(
    private readonly store: PlatformStoreService,
    private readonly emailNotifications: EmailNotificationService,
  ) {
    loadApiEnv();
  }

  getClientConfig(): {
    ready: boolean;
    publishableKey: string | null;
    currency: string;
  } {
    const publishableKey = this.readPublishableKey();

    return {
      ready: publishableKey.length > 0,
      publishableKey: publishableKey || null,
      currency: this.getCurrency(),
    };
  }

  async createPaymentIntent(
    sessionToken: string | null,
    payload: CreateStripePaymentIntentPayload,
  ): Promise<{
    created: true;
    clientSecret: string;
    paymentIntentId: string;
    livemode: boolean;
    currency: string;
  }> {
    const user = await this.requireUser(sessionToken);
    const input = this.normalizePaymentPayload(user, payload);
    const currency = this.getCurrency();

    try {
      const paymentIntent = await this.getClient().paymentIntents.create({
        amount: this.toStripeAmount(input.amount),
        currency,
        payment_method_types: ['card'],
        receipt_email: input.billingEmail,
        description: `Novabit funding for ${input.planName}.`,
        metadata: {
          source: 'novabit-dashboard',
          userId: user.id,
          userName: input.billingName,
          userEmail: input.billingEmail,
          planKey: input.planKey,
          planName: input.planName,
          amount: input.amount.toFixed(2),
          fundingMethod: 'card',
          cardType: input.cardType,
        },
      });

      if (!paymentIntent.client_secret) {
        throw new ServiceUnavailableException(
          'Stripe payment intent did not return a client secret.',
        );
      }

      return {
        created: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        livemode: paymentIntent.livemode,
        currency,
      };
    } catch (error) {
      throw this.normalizeStripeError(
        error,
        'Unable to start Stripe payment right now.',
      );
    }
  }

  async completePaymentIntent(
    sessionToken: string | null,
    payload: CompleteStripePaymentIntentPayload,
  ): Promise<{
    completed: boolean;
    recorded: boolean;
    paymentIntentId: string;
    livemode: boolean;
    status: string | null;
  }> {
    const user = await this.requireUser(sessionToken);
    const paymentIntentId = this.normalizePaymentIntentId(payload.paymentIntentId);

    try {
      const paymentIntent = await this.getClient().paymentIntents.retrieve(
        paymentIntentId,
      );

      this.assertPaymentIntentBelongsToUser(paymentIntent, user);

      if (paymentIntent.status !== 'succeeded') {
        return {
          completed: false,
          recorded: false,
          paymentIntentId: paymentIntent.id,
          livemode: paymentIntent.livemode,
          status: paymentIntent.status ?? null,
        };
      }

      const recorded = await this.recordSuccessfulPaymentIntent(paymentIntent);
      return {
        completed: true,
        recorded,
        paymentIntentId: paymentIntent.id,
        livemode: paymentIntent.livemode,
        status: paymentIntent.status ?? null,
      };
    } catch (error) {
      throw this.normalizeStripeError(
        error,
        'Unable to confirm the Stripe payment intent.',
      );
    }
  }

  async createCheckoutSession(
    sessionToken: string | null,
    payload: CreateStripeCheckoutSessionPayload,
    requestOrigin: string | undefined,
  ): Promise<{
    created: true;
    checkoutUrl: string;
    sessionId: string;
    livemode: boolean;
  }> {
    const user = await this.requireUser(sessionToken);
    const input = this.normalizePaymentPayload(user, payload);
    const checkoutOrigin = this.resolveCheckoutOrigin(requestOrigin);

    try {
      const session = await this.getClient().checkout.sessions.create({
        mode: 'payment',
        submit_type: 'pay',
        client_reference_id: user.id,
        customer_email: input.billingEmail,
        billing_address_collection: 'required',
        phone_number_collection: {
          enabled: true,
        },
        success_url: this.buildCheckoutReturnUrl(
          checkoutOrigin,
          'success',
          true,
        ),
        cancel_url: this.buildCheckoutReturnUrl(
          checkoutOrigin,
          'cancelled',
          false,
        ),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: this.getCurrency(),
              unit_amount: this.toStripeAmount(input.amount),
              product_data: {
                name: `${input.planName} Deposit`,
                description: `Novabit funding for ${input.planName}.`,
              },
            },
          },
        ],
        metadata: {
          source: 'novabit-dashboard',
          userId: user.id,
          userName: input.billingName,
          userEmail: input.billingEmail,
          planKey: input.planKey,
          planName: input.planName,
          amount: input.amount.toFixed(2),
          fundingMethod: 'card',
          cardType: input.cardType,
        },
        payment_intent_data: {
          metadata: {
            source: 'novabit-dashboard',
            userId: user.id,
            planKey: input.planKey,
            planName: input.planName,
            fundingMethod: 'card',
          },
        },
      });

      if (!session.url) {
        throw new ServiceUnavailableException(
          'Stripe checkout did not return a redirect URL.',
        );
      }

      return {
        created: true,
        checkoutUrl: session.url,
        sessionId: session.id,
        livemode: session.livemode,
      };
    } catch (error) {
      throw this.normalizeStripeError(
        error,
        'Unable to start Stripe checkout right now.',
      );
    }
  }

  async completeCheckoutSession(
    sessionToken: string | null,
    payload: CompleteStripeCheckoutSessionPayload,
  ): Promise<{
    completed: boolean;
    recorded: boolean;
    sessionId: string;
    livemode: boolean;
    paymentStatus: string | null;
    status: string | null;
  }> {
    const user = await this.requireUser(sessionToken);
    const sessionId = this.normalizeSessionId(payload.sessionId);

    try {
      const session = await this.getClient().checkout.sessions.retrieve(
        sessionId,
        {
          expand: ['payment_intent'],
        },
      );

      this.assertSessionBelongsToUser(session, user);

      if (session.payment_status !== 'paid') {
        return {
          completed: false,
          recorded: false,
          sessionId: session.id,
          livemode: session.livemode,
          paymentStatus: session.payment_status ?? null,
          status: session.status ?? null,
        };
      }

      const recorded = await this.recordSuccessfulCheckoutSession(session);
      return {
        completed: true,
        recorded,
        sessionId: session.id,
        livemode: session.livemode,
        paymentStatus: session.payment_status ?? null,
        status: session.status ?? null,
      };
    } catch (error) {
      throw this.normalizeStripeError(
        error,
        'Unable to confirm the Stripe checkout session.',
      );
    }
  }

  async handleWebhook(
    stripeSignature: string | undefined,
    rawBody: Buffer | undefined,
  ): Promise<{ received: true }> {
    const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET ?? '').trim();

    if (!webhookSecret) {
      throw new ServiceUnavailableException(
        'Stripe webhook secret is not configured.',
      );
    }

    if (!stripeSignature || !rawBody) {
      throw new BadRequestException('Stripe webhook payload is invalid.');
    }

    let event: any;

    try {
      event = this.getClient().webhooks.constructEvent(
        rawBody,
        stripeSignature,
        webhookSecret,
      );
    } catch {
      throw new BadRequestException(
        'Stripe webhook signature verification failed.',
      );
    }

    if (event.type === 'payment_intent.succeeded') {
      await this.recordSuccessfulPaymentIntent(event.data.object as any);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      if (session.payment_status === 'paid') {
        await this.recordSuccessfulCheckoutSession(session);
      }
    }

    return { received: true };
  }

  private getClient(): any {
    if (this.client) {
      return this.client;
    }

    const secretKey = (process.env.STRIPE_SECRET_KEY ?? '').trim();

    if (!secretKey) {
      throw new ServiceUnavailableException(
        'Stripe secret key is not configured.',
      );
    }

    this.client = new Stripe(secretKey);
    return this.client;
  }

  private readPublishableKey(): string {
    return (process.env.STRIPE_PUBLISHABLE_KEY ?? '').trim();
  }

  private getCurrency(): string {
    const value = (process.env.STRIPE_CURRENCY ?? 'usd').trim().toLowerCase();
    return /^[a-z]{3}$/.test(value) ? value : 'usd';
  }

  private toStripeAmount(amount: number): number {
    return Math.round(amount * 100);
  }

  private resolveCheckoutOrigin(requestOrigin: string | undefined): string {
    const configuredOrigin = (process.env.STRIPE_CHECKOUT_ORIGIN ?? '').trim();
    const configuredCorsOrigins = (process.env.CORS_ORIGIN ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    const candidates = [requestOrigin, configuredOrigin].filter(
      (value): value is string => typeof value === 'string' && value.trim() !== '',
    );

    for (const candidate of candidates) {
      let parsed: URL;

      try {
        parsed = new URL(candidate);
      } catch {
        continue;
      }

      const normalizedOrigin = parsed.origin.toLowerCase();
      const isLocalHost =
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalizedOrigin);
      const isAllowedOrigin =
        configuredCorsOrigins.includes('*') ||
        configuredCorsOrigins.includes(normalizedOrigin) ||
        normalizedOrigin === configuredOrigin.toLowerCase();

      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        (isLocalHost || isAllowedOrigin)
      ) {
        return parsed.origin;
      }
    }

    throw new ServiceUnavailableException(
      'A valid Stripe checkout origin is not configured.',
    );
  }

  private buildCheckoutReturnUrl(
    origin: string,
    status: 'success' | 'cancelled',
    includeSessionId: boolean,
  ): string {
    const url = new URL('/dashboard.html', origin);
    url.searchParams.set('stripe_status', status);
    if (includeSessionId) {
      url.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
    }
    url.hash = 'deposit-funds';
    return url.toString();
  }

  private normalizePaymentPayload(
    user: PublicUser,
    payload: CreateStripePaymentPayload,
  ): NormalizedStripePaymentPayload {
    const planKey =
      typeof payload.planKey === 'string' ? payload.planKey.trim() : '';
    const planName =
      typeof payload.planName === 'string' ? payload.planName.trim() : '';
    const amount = Number(payload.amount);
    const billingEmail =
      typeof payload.billingEmail === 'string'
        ? payload.billingEmail.trim().toLowerCase()
        : user.email;
    const billingName =
      typeof payload.billingName === 'string'
        ? payload.billingName.trim()
        : user.name || user.username;
    const cardTypeRaw =
      typeof payload.cardType === 'string'
        ? payload.cardType.trim().toLowerCase()
        : 'credit';
    const cardType = cardTypeRaw === 'debit' ? 'debit' : 'credit';

    if (!planKey || !planName) {
      throw new BadRequestException('A valid plan is required.');
    }

    if (!Number.isFinite(amount) || amount <= 0 || amount > 250000) {
      throw new BadRequestException('A valid payment amount is required.');
    }

    if (!billingName) {
      throw new BadRequestException('A valid billing name is required.');
    }

    if (!billingEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) {
      throw new BadRequestException('A valid billing email is required.');
    }

    return {
      planKey,
      planName,
      amount: Number(amount.toFixed(2)),
      billingEmail,
      billingName,
      cardType,
    };
  }

  private normalizeSessionId(value: unknown): string {
    const sessionId = typeof value === 'string' ? value.trim() : '';

    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
      throw new BadRequestException(
        'A valid Stripe checkout session is required.',
      );
    }

    return sessionId;
  }

  private normalizePaymentIntentId(value: unknown): string {
    const paymentIntentId = typeof value === 'string' ? value.trim() : '';

    if (!/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) {
      throw new BadRequestException(
        'A valid Stripe payment intent is required.',
      );
    }

    return paymentIntentId;
  }

  private async recordSuccessfulCheckoutSession(session: any): Promise<boolean> {
    const note = `stripe-session:${session.id}`;
    const existingSubmission = (await this.store.listPaymentSubmissions()).find(
      (item) => (item.proofNote ?? '').trim() === note,
    );

    if (existingSubmission) {
      return false;
    }

    const metadata = session.metadata ?? {};
    const userId = (metadata.userId ?? '').trim();
    const userName =
      (metadata.userName ?? '').trim() ||
      session.customer_details?.name?.trim() ||
      'Investor';
    const userEmail =
      (metadata.userEmail ?? '').trim().toLowerCase() ||
      session.customer_details?.email?.trim().toLowerCase() ||
      '';
    const planKey = (metadata.planKey ?? '').trim() || 'growth';
    const planName = (metadata.planName ?? '').trim() || 'Growth Plan';
    const amount = this.normalizeRecordedAmount(session);

    if (!userId || !userEmail || !planKey || !planName || amount <= 0) {
      throw new BadRequestException(
        'Stripe checkout metadata is incomplete for deposit recording.',
      );
    }

    const submission = await this.store.createPaymentSubmission({
      userId,
      userName,
      userEmail,
      planKey,
      planName,
      fundingMethod: 'card',
      amount,
      proofImageDataUrl: STRIPE_PLACEHOLDER_PROOF_IMAGE,
      proofFileName: 'stripe-checkout-proof.png',
      proofMimeType: 'image/png',
      proofNote: note,
    });

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    const reviewedSubmission = await this.store.reviewPaymentSubmission({
      id: submission.id,
      status: 'approved',
      reviewedBy: session.livemode ? 'Stripe Live' : 'Stripe Test',
      reviewNote:
        'Approved automatically from Stripe checkout' +
        (paymentIntentId ? ` (${paymentIntentId})` : '') +
        (session.livemode ? ' Live mode.' : ' Test mode.'),
    });
    try {
      const dashboard = await this.store.getDashboardAccount(userId);
      void this.emailNotifications.sendDepositReviewUpdate(
        {
          email: userEmail,
          name: userName,
          username: userEmail,
        },
        {
          reference: reviewedSubmission.reference,
          status: reviewedSubmission.status,
          amount: reviewedSubmission.amount,
          reviewNote: reviewedSubmission.reviewNote,
          availableBalance: dashboard.accountBalance,
        },
      );
    } catch {}

    return true;
  }

  private async recordSuccessfulPaymentIntent(intent: any): Promise<boolean> {
    const note = `stripe-payment-intent:${intent.id}`;
    const existingSubmission = (await this.store.listPaymentSubmissions()).find(
      (item) => (item.proofNote ?? '').trim() === note,
    );

    if (existingSubmission) {
      return false;
    }

    const metadata = intent.metadata ?? {};
    const userId = (metadata.userId ?? '').trim();
    const userName = (metadata.userName ?? '').trim() || 'Investor';
    const userEmail =
      (metadata.userEmail ?? '').trim().toLowerCase() ||
      (intent.receipt_email ?? '').trim().toLowerCase() ||
      '';
    const planKey = (metadata.planKey ?? '').trim() || 'growth';
    const planName = (metadata.planName ?? '').trim() || 'Growth Plan';
    const amount = this.normalizeRecordedAmount(intent);

    if (!userId || !userEmail || !planKey || !planName || amount <= 0) {
      throw new BadRequestException(
        'Stripe payment metadata is incomplete for deposit recording.',
      );
    }

    const submission = await this.store.createPaymentSubmission({
      userId,
      userName,
      userEmail,
      planKey,
      planName,
      fundingMethod: 'card',
      amount,
      proofImageDataUrl: STRIPE_PLACEHOLDER_PROOF_IMAGE,
      proofFileName: 'stripe-payment-intent-proof.png',
      proofMimeType: 'image/png',
      proofNote: note,
    });

    const paymentMethodId =
      typeof intent.payment_method === 'string'
        ? intent.payment_method
        : intent.payment_method?.id ?? null;

    const reviewedSubmission = await this.store.reviewPaymentSubmission({
      id: submission.id,
      status: 'approved',
      reviewedBy: intent.livemode ? 'Stripe Live' : 'Stripe Test',
      reviewNote:
        'Approved automatically from Stripe card payment' +
        (paymentMethodId ? ` (${paymentMethodId})` : '') +
        (intent.livemode ? ' Live mode.' : ' Test mode.'),
    });
    try {
      const dashboard = await this.store.getDashboardAccount(userId);
      void this.emailNotifications.sendDepositReviewUpdate(
        {
          email: userEmail,
          name: userName,
          username: userEmail,
        },
        {
          reference: reviewedSubmission.reference,
          status: reviewedSubmission.status,
          amount: reviewedSubmission.amount,
          reviewNote: reviewedSubmission.reviewNote,
          availableBalance: dashboard.accountBalance,
        },
      );
    } catch {}

    return true;
  }

  private normalizeRecordedAmount(record: any): number {
    const numericCandidates = [
      Number(record.amount_received),
      Number(record.amount_total),
      Number(record.amount),
    ];

    for (const value of numericCandidates) {
      if (Number.isFinite(value) && value > 0) {
        return Number((value / 100).toFixed(2));
      }
    }

    const metadataAmount = Number(record.metadata?.amount);
    if (Number.isFinite(metadataAmount) && metadataAmount > 0) {
      return Number(metadataAmount.toFixed(2));
    }

    return 0;
  }

  private assertSessionBelongsToUser(session: any, user: PublicUser) {
    const metadataUserId = (session.metadata?.userId ?? '').trim();
    const clientReferenceId =
      typeof session.client_reference_id === 'string'
        ? session.client_reference_id.trim()
        : '';

    if (metadataUserId === user.id || clientReferenceId === user.id) {
      return;
    }

    throw new UnauthorizedException(
      'That Stripe checkout session does not belong to this dashboard user.',
    );
  }

  private assertPaymentIntentBelongsToUser(intent: any, user: PublicUser) {
    const metadataUserId = (intent.metadata?.userId ?? '').trim();

    if (metadataUserId === user.id) {
      return;
    }

    throw new UnauthorizedException(
      'That Stripe payment intent does not belong to this dashboard user.',
    );
  }

  private async requireUser(sessionToken: string | null): Promise<PublicUser> {
    if (!sessionToken) {
      throw new UnauthorizedException(
        'Sign in is required to use Stripe payments.',
      );
    }

    try {
      const user = await this.store.getUserBySessionToken(sessionToken);

      if (!user || user.role === 'admin') {
        throw new UnauthorizedException(
          'Sign in is required to use Stripe payments.',
        );
      }

      return user;
    } catch (error) {
      if (error instanceof PlatformStoreConflictError) {
        throw new BadRequestException(error.message);
      }

      if (error instanceof PlatformStoreUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  private normalizeStripeError(
    error: unknown,
    fallbackMessage: string,
  ): BadRequestException | ServiceUnavailableException | UnauthorizedException {
    if (
      error instanceof BadRequestException ||
      error instanceof ServiceUnavailableException ||
      error instanceof UnauthorizedException
    ) {
      return error;
    }

    if (error instanceof PlatformStoreConflictError) {
      return new BadRequestException(error.message);
    }

    if (error instanceof PlatformStoreUnavailableError) {
      return new ServiceUnavailableException(error.message);
    }

    return new ServiceUnavailableException(
      error instanceof Error && error.message ? error.message : fallbackMessage,
    );
  }
}

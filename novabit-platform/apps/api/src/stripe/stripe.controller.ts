import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  NOVABIT_SESSION_COOKIE,
  readCookieValue,
} from '../auth/auth-session';
import type {
  CompleteStripeCheckoutSessionPayload,
  CompleteStripePaymentIntentPayload,
  CreateStripeCheckoutSessionPayload,
  CreateStripePaymentIntentPayload,
} from './stripe.service';
import { StripeService } from './stripe.service';

type RawBodyRequest = Request & {
  rawBody?: Buffer;
};

@Controller('stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Get('config')
  getClientConfig() {
    return this.stripeService.getClientConfig();
  }

  @Post('payment-intent')
  createPaymentIntent(
    @Req() request: Request,
    @Body() body: CreateStripePaymentIntentPayload,
  ) {
    return this.stripeService.createPaymentIntent(
      readCookieValue(request.headers.cookie, NOVABIT_SESSION_COOKIE),
      body,
    );
  }

  @Post('payment-intent/complete')
  completePaymentIntent(
    @Req() request: Request,
    @Body() body: CompleteStripePaymentIntentPayload,
  ) {
    return this.stripeService.completePaymentIntent(
      readCookieValue(request.headers.cookie, NOVABIT_SESSION_COOKIE),
      body,
    );
  }

  @Post('checkout-session')
  createCheckoutSession(
    @Req() request: Request,
    @Body() body: CreateStripeCheckoutSessionPayload,
  ) {
    return this.stripeService.createCheckoutSession(
      readCookieValue(request.headers.cookie, NOVABIT_SESSION_COOKIE),
      body,
      request.headers.origin,
    );
  }

  @Post('checkout-session/complete')
  completeCheckoutSession(
    @Req() request: Request,
    @Body() body: CompleteStripeCheckoutSessionPayload,
  ) {
    return this.stripeService.completeCheckoutSession(
      readCookieValue(request.headers.cookie, NOVABIT_SESSION_COOKIE),
      body,
    );
  }

  @Post('webhook')
  @HttpCode(200)
  handleWebhook(
    @Req() request: RawBodyRequest,
    @Headers('stripe-signature') stripeSignature: string | undefined,
  ) {
    return this.stripeService.handleWebhook(stripeSignature, request.rawBody);
  }
}

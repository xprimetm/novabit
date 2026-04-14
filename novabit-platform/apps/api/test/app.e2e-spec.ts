import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const memoryStoreFile = resolve(
    __dirname,
    '..',
    '..',
    '..',
    'data',
    'platform-store.e2e.json',
  );
  const identityDocumentDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnRANsAAAAASUVORK5CYII=';

  const verifyRegisteredContact = async (
    destination: { email?: string; phone?: string; channel?: 'email' | 'phone' },
    registerBody: Record<string, unknown>,
  ) => {
    const pendingRegistrationId =
      typeof registerBody.pendingRegistrationId === 'string'
        ? registerBody.pendingRegistrationId
        : '';
    const verification = (registerBody.verification ||
      registerBody.emailVerification) as
      | { channel?: 'email' | 'phone'; devCode?: string }
      | undefined;

    expect(pendingRegistrationId).toBeTruthy();
    expect(verification?.devCode).toMatch(/^\d{6}$/);

    const verificationResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-contact')
      .send({
        pendingRegistrationId,
        channel: destination.channel || verification?.channel || 'email',
        email: destination.email,
        phone: destination.phone,
        code: verification?.devCode,
      })
      .expect(200);

    expect(verificationResponse.headers['set-cookie']?.[0]).toContain(
      'novabit_session=',
    );

    return verificationResponse;
  };

  const verifyRegisteredEmail = async (
    email: string,
    registerBody: Record<string, unknown>,
  ) =>
    verifyRegisteredContact(
      {
        email,
        channel: 'email',
      },
      registerBody,
    );

  beforeEach(async () => {
    if (existsSync(memoryStoreFile)) {
      rmSync(memoryStoreFile, { force: true });
    }

    process.env.PERSISTENCE_DRIVER = 'memory';
    process.env.MEMORY_STORE_FILE = memoryStoreFile;
    process.env.EMAIL_PROVIDER = 'log';
    process.env.EMAIL_VERIFICATION_REQUIRED = 'true';
    process.env.CELEBRITY_REWARD_BONUS_FIXED = '5000';
    process.env.IP_GEOLOOKUP_ENABLED = 'false';
    delete process.env.DATABASE_URL;
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_VERIFY_URL;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_CHECKOUT_ORIGIN;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterEach(async () => {
    jest.useRealTimers();

    if (app) {
      await app.close();
    }

    if (existsSync(memoryStoreFile)) {
      rmSync(memoryStoreFile, { force: true });
    }

    delete process.env.MEMORY_STORE_FILE;
    delete process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_VERIFICATION_REQUIRED;
    delete process.env.CELEBRITY_REWARD_BONUS_FIXED;
    delete process.env.IP_GEOLOOKUP_ENABLED;
  });

  it('/api/v1 (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
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
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          service: 'novabit-api',
          status: 'ok',
          persistence: {
            configuredDriver: 'memory',
            resolvedDriver: 'in-memory',
          },
        });
      });
  });

  it('/api/v1/auth/register + /api/v1/auth/login + /api/v1/auth/me + /api/v1/auth/logout', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Nova',
        lastName: 'User',
        username: 'novauser',
        name: 'Nova User',
        email: 'nova@example.com',
        phone: '+1 555 0100',
        country: 'United States',
        password: 'StrongPass123!',
        passwordConfirmation: 'StrongPass123!',
        agree: true,
        coupon: 'LAMALAMA',
        verificationMethod: 'email',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          success: true,
          pendingRegistrationId: expect.any(String),
          verification: {
            required: true,
            channel: 'email',
            deliveryMode: 'log',
          },
        });
      });

    const verificationResponse = await verifyRegisteredContact(
      {
        email: 'nova@example.com',
        channel: 'email',
      },
      registerResponse.body,
    );
    const cookieHeader = verificationResponse.headers['set-cookie']?.[0];

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookieHeader)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          authenticated: true,
          sessionMode: 'in-memory',
          user: {
            username: 'novauser',
          },
        });
      });

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        emailOrUsername: 'novauser',
        password: 'StrongPass123!',
        remember: true,
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          success: true,
          sessionMode: 'in-memory',
          remember: true,
          redirectTo: '/dashboard',
          user: {
            username: 'novauser',
          },
        });
      });

    expect(loginResponse.headers['set-cookie']?.[0]).toContain(
      'novabit_session=',
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieHeader)
      .send({})
      .expect(200)
      .expect(({ body, headers }) => {
        expect(body).toMatchObject({
          success: true,
        });
        expect(headers['set-cookie']?.[0]).toContain('novabit_session=');
      });

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookieHeader)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          authenticated: false,
          user: null,
          sessionMode: null,
        });
      });
  });

  it('/api/v1/auth/register-availability reports duplicate username, email, and phone', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Repeat',
        lastName: 'Check',
        username: 'repeatuser',
        name: 'Repeat Check',
        email: 'repeat@example.com',
        phone: '+1 555 0199',
        country: 'United States',
        password: 'StrongPass123!',
        passwordConfirmation: 'StrongPass123!',
        agree: true,
        verificationMethod: 'email',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register-availability')
      .send({
        username: 'repeatuser',
        email: 'repeat@example.com',
        phone: '+1 555 0199',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          success: true,
          username: {
            available: false,
          },
          email: {
            available: false,
          },
          phone: {
            available: false,
          },
        });
      });
  });

  it('/api/v1/auth/register supports phone verification before dashboard access', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Phone',
        lastName: 'User',
        username: 'phoneuser',
        email: 'phone@example.com',
        phone: '+1 555 0199',
        country: 'United States',
        password: 'StrongPass123!',
        passwordConfirmation: 'StrongPass123!',
        agree: true,
        verificationMethod: 'phone',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          success: true,
          pendingRegistrationId: expect.any(String),
          verification: {
            required: true,
            channel: 'email',
            deliveryMode: 'log',
          },
        });
      });

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        emailOrUsername: 'phoneuser',
        password: 'StrongPass123!',
        remember: false,
      })
      .expect(401)
      .expect(({ body }) => {
        expect(String(body.message || '')).toContain(
          'Invalid email, username, or password',
        );
      });

    await verifyRegisteredContact(
      {
        email: 'phone@example.com',
        channel: 'email',
      },
      registerResponse.body,
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        emailOrUsername: 'phoneuser',
        password: 'StrongPass123!',
        remember: false,
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          success: true,
          user: {
            username: 'phoneuser',
            emailVerified: true,
            phoneVerified: false,
          },
        });
      });
  });

  it('/api/v1/dashboard/admin/celebrity-coupons creates live coupons that validate and register immediately', async () => {
    const adminLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/admin/login')
      .send({
        emailOrUsername: 'novabitadmin',
        password: 'NovabitAdmin123!',
        remember: true,
      })
      .expect(200);

    const adminCookieHeader = adminLoginResponse.headers['set-cookie']?.[0];

    await request(app.getHttpServer())
      .post('/api/v1/dashboard/admin/celebrity-coupons')
      .set('Cookie', adminCookieHeader)
      .send({
        celebrityName: 'Nova Star',
        couponCode: 'NOVASTAR26',
        offerDetails: 'VIP celebrity onboarding campaign.',
        status: 'active',
        expiresAt: '2026-12-31T23:59:00.000Z',
        maxRedemptions: 5,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          created: true,
          coupon: {
            celebrityName: 'Nova Star',
            couponCode: 'NOVASTAR26',
            status: 'active',
            expiresAt: '2026-12-31T23:59:00.000Z',
            maxRedemptions: 5,
            currentRedemptions: 0,
          },
        });
      });

    await request(app.getHttpServer())
      .post('/api/v1/auth/celebrity-coupons/validate')
      .send({
        coupon: 'NOVASTAR26',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          valid: true,
          coupon: {
            celebrityName: 'Nova Star',
            couponCode: 'NOVASTAR26',
          },
        });
      });

    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        username: 'couponuser',
        name: 'Coupon User',
        email: 'coupon@example.com',
        phone: '+1 555 0190',
        country: 'United States',
        password: 'StrongPass123!',
        passwordConfirmation: 'StrongPass123!',
        agree: true,
        coupon: 'NOVASTAR26',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          success: true,
          pendingRegistrationId: expect.any(String),
          verification: {
            required: true,
            channel: 'email',
          },
        });
      });

    await verifyRegisteredEmail('coupon@example.com', registerResponse.body);

    await request(app.getHttpServer())
      .get('/api/v1/dashboard/admin/celebrity-coupons')
      .set('Cookie', adminCookieHeader)
      .expect(200)
      .expect(({ body }) => {
        const typedBody = body as {
          summary: { redemptions: number };
          coupons: Array<{
            couponCode: string;
            currentRedemptions: number;
            remainingRedemptions: number | null;
          }>;
        };
        const createdCoupon = typedBody.coupons.find(
          (coupon) => coupon.couponCode === 'NOVASTAR26',
        );

        expect(typedBody.summary.redemptions).toBe(1);
        expect(createdCoupon).toMatchObject({
          couponCode: 'NOVASTAR26',
          currentRedemptions: 1,
          remainingRedemptions: 4,
        });
      });
  });

  it('/api/v1/contact (POST)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/contact')
      .send({
        topic: 'Investment Question',
        name: 'Nova Contact',
        email: 'contact@example.com',
        message: 'I would like help understanding the onboarding process.',
      })
      .expect(201)
      .expect(({ body }) => {
        const typedBody = body as {
          success: boolean;
          estimatedResponseWindow: string;
          reference: string;
        };

        expect(body).toMatchObject({
          success: true,
          estimatedResponseWindow: '1-2 hours',
        });
        expect(typedBody.reference).toMatch(/^NBT-MSG-/);
      });
  });

  it('/api/v1/stripe/config (GET) reports not ready when the publishable key is missing', () => {
    return request(app.getHttpServer())
      .get('/api/v1/stripe/config')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          ready: false,
          publishableKey: null,
          currency: 'usd',
        });
      });
  });

  it('/api/v1/stripe/payment-intent (POST) returns 503 when Stripe is not configured', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        username: 'stripeuser',
        name: 'Stripe User',
        email: 'stripe@example.com',
        phone: '+1 555 0110',
        country: 'United States',
        password: 'StrongPass123!',
        passwordConfirmation: 'StrongPass123!',
        agree: true,
      })
      .expect(201);

    await verifyRegisteredEmail('stripe@example.com', registerResponse.body);

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        emailOrUsername: 'stripeuser',
        password: 'StrongPass123!',
        remember: true,
      })
      .expect(200);

    const cookieHeader = loginResponse.headers['set-cookie']?.[0];

    await request(app.getHttpServer())
      .post('/api/v1/stripe/payment-intent')
      .set('Cookie', cookieHeader)
      .set('Origin', 'http://localhost:8080')
      .send({
        planKey: 'growth',
        planName: 'Growth Plan',
        amount: 2000,
        billingEmail: 'stripe@example.com',
        billingName: 'Stripe User',
        cardType: 'credit',
      })
      .expect(503)
      .expect(({ body }) => {
        const typedBody = body as {
          message: string;
        };

        expect(typedBody.message).toContain('Stripe secret key');
      });
  });

  it('/api/v1/auth/login rate limit (POST)', async () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('x-forwarded-for', '198.51.100.10')
        .send({
          emailOrUsername: 'missing-user',
          password: 'WrongPass123!',
          remember: false,
        })
        .expect(401);
    }

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('x-forwarded-for', '198.51.100.10')
      .send({
        emailOrUsername: 'missing-user',
        password: 'WrongPass123!',
        remember: false,
      })
      .expect(429)
      .expect(({ body }) => {
        const typedBody = body as {
          message: string;
        };

        expect(typedBody.message).toContain('Too many login attempts');
      });
  });

  it('/api/v1/activity admin feed tracks dashboard activity and supports review actions', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('x-forwarded-for', '198.51.100.44')
      .set('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0')
      .send({
        emailOrUsername: 'missing-user',
        password: 'WrongPass123!',
        remember: false,
      })
      .expect(401);

    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Activity',
        lastName: 'User',
        username: 'activityuser',
        name: 'Activity User',
        email: 'activity@example.com',
        phone: '+1 555 0188',
        country: 'United States',
        password: 'StrongPass123!',
        passwordConfirmation: 'StrongPass123!',
        agree: true,
        verificationMethod: 'email',
      })
      .expect(201);

    const verificationResponse = await verifyRegisteredEmail(
      'activity@example.com',
      registerResponse.body,
    );
    const userCookieHeader = verificationResponse.headers['set-cookie']?.[0];

    await request(app.getHttpServer())
      .post('/api/v1/activity/track')
      .set('Cookie', userCookieHeader)
      .set('x-forwarded-for', '198.51.100.45')
      .set('user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1.15')
      .send({
        activityType: 'dashboard_view',
        activityCategory: 'dashboard',
        activityLabel: 'Viewed overview',
        pagePath: '/dashboard.html#overview',
        details: {
          section: 'overview',
          source: 'e2e',
        },
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          tracked: true,
        });
      });

    const adminLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/admin/login')
      .send({
        emailOrUsername: 'novabitadmin',
        password: 'NovabitAdmin123!',
        remember: true,
      })
      .expect(200);

    const adminCookieHeader = adminLoginResponse.headers['set-cookie']?.[0];

    const feedResponse = await request(app.getHttpServer())
      .get('/api/v1/activity/admin/feed?hours=24&limit=40')
      .set('Cookie', adminCookieHeader)
      .expect(200);

    const activities = (
      feedResponse.body as {
        authorized: boolean;
        activities: Array<{
          id: string;
          userId: string | null;
          userEmail: string | null;
          activityType: string;
          activityLabel: string;
          ipAddress: string | null;
          browser: string | null;
          deviceType: string | null;
        }>;
      }
    ).activities;
    const dashboardActivity = activities.find(
      (entry) => entry.activityType === 'dashboard_view',
    );
    const failedLogin = activities.find(
      (entry) => entry.activityType === 'login_failed',
    );

    expect(dashboardActivity).toMatchObject({
      userEmail: 'activity@example.com',
      activityLabel: 'Viewed overview',
      ipAddress: '198.51.100.45',
      deviceType: 'Mobile',
      browser: 'Safari',
    });
    expect(failedLogin).toMatchObject({
      userId: null,
      ipAddress: '198.51.100.44',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/activity/admin/${dashboardActivity?.id}/review`)
      .set('Cookie', adminCookieHeader)
      .send({
        reviewState: 'flagged',
        adminAction: 'flag_suspicious',
        adminNote: 'Unexpected device observed.',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          reviewed: true,
          activity: {
            id: dashboardActivity?.id,
            reviewedState: 'flagged',
            adminAction: 'flag_suspicious',
          },
        });
      });

    await request(app.getHttpServer())
      .get(
        `/api/v1/activity/admin/users/${dashboardActivity?.userId}/history?hours=24&limit=20`,
      )
      .set('Cookie', adminCookieHeader)
      .expect(200)
      .expect(({ body }) => {
        const typedBody = body as {
          authorized: boolean;
          userId: string;
          activities: Array<{ activityType: string }>;
        };

        expect(typedBody.authorized).toBe(true);
        expect(typedBody.userId).toBe(dashboardActivity?.userId);
        expect(
          typedBody.activities.some(
            (entry) => entry.activityType === 'dashboard_view',
          ),
        ).toBe(true);
      });
  });

  it('/api/v1/dashboard withdrawal submissions can be approved by admin review', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        username: 'withdrawuser',
        name: 'Withdraw User',
        email: 'withdraw@example.com',
        phone: '+1 555 0130',
        country: 'United States',
        password: 'StrongPass123!',
        passwordConfirmation: 'StrongPass123!',
        agree: true,
      })
      .expect(201);

    await verifyRegisteredEmail('withdraw@example.com', registerResponse.body);

    const userLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        emailOrUsername: 'withdrawuser',
        password: 'StrongPass123!',
        remember: true,
      })
      .expect(200);

    const userCookieHeader = userLoginResponse.headers['set-cookie']?.[0];

    const depositSubmissionResponse = await request(app.getHttpServer())
      .post('/api/v1/dashboard/payment-submissions')
      .set('Cookie', userCookieHeader)
      .send({
        planKey: 'growth',
        planName: 'Growth Plan',
        fundingMethod: 'crypto',
        amount: 2000,
        assetKey: 'btc',
        assetSymbol: 'BTC',
        assetName: 'Bitcoin',
        network: 'BTC',
        routeAddress: 'bc1qnovabittestaddress',
        proofImageDataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnRANsAAAAASUVORK5CYII=',
        proofFileName: 'proof.png',
        proofMimeType: 'image/png',
      })
      .expect(201);

    const depositSubmissionId = (
      depositSubmissionResponse.body as { submission: { id: string } }
    ).submission.id;

    const adminLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/admin/login')
      .send({
        emailOrUsername: 'novabitadmin',
        password: 'NovabitAdmin123!',
        remember: true,
      })
      .expect(200);

    const adminCookieHeader = adminLoginResponse.headers['set-cookie']?.[0];

    await request(app.getHttpServer())
      .post(
        `/api/v1/dashboard/admin/payment-submissions/${depositSubmissionId}/review`,
      )
      .set('Cookie', adminCookieHeader)
      .send({
        status: 'approved',
      })
      .expect(201);

    const kycSubmissionResponse = await request(app.getHttpServer())
      .post('/api/v1/dashboard/kyc-submissions')
      .set('Cookie', userCookieHeader)
      .send({
        email: 'withdraw@example.com',
        phone: '+1 555 0130',
        firstName: 'Withdraw',
        middleName: '',
        lastName: 'User',
        countryOfOrigin: 'United States',
        documentType: 'passport',
        documentImageDataUrl: identityDocumentDataUrl,
        documentFileName: 'passport.png',
        documentMimeType: 'image/png',
      })
      .expect(201);

    const kycSubmissionId = (
      kycSubmissionResponse.body as { submission: { id: string } }
    ).submission.id;

    await request(app.getHttpServer())
      .post(`/api/v1/dashboard/admin/kyc-submissions/${kycSubmissionId}/review`)
      .set('Cookie', adminCookieHeader)
      .send({
        status: 'approved',
        reviewNote: 'KYC approved for withdrawal test.',
      })
      .expect(201);

    const withdrawalSubmissionResponse = await request(app.getHttpServer())
      .post('/api/v1/dashboard/withdrawal-submissions')
      .set('Cookie', userCookieHeader)
      .send({
        withdrawalMethod: 'crypto',
        amount: 500,
        assetKey: 'usdt',
        assetSymbol: 'USDT',
        assetName: 'Tether USD',
        network: 'TRON TRC20',
        walletAddress: 'TLmdGqZHwb2Q39En3iL9HVnxysVTKQctcT',
        walletLabel: 'Personal wallet',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          submitted: true,
          submission: {
            withdrawalMethod: 'crypto',
            status: 'pending',
            amount: 500,
            estimatedFee: 15,
            netAmount: 485,
          },
        });
      });

    const withdrawalSubmissionId = (
      withdrawalSubmissionResponse.body as { submission: { id: string } }
    ).submission.id;

    await request(app.getHttpServer())
      .post('/api/v1/dashboard/withdrawal-submissions')
      .set('Cookie', userCookieHeader)
      .send({
        withdrawalMethod: 'crypto',
        amount: 6600,
        assetKey: 'usdt',
        assetSymbol: 'USDT',
        assetName: 'Tether USD',
        network: 'TRON TRC20',
        walletAddress: 'TLmdGqZHwb2Q39En3iL9HVnxysVTKQctcT',
        walletLabel: 'Second wallet',
      })
      .expect(409)
      .expect(({ body }) => {
        expect((body as { message: string }).message).toContain(
          'Insufficient available balance',
        );
      });

    await request(app.getHttpServer())
      .get('/api/v1/dashboard')
      .set('Cookie', userCookieHeader)
      .expect(200)
      .expect(({ body }) => {
        const typedBody = body as {
          dashboard: {
            accountBalance: number;
            totalWithdrawal: number;
            pendingItems: number;
            statementEntries: Array<{ kind: string; status: string }>;
          };
          withdrawalSubmissions: Array<{ id: string; status: string }>;
        };

        expect(typedBody.dashboard.accountBalance).toBe(7000);
        expect(typedBody.dashboard.totalWithdrawal).toBe(0);
        expect(typedBody.dashboard.pendingItems).toBe(1);
        expect(typedBody.withdrawalSubmissions).toHaveLength(1);
        expect(typedBody.withdrawalSubmissions[0]).toMatchObject({
          id: withdrawalSubmissionId,
          status: 'pending',
        });
        expect(
          typedBody.dashboard.statementEntries.some(
            (entry) =>
              entry.kind === 'withdrawal' && entry.status === 'pending',
          ),
        ).toBe(true);
      });

    await request(app.getHttpServer())
      .get('/api/v1/dashboard/admin/withdrawal-submissions')
      .set('Cookie', adminCookieHeader)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          authorized: true,
          summary: {
            total: 1,
            pending: 1,
            approved: 0,
            cancelled: 0,
            rejected: 0,
          },
        });
      });

    await request(app.getHttpServer())
      .post(
        `/api/v1/dashboard/admin/withdrawal-submissions/${withdrawalSubmissionId}/review`,
      )
      .set('Cookie', adminCookieHeader)
      .send({
        status: 'approved',
        reviewNote: 'Approved for test payout.',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          reviewed: true,
          submission: {
            id: withdrawalSubmissionId,
            status: 'approved',
            reviewedBy: 'Novabit Admin',
          },
        });
      });

    await request(app.getHttpServer())
      .get('/api/v1/dashboard')
      .set('Cookie', userCookieHeader)
      .expect(200)
      .expect(({ body }) => {
        const typedBody = body as {
          dashboard: {
            accountBalance: number;
            totalWithdrawal: number;
            pendingItems: number;
            statementEntries: Array<{ kind: string; status: string }>;
          };
          withdrawalSubmissions: Array<{ id: string; status: string }>;
        };

        expect(typedBody.dashboard.accountBalance).toBe(6500);
        expect(typedBody.dashboard.totalWithdrawal).toBe(500);
        expect(typedBody.dashboard.pendingItems).toBe(0);
        expect(typedBody.withdrawalSubmissions[0]).toMatchObject({
          id: withdrawalSubmissionId,
          status: 'approved',
        });
        expect(
          typedBody.dashboard.statementEntries.some(
            (entry) =>
              entry.kind === 'withdrawal' && entry.status === 'completed',
          ),
        ).toBe(true);
      });
  });

  it('/api/v1/dashboard (GET) accrues approved plan profit daily up to the 30-day cycle cap', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T00:00:00.000Z'));

    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        username: 'planuser',
        name: 'Plan User',
        email: 'plan@example.com',
        phone: '+1 555 0120',
        country: 'United States',
        password: 'StrongPass123!',
        passwordConfirmation: 'StrongPass123!',
        agree: true,
      })
      .expect(201);

    await verifyRegisteredEmail('plan@example.com', registerResponse.body);

    const userLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        emailOrUsername: 'planuser',
        password: 'StrongPass123!',
        remember: true,
      })
      .expect(200);

    const userCookieHeader = userLoginResponse.headers['set-cookie']?.[0];

    const submissionResponse = await request(app.getHttpServer())
      .post('/api/v1/dashboard/payment-submissions')
      .set('Cookie', userCookieHeader)
      .send({
        planKey: 'growth',
        planName: 'Growth Plan',
        fundingMethod: 'crypto',
        amount: 2000,
        assetKey: 'btc',
        assetSymbol: 'BTC',
        assetName: 'Bitcoin',
        network: 'BTC',
        routeAddress: 'bc1qnovabittestaddress',
        proofImageDataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnRANsAAAAASUVORK5CYII=',
        proofFileName: 'proof.png',
        proofMimeType: 'image/png',
      })
      .expect(201);

    const submissionId = (submissionResponse.body as { submission: { id: string } })
      .submission.id;

    const adminLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/admin/login')
      .send({
        emailOrUsername: 'novabitadmin',
        password: 'NovabitAdmin123!',
        remember: true,
      })
      .expect(200);

    const adminCookieHeader = adminLoginResponse.headers['set-cookie']?.[0];

    await request(app.getHttpServer())
      .post(`/api/v1/dashboard/admin/payment-submissions/${submissionId}/review`)
      .set('Cookie', adminCookieHeader)
      .send({
        status: 'approved',
      })
      .expect(201);

    jest.setSystemTime(new Date('2026-04-11T00:00:00.000Z'));

    const dayTenLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        emailOrUsername: 'planuser',
        password: 'StrongPass123!',
        remember: true,
      })
      .expect(200);

    const dayTenUserCookieHeader = dayTenLoginResponse.headers['set-cookie']?.[0];

    await request(app.getHttpServer())
      .get('/api/v1/dashboard')
      .set('Cookie', dayTenUserCookieHeader)
      .expect(200)
      .expect(({ body }) => {
        const typedBody = body as {
          dashboard: {
            accountBalance: number;
            totalDeposit: number;
            totalProfit: number;
            activePlans: number;
            statementEntries: Array<{
              title: string;
              kind: string;
              amount: number | null;
            }>;
          };
        };

        expect(typedBody.dashboard.totalDeposit).toBe(2000);
        expect(typedBody.dashboard.totalProfit).toBe(200);
        expect(typedBody.dashboard.accountBalance).toBe(7200);
        expect(typedBody.dashboard.activePlans).toBe(1);
        expect(
          typedBody.dashboard.statementEntries.some(
            (entry) =>
              entry.kind === 'bonus' &&
              entry.title === 'Daily interest credited' &&
              entry.amount === 20,
          ),
        ).toBe(true);
      });

    jest.setSystemTime(new Date('2026-05-20T00:00:00.000Z'));

    const cycleEndLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        emailOrUsername: 'planuser',
        password: 'StrongPass123!',
        remember: true,
      })
      .expect(200);

    const cycleEndUserCookieHeader =
      cycleEndLoginResponse.headers['set-cookie']?.[0];

    await request(app.getHttpServer())
      .get('/api/v1/dashboard')
      .set('Cookie', cycleEndUserCookieHeader)
      .expect(200)
      .expect(({ body }) => {
        const typedBody = body as {
          dashboard: {
            accountBalance: number;
            totalProfit: number;
            activePlans: number;
          };
        };

        expect(typedBody.dashboard.totalProfit).toBe(600);
        expect(typedBody.dashboard.accountBalance).toBe(7600);
        expect(typedBody.dashboard.activePlans).toBe(0);
      });
  });
});

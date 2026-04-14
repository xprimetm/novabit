import { Injectable, Logger } from '@nestjs/common';
import { loadApiEnv } from '../config/load-env';
import type { PublicUser } from '../platform-store/platform-store.types';

export type EmailDeliveryMode = 'postmark' | 'resend' | 'log';

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type EmailDeliveryResult = {
  mode: EmailDeliveryMode;
  accepted: boolean;
};

type EmailRecipient = Pick<PublicUser, 'email' | 'name' | 'username'>;

type BrandedEmailTemplateInput = {
  title: string;
  preheader: string;
  eyebrow: string;
  intro: string;
  highlightLabel?: string;
  highlightValue?: string;
  rows?: Array<{ label: string; value: string }>;
  bullets?: string[];
  ctaLabel?: string;
  ctaHref?: string;
  footerNote?: string;
  tone?: 'teal' | 'green' | 'amber' | 'red' | 'slate';
};

@Injectable()
export class EmailNotificationService {
  private readonly logger = new Logger(EmailNotificationService.name);

  constructor() {
    loadApiEnv();
  }

  getDeliveryMode(): EmailDeliveryMode {
    const configuredProvider = (process.env.EMAIL_PROVIDER ?? '')
      .trim()
      .toLowerCase();

    if (configuredProvider === 'log') {
      return 'log';
    }

    if (
      configuredProvider === 'postmark' &&
      (process.env.POSTMARK_SERVER_TOKEN ?? '').trim()
    ) {
      return 'postmark';
    }

    if (
      configuredProvider === 'resend' &&
      (process.env.RESEND_API_KEY ?? '').trim()
    ) {
      return 'resend';
    }

    if ((process.env.POSTMARK_SERVER_TOKEN ?? '').trim()) {
      return 'postmark';
    }

    if ((process.env.RESEND_API_KEY ?? '').trim()) {
      return 'resend';
    }

    return 'log';
  }

  isLocalDeliveryMode(mode = this.getDeliveryMode()) {
    return mode === 'log';
  }

  isPhoneVerificationAvailable() {
    return false;
  }

  async sendEmailVerificationCode(
    user: PublicUser,
    code: string,
  ): Promise<EmailDeliveryResult> {
    const template = this.buildBrandedTemplate(user, {
      title: 'Verify your email address',
      preheader: 'Use this one-time code to complete your Novabit signup.',
      eyebrow: 'Email Verification',
      intro:
        'Confirm this email address to finish your account setup and open your Novabit dashboard.',
      highlightLabel: 'Verification code',
      highlightValue: code,
      rows: [
        { label: 'Expires', value: '15 minutes' },
        { label: 'Account', value: user.email },
      ],
      bullets: [
        'Enter this code on the verification screen.',
        'If you did not create a Novabit account, you can safely ignore this email.',
      ],
      tone: 'teal',
    });

    return this.sendEmail({
      to: user.email,
      subject: 'Verify your Novabit email',
      text: template.text,
      html: template.html,
    });
  }

  async sendPhoneVerificationCode(
    phone: string,
    code: string,
  ): Promise<EmailDeliveryResult> {
    this.logger.log(
      `Phone verification code for ${phone}: ${code} (SMS provider not configured, using local log delivery).`,
    );

    return {
      mode: 'log',
      accepted: true,
    };
  }

  async sendWelcomeBonus(
    user: PublicUser,
    amount: number,
    availableBalance?: number,
  ): Promise<EmailDeliveryResult> {
    const amountLabel = this.formatCurrency(amount);
    const template = this.buildBrandedTemplate(user, {
      title: 'Celebrity Reward Bonus credited',
      preheader: `${amountLabel} has been credited to your Novabit account.`,
      eyebrow: 'Welcome Bonus',
      intro:
        'Your signup reward has been added to your account balance and is visible from your dashboard.',
      highlightLabel: 'Bonus credited',
      highlightValue: amountLabel,
      rows: [
        {
          label: 'Available balance',
          value: this.formatCurrency(
            typeof availableBalance === 'number' ? availableBalance : amount,
          ),
        },
        { label: 'Balance effect', value: 'Added to account balance' },
        { label: 'Status', value: 'Active' },
      ],
      bullets: [
        'Deposits add to this balance and approved withdrawals reduce it.',
        'Keep your KYC profile complete before requesting your first withdrawal.',
      ],
      tone: 'green',
    });

    return this.sendEmail({
      to: user.email,
      subject: 'Novabit: Celebrity reward bonus credited',
      text: template.text,
      html: template.html,
    });
  }

  async sendPasswordResetRequest(
    email: string,
    reference: string,
  ): Promise<EmailDeliveryResult> {
    const recipient = {
      email,
      name: 'Investor',
      username: 'Investor',
    };
    const template = this.buildBrandedTemplate(recipient, {
      title: 'Password reset request received',
      preheader: `Password reset request ${reference} was received by Novabit.`,
      eyebrow: 'Account Security',
      intro:
        'We received a password assistance request for this email address. If this was you, keep this reference for support verification.',
      highlightLabel: 'Security reference',
      highlightValue: reference,
      rows: [
        { label: 'Request type', value: 'Password reset' },
        { label: 'Email', value: email },
      ],
      bullets: [
        'If you did not request this, ignore this email and keep your password unchanged.',
        'Novabit support may ask for the reference above before continuing the reset process.',
      ],
      tone: 'amber',
    });

    return this.sendEmail({
      to: email,
      subject: 'Novabit: Password reset request received',
      text: template.text,
      html: template.html,
    });
  }

  async sendSecurityAlert(
    user: EmailRecipient,
    title: string,
    lines: string[],
  ): Promise<EmailDeliveryResult> {
    const template = this.buildBrandedTemplate(user, {
      title,
      preheader: 'Security activity was recorded on your Novabit account.',
      eyebrow: 'Security Alert',
      intro: 'A security event was recorded on your Novabit account.',
      bullets: lines,
      footerNote:
        'If this activity was not yours, contact Novabit support immediately.',
      tone: 'amber',
    });

    return this.sendEmail({
      to: user.email,
      subject: `Novabit: ${title}`,
      text: template.text,
      html: template.html,
    });
  }

  async sendKycSubmitted(
    user: EmailRecipient,
    reference: string,
  ): Promise<EmailDeliveryResult> {
    const template = this.buildBrandedTemplate(user, {
      title: 'KYC verification submitted',
      preheader: `${reference} is pending admin review.`,
      eyebrow: 'Identity Verification',
      intro:
        'Your identity verification has been submitted successfully and is now pending review.',
      highlightLabel: 'KYC reference',
      highlightValue: reference,
      rows: [
        { label: 'Status', value: 'Pending review' },
        { label: 'Next step', value: 'Admin approval' },
      ],
      bullets: [
        'You will receive another notification after review.',
        'KYC approval is required before your first withdrawal can be released.',
      ],
      tone: 'teal',
    });

    return this.sendEmail({
      to: user.email,
      subject: 'Novabit: KYC verification submitted',
      text: template.text,
      html: template.html,
    });
  }

  async sendKycReviewUpdate(
    user: EmailRecipient,
    status: 'approved' | 'rejected',
    reference: string,
    reviewNote?: string | null,
  ): Promise<EmailDeliveryResult> {
    const approved = status === 'approved';
    const template = this.buildBrandedTemplate(user, {
      title: approved ? 'KYC verification approved' : 'KYC verification rejected',
      preheader: `${reference} is now ${status}.`,
      eyebrow: 'Identity Verification',
      intro: approved
        ? 'Your KYC verification has been approved. Your profile now shows KYC verified.'
        : 'Your KYC verification needs correction before it can be approved.',
      highlightLabel: 'Review status',
      highlightValue: approved ? 'Approved' : 'Rejected',
      rows: [
        { label: 'Reference', value: reference },
        { label: 'Profile', value: approved ? 'KYC verified' : 'Action needed' },
      ],
      bullets: [
        approved
          ? 'You can now submit eligible withdrawal requests from your dashboard.'
          : reviewNote ||
            'Review the admin note and resubmit your identity details from the dashboard.',
      ],
      tone: approved ? 'green' : 'red',
    });

    return this.sendEmail({
      to: user.email,
      subject: `Novabit: KYC verification ${status}`,
      text: template.text,
      html: template.html,
    });
  }

  async sendDepositSubmitted(
    user: EmailRecipient,
    details: {
      reference: string;
      planName: string;
      amount: number;
      availableBalance?: number;
    },
  ): Promise<EmailDeliveryResult> {
    const amount = this.formatCurrency(details.amount);
    const template = this.buildBrandedTemplate(user, {
      title: 'Deposit request submitted',
      preheader: `${details.reference} was submitted for ${amount}.`,
      eyebrow: 'Funding',
      intro:
        'Your deposit request was received and is pending funding desk review.',
      highlightLabel: 'Deposit amount',
      highlightValue: amount,
      rows: [
        { label: 'Reference', value: details.reference },
        { label: 'Plan', value: details.planName },
        { label: 'Status', value: 'Pending review' },
        {
          label: 'Available balance',
          value: this.formatCurrency(details.availableBalance ?? 0),
        },
      ],
      bullets: [
        'The funding desk will review the payment proof.',
        'Your deposit history will update after approval.',
      ],
      tone: 'teal',
    });

    return this.sendEmail({
      to: user.email,
      subject: 'Novabit: Deposit request submitted',
      text: template.text,
      html: template.html,
    });
  }

  async sendDepositReviewUpdate(
    user: EmailRecipient,
    details: {
      reference: string;
      status: string;
      amount: number;
      reviewNote?: string | null;
      availableBalance?: number;
    },
  ): Promise<EmailDeliveryResult> {
    const statusLabel = this.formatStatus(details.status);
    const amount = this.formatCurrency(details.amount);
    const template = this.buildBrandedTemplate(user, {
      title: `Deposit ${statusLabel.toLowerCase()}`,
      preheader: `${details.reference} is now ${statusLabel.toLowerCase()}.`,
      eyebrow: 'Funding Update',
      intro:
        details.status === 'approved'
          ? 'Your deposit has been approved and added to your Novabit account balance.'
          : 'The funding desk updated your deposit request.',
      highlightLabel: 'Review status',
      highlightValue: statusLabel,
      rows: [
        { label: 'Reference', value: details.reference },
        { label: 'Amount', value: amount },
        { label: 'Status', value: statusLabel },
        {
          label: 'Available balance',
          value: this.formatCurrency(details.availableBalance ?? 0),
        },
      ],
      bullets: [
        details.reviewNote ||
          'Open your dashboard to review the latest funding history.',
      ],
      tone: details.status === 'approved' ? 'green' : details.status === 'pending' ? 'amber' : 'red',
    });

    return this.sendEmail({
      to: user.email,
      subject: `Novabit: Deposit ${statusLabel.toLowerCase()}`,
      text: template.text,
      html: template.html,
    });
  }

  async sendWithdrawalSubmitted(
    user: EmailRecipient,
    details: {
      reference: string;
      amount: number;
      netAmount?: number;
      availableBalance?: number;
    },
  ): Promise<EmailDeliveryResult> {
    const amount = this.formatCurrency(details.amount);
    const template = this.buildBrandedTemplate(user, {
      title: 'Withdrawal request submitted',
      preheader: `${details.reference} is pending approval for ${amount}.`,
      eyebrow: 'Treasury',
      intro:
        'Your withdrawal request was submitted and is now pending treasury approval.',
      highlightLabel: 'Requested amount',
      highlightValue: amount,
      rows: [
        { label: 'Reference', value: details.reference },
        {
          label: 'Net estimate',
          value:
            typeof details.netAmount === 'number'
              ? this.formatCurrency(details.netAmount)
              : 'Pending',
        },
        { label: 'Status', value: 'Pending approval' },
        {
          label: 'Available balance',
          value: this.formatCurrency(details.availableBalance ?? 0),
        },
      ],
      bullets: [
        'Treasury will review the destination and account status.',
        'You will receive another email after the request is approved, rejected, or cancelled.',
      ],
      tone: 'amber',
    });

    return this.sendEmail({
      to: user.email,
      subject: 'Novabit: Withdrawal request submitted',
      text: template.text,
      html: template.html,
    });
  }

  async sendWithdrawalReviewUpdate(
    user: EmailRecipient,
    details: {
      reference: string;
      status: string;
      amount: number;
      netAmount?: number;
      reviewNote?: string | null;
      availableBalance?: number;
    },
  ): Promise<EmailDeliveryResult> {
    const statusLabel = this.formatStatus(details.status);
    const template = this.buildBrandedTemplate(user, {
      title: `Withdrawal ${statusLabel.toLowerCase()}`,
      preheader: `${details.reference} is now ${statusLabel.toLowerCase()}.`,
      eyebrow: 'Treasury Update',
      intro:
        details.status === 'approved'
          ? 'Your withdrawal has been approved by treasury.'
          : 'Treasury updated your withdrawal request.',
      highlightLabel: 'Review status',
      highlightValue: statusLabel,
      rows: [
        { label: 'Reference', value: details.reference },
        { label: 'Amount', value: this.formatCurrency(details.amount) },
        {
          label: 'Net amount',
          value:
            typeof details.netAmount === 'number'
              ? this.formatCurrency(details.netAmount)
              : 'Pending',
        },
        {
          label: 'Available balance',
          value: this.formatCurrency(details.availableBalance ?? 0),
        },
      ],
      bullets: [
        details.reviewNote ||
          'Open your dashboard to review the latest withdrawal history.',
      ],
      tone: details.status === 'approved' ? 'green' : details.status === 'pending' ? 'amber' : 'red',
    });

    return this.sendEmail({
      to: user.email,
      subject: `Novabit: Withdrawal ${statusLabel.toLowerCase()}`,
      text: template.text,
      html: template.html,
    });
  }

  async sendDailyInterestCreditSummary(
    user: EmailRecipient,
    details: {
      entries: Array<{
        planName: string;
        amount: number;
        createdAt: string;
      }>;
      availableBalance: number;
      totalProfit: number;
    },
  ): Promise<EmailDeliveryResult> {
    const totalCredited = details.entries.reduce(
      (sum, entry) => sum + (Number(entry.amount) || 0),
      0,
    );
    const count = details.entries.length;
    const firstEntry = details.entries[0] ?? null;
    const lastEntry = details.entries[count - 1] ?? null;
    const template = this.buildBrandedTemplate(user, {
      title:
        count === 1 ? 'Daily interest credited' : 'Daily interest credits posted',
      preheader: `${this.formatCurrency(totalCredited)} in plan interest was added to your Novabit account.`,
      eyebrow: 'Account Growth',
      intro:
        count === 1
          ? 'A daily interest increment was posted to your Novabit account.'
          : `${count} daily interest increments were posted to your Novabit account.`,
      highlightLabel: 'Interest credited',
      highlightValue: this.formatCurrency(totalCredited),
      rows: [
        {
          label: 'Available balance',
          value: this.formatCurrency(details.availableBalance),
        },
        {
          label: 'Total profit',
          value: this.formatCurrency(details.totalProfit),
        },
        {
          label: 'Credit window',
          value:
            firstEntry && lastEntry
              ? firstEntry.createdAt === lastEntry.createdAt
                ? this.formatDateTime(firstEntry.createdAt)
                : `${this.formatDateTime(firstEntry.createdAt)} to ${this.formatDateTime(lastEntry.createdAt)}`
              : 'Account update',
        },
      ],
      bullets: details.entries.map(
        (entry) =>
          `${entry.planName}: ${this.formatCurrency(entry.amount)} on ${this.formatDateTime(entry.createdAt)}`,
      ),
      tone: 'green',
    });

    return this.sendEmail({
      to: user.email,
      subject:
        count === 1
          ? 'Novabit: Daily interest credited'
          : 'Novabit: Daily interest credits posted',
      text: template.text,
      html: template.html,
    });
  }

  async sendActivityEmail(
    user: EmailRecipient,
    title: string,
    lines: string[],
  ): Promise<EmailDeliveryResult> {
    const safeLines = this.cleanLines(lines);
    const template = this.buildBrandedTemplate(user, {
      title,
      preheader: `Novabit account update: ${title}.`,
      eyebrow: 'Account Update',
      intro: title,
      bullets: safeLines,
      tone: 'slate',
    });

    return this.sendEmail({
      to: user.email,
      subject: `Novabit: ${title}`,
      text: template.text,
      html: template.html,
    });
  }

  private async sendEmail(message: EmailMessage): Promise<EmailDeliveryResult> {
    const mode = this.getDeliveryMode();

    try {
      if (mode === 'postmark') {
        await this.sendViaPostmark(message);
        return { mode, accepted: true };
      }

      if (mode === 'resend') {
        await this.sendViaResend(message);
        return { mode, accepted: true };
      }

      this.logger.log(
        `[email:log] To=${message.to} Subject=${message.subject}\n${message.text}`,
      );
      return { mode, accepted: true };
    } catch (error) {
      this.logger.error(
        `Email delivery failed through ${mode}: ${
          error instanceof Error ? error.message : 'Unknown email error'
        }`,
      );
      return { mode, accepted: false };
    }
  }

  private async sendViaPostmark(message: EmailMessage) {
    const token = (process.env.POSTMARK_SERVER_TOKEN ?? '').trim();
    const from = this.resolveFromAddress();
    const response = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': token,
      },
      body: JSON.stringify({
        From: from,
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
        HtmlBody: message.html,
        MessageStream:
          (process.env.POSTMARK_MESSAGE_STREAM ?? '').trim() || 'outbound',
      }),
    });

    if (!response.ok) {
      throw new Error(`Postmark returned HTTP ${response.status}.`);
    }
  }

  private async sendViaResend(message: EmailMessage) {
    const apiKey = (process.env.RESEND_API_KEY ?? '').trim();
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.resolveFromAddress(),
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend returned HTTP ${response.status}.`);
    }
  }

  private resolveFromAddress() {
    return (
      (process.env.EMAIL_FROM ?? '').trim() ||
      'Novabit Capital <no-reply@novabit.local>'
    );
  }

  private resolveName(user: Pick<PublicUser, 'name' | 'username'>) {
    return user.name || user.username || 'Investor';
  }

  private buildBrandedTemplate(
    user: EmailRecipient,
    input: BrandedEmailTemplateInput,
  ) {
    const tone = this.getTone(input.tone);
    const safeRows = input.rows ?? [];
    const safeBullets = this.cleanLines(input.bullets ?? []);
    const greeting = `Hello ${this.resolveName(user)},`;
    const text = [
      greeting,
      '',
      input.title,
      '',
      input.intro,
      input.highlightLabel && input.highlightValue
        ? `${input.highlightLabel}: ${input.highlightValue}`
        : '',
      ...safeRows.map((row) => `${row.label}: ${row.value}`),
      ...safeBullets.map((line) => `- ${line}`),
      input.ctaHref ? `${input.ctaLabel || 'Open dashboard'}: ${input.ctaHref}` : '',
      '',
      input.footerNote ||
        'If you did not request this activity, contact Novabit support immediately.',
      '',
      'Novabit Capital',
    ]
      .filter((line) => line !== '')
      .join('\n');

    const rowsHtml = safeRows.length
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0 0;border-collapse:separate;border-spacing:0 10px">${safeRows
          .map(
            (row) =>
              `<tr><td style="padding:12px 14px;border:1px solid #dbe8eb;border-radius:14px;background:#f8fbfb"><span style="display:block;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">${this.escapeHtml(
                row.label,
              )}</span><strong style="display:block;margin-top:4px;color:#0f172a;font-size:15px;line-height:1.45">${this.escapeHtml(
                row.value,
              )}</strong></td></tr>`,
          )
          .join('')}</table>`
      : '';

    const bulletsHtml = safeBullets.length
      ? `<div style="margin:22px 0 0">${safeBullets
          .map(
            (line) =>
              `<p style="margin:0 0 10px;color:#334155;font-size:15px;line-height:1.65"><span style="display:inline-block;width:7px;height:7px;margin-right:9px;border-radius:999px;background:${tone.accent}"></span>${this.escapeHtml(
                line,
              )}</p>`,
          )
          .join('')}</div>`
      : '';

    const ctaHtml = input.ctaHref
      ? `<div style="margin:26px 0 0"><a href="${this.escapeHtml(
          input.ctaHref,
        )}" style="display:inline-block;padding:13px 18px;border-radius:999px;background:${tone.accent};color:#ffffff;font-weight:800;text-decoration:none">${this.escapeHtml(
          input.ctaLabel || 'Open dashboard',
        )}</a></div>`
      : '';

    const highlightHtml =
      input.highlightLabel && input.highlightValue
        ? `<div style="margin:24px 0 0;padding:18px;border-radius:18px;background:${tone.surface};border:1px solid ${tone.border}"><span style="display:block;color:${tone.accent};font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.12em">${this.escapeHtml(
            input.highlightLabel,
          )}</span><strong style="display:block;margin-top:8px;color:#0f172a;font-size:30px;line-height:1;letter-spacing:.04em">${this.escapeHtml(
            input.highlightValue,
          )}</strong></div>`
        : '';

    const html = [
      '<!doctype html><html><body style="margin:0;background:#eef5f6;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#0f172a">',
      `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${this.escapeHtml(
        input.preheader,
      )}</div>`,
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><td align="center">',
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;border-collapse:collapse">',
      `<tr><td style="padding:24px;border-radius:26px 26px 0 0;background:linear-gradient(135deg,${tone.accent},#0f766e);color:#ffffff">`,
      '<div style="font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;opacity:.86">Novabit Capital</div>',
      `<h1 style="margin:14px 0 0;font-size:30px;line-height:1.05;letter-spacing:-.04em">${this.escapeHtml(
        input.title,
      )}</h1>`,
      `<p style="margin:12px 0 0;color:rgba(255,255,255,.84);font-size:15px;line-height:1.55">${this.escapeHtml(
        input.preheader,
      )}</p>`,
      '</td></tr>',
      '<tr><td style="padding:28px 24px 24px;border:1px solid #d7e7ea;border-top:0;border-radius:0 0 26px 26px;background:#ffffff">',
      `<div style="color:${tone.accent};font-size:12px;font-weight:900;letter-spacing:.16em;text-transform:uppercase">${this.escapeHtml(
        input.eyebrow,
      )}</div>`,
      `<p style="margin:16px 0 0;color:#334155;font-size:16px;line-height:1.7">${this.escapeHtml(
        greeting,
      )}</p>`,
      `<p style="margin:10px 0 0;color:#334155;font-size:16px;line-height:1.7">${this.escapeHtml(
        input.intro,
      )}</p>`,
      highlightHtml,
      rowsHtml,
      bulletsHtml,
      ctaHtml,
      `<p style="margin:26px 0 0;padding-top:18px;border-top:1px solid #e2edf0;color:#64748b;font-size:13px;line-height:1.6">${this.escapeHtml(
        input.footerNote ||
          'If you did not request this activity, contact Novabit support immediately.',
      )}</p>`,
      '<p style="margin:12px 0 0;color:#94a3b8;font-size:12px;line-height:1.5">Novabit Capital transactional notification.</p>',
      '</td></tr></table></td></tr></table></body></html>',
    ].join('');

    return { text, html };
  }

  private cleanLines(lines: string[]) {
    return lines
      .map((line) => (line ?? '').trim())
      .filter((line) => line.length > 0);
  }

  private getTone(tone: BrandedEmailTemplateInput['tone']) {
    if (tone === 'green') {
      return {
        accent: '#16a34a',
        surface: '#f0fdf4',
        border: '#bbf7d0',
      };
    }

    if (tone === 'amber') {
      return {
        accent: '#d97706',
        surface: '#fffbeb',
        border: '#fde68a',
      };
    }

    if (tone === 'red') {
      return {
        accent: '#dc2626',
        surface: '#fef2f2',
        border: '#fecaca',
      };
    }

    if (tone === 'slate') {
      return {
        accent: '#475569',
        surface: '#f8fafc',
        border: '#e2e8f0',
      };
    }

    return {
      accent: '#0f969c',
      surface: '#ecfeff',
      border: '#a5f3fc',
    };
  }

  private formatStatus(value: string) {
    const normalized = value.trim().replace(/_/g, ' ');
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  }

  private formatDateTime(value: string) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      return value;
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  }
}

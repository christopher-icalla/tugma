import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' })[c]!);

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendPasswordReset(to: string, token: string): Promise<boolean> {
    const { FRONTEND_URL, EMAIL_API_URL, EMAIL_API_KEY, EMAIL_FROM_NAME } = config();
    const base = FRONTEND_URL.replace(/\/+$/, '');
    const link = `${base}/reset-password?token=${token}`;

    if (!EMAIL_API_KEY || !EMAIL_API_URL || !base.startsWith('https://')) {
      const host = safeHost(base);
      if (host && ['localhost', '127.0.0.1', '::1'].includes(host)) {
        this.logger.warn(`Email not configured; password reset link: ${link}`);
      } else {
        this.logger.error('Password reset email not configured (EMAIL_API_URL / EMAIL_API_KEY / FRONTEND_URL)');
      }
      return false;
    }

    const brand = escapeHtml(EMAIL_FROM_NAME);
    const html =
      `<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">` +
      `<p>We received a request to reset your ${brand} password.</p>` +
      `<p><a href="${escapeHtml(link)}">Reset your password</a></p>` +
      `<p>This link expires in 1 hour and can be used once. If you did not request it, ` +
      `ignore this email — your password is unchanged.</p>` +
      `<p style="font-size:12px;color:#888">Sent by ${brand}. We never ask for your password by email.</p>` +
      `</td></tr></table>`;

    try {
      const res = await fetch(`${EMAIL_API_URL.replace(/\/+$/, '')}/api/v1/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Email-Key': EMAIL_API_KEY },
        body: JSON.stringify({
          to: [to],
          subject: `Reset your ${EMAIL_FROM_NAME} password`,
          html,
          from_name: EMAIL_FROM_NAME,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (e) {
      this.logger.error(`Password reset email failed: ${(e as Error).message}`);
      return false;
    }
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return null;
  }
}

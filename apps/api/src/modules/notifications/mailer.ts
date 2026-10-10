import type { Logger } from '../../lib/logger';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Development mailer: writes emails to the log instead of sending them.
 * Replace with an SMTP / transactional email provider implementation in production.
 */
export class LogMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  constructor(private readonly logger: Logger) {}

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    if (this.sent.length > 100) this.sent.shift();
    this.logger.info({ to: message.to, subject: message.subject, text: message.text }, '[mail] message (not sent: LogMailer)');
  }
}

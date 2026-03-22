/* ─────────────────────────────────────────────
 *  email.service.ts
 *  Provider-agnostic email sender.
 *
 *  Env var  EMAIL_PROVIDER controls the backend:
 *    "sendgrid"  → @sendgrid/mail (API key: SENDGRID_API_KEY)
 *    "postmark"  → postmark        (server token: POSTMARK_SERVER_TOKEN)
 *    "smtp"      → nodemailer SMTP (SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS)
 *
 *  Defaults to "smtp" if unset (safe for local dev with Mailtrap etc.)
 * ───────────────────────────────────────────── */

import nodemailer, { Transporter } from 'nodemailer';

export interface SendMailOptions {
    to: string;
    subject: string;
    html: string;
    text: string;
}

type Provider = 'sendgrid' | 'postmark' | 'smtp';

/* ──────────────────────────────────
 *  SendGrid strategy
 * ────────────────────────────────── */
async function sendViaSendGrid(opts: SendMailOptions, from: string): Promise<void> {
    // Dynamic import keeps the package optional at boot
    const sgMail = (await import('@sendgrid/mail')).default;
    const apiKey = process.env.SENDGRID_API_KEY;

    if (!apiKey) throw new Error('[EmailService] SENDGRID_API_KEY is not set');

    sgMail.setApiKey(apiKey);

    await sgMail.send({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
    });

    console.log(`[EmailService][SendGrid] Sent "${opts.subject}" → ${opts.to}`);
}

/* ──────────────────────────────────
 *  Postmark strategy
 * ────────────────────────────────── */
async function sendViaPostmark(opts: SendMailOptions, from: string): Promise<void> {
    const { ServerClient } = await import('postmark');
    const token = process.env.POSTMARK_SERVER_TOKEN;

    if (!token) throw new Error('[EmailService] POSTMARK_SERVER_TOKEN is not set');

    const client = new ServerClient(token);

    await client.sendEmail({
        From: from,
        To: opts.to,
        Subject: opts.subject,
        HtmlBody: opts.html,
        TextBody: opts.text,
        MessageStream: 'outbound',
    });

    console.log(`[EmailService][Postmark] Sent "${opts.subject}" → ${opts.to}`);
}

/* ──────────────────────────────────
 *  SMTP fallback strategy (nodemailer)
 * ────────────────────────────────── */
let _smtpTransporter: Transporter | null = null;

function getSmtpTransporter(): Transporter {
    if (_smtpTransporter) return _smtpTransporter;

    const host = process.env.SMTP_HOST ?? '';
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER ?? '';
    const pass = process.env.SMTP_PASS ?? '';

    if (!host || !user || !pass) {
        console.warn('[EmailService][SMTP] Missing SMTP env vars — emails may not send');
    }

    _smtpTransporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });

    return _smtpTransporter;
}

async function sendViaSmtp(opts: SendMailOptions, from: string): Promise<void> {
    const info = await getSmtpTransporter().sendMail({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
    });

    console.log(`[EmailService][SMTP] Sent "${opts.subject}" → ${opts.to} (${info.messageId})`);
}

/* ──────────────────────────────────
 *  Public API
 * ────────────────────────────────── */
class EmailService {
    async send(opts: SendMailOptions): Promise<void> {
        const provider: Provider = (process.env.EMAIL_PROVIDER as Provider) ?? 'smtp';
        const from = process.env.EMAIL_FROM ?? 'NETSA <noreply@netsa.in>';

        switch (provider) {
            case 'sendgrid':
                return sendViaSendGrid(opts, from);
            case 'postmark':
                return sendViaPostmark(opts, from);
            default:
                return sendViaSmtp(opts, from);
        }
    }
}

export const emailService = new EmailService();

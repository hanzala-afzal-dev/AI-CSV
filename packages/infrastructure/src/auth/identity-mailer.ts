import nodemailer from "nodemailer";
import type { IdentityMailer } from "@agentic-csv/application";
import type { AppEnv } from "../config/env";
import type { AppLogger } from "../logging/logger";

export class SmtpIdentityMailer implements IdentityMailer {
  private readonly transport;

  public constructor(
    private readonly env: AppEnv,
    private readonly logger: AppLogger
  ) {
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" }
        : undefined
    });
  }

  public async sendEmailVerification(input: {
    readonly email: string;
    readonly displayName: string;
    readonly token: string;
  }): Promise<void> {
    await this.send(
      input.email,
      "Verify your email",
      input.displayName,
      `/verify-email?token=${encodeURIComponent(input.token)}`
    );
  }

  public async sendEmailChangeVerification(input: {
    readonly email: string;
    readonly displayName: string;
    readonly token: string;
  }): Promise<void> {
    await this.send(
      input.email,
      "Confirm your new email",
      input.displayName,
      `/verify-email?token=${encodeURIComponent(input.token)}`
    );
  }

  public async sendPasswordReset(input: {
    readonly email: string;
    readonly displayName: string;
    readonly token: string;
  }): Promise<void> {
    await this.send(
      input.email,
      "Reset your password",
      input.displayName,
      `/reset-password?token=${encodeURIComponent(input.token)}`
    );
  }

  private send(
    email: string,
    subject: string,
    displayName: string,
    path: string
  ): Promise<unknown> {
    const url = new URL(path, this.env.APP_URL).toString();
    return this.transport
      .sendMail({
        from: this.env.SMTP_FROM,
        to: email,
        subject,
        text: `Hello ${displayName},\n\nOpen this link to continue:\n${url}\n\nIf you did not request this, ignore this email.`,
        html: `<p>Hello ${escapeHtml(displayName)},</p><p><a href="${escapeHtml(url)}">Continue securely</a></p><p>If you did not request this, ignore this email.</p>`
      })
      .catch((error: unknown) => {
        this.logger.error(
          {
            event: "identity_email_delivery_failed",
            error: {
              name: error instanceof Error ? error.name : "Error",
              message: "Identity email could not be delivered."
            }
          },
          "identity email delivery failed"
        );
      });
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character
  );
}

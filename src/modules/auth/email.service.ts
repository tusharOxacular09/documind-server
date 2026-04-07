import nodemailer from "nodemailer";

import { env } from "../../config/env";

const transporter =
  env.smtpHost && env.smtpUser && env.smtpPass
    ? nodemailer.createTransport({
        host: env.smtpHost,
        port: env.smtpPort,
        secure: env.smtpPort === 465,
        auth: { user: env.smtpUser, pass: env.smtpPass },
      })
    : null;

const sendMail = async (to: string, subject: string, html: string): Promise<void> => {
  if (!transporter) {
    console.info(`[mail:fallback] to=${to} subject="${subject}"\n${html}`);
    return;
  }

  await transporter.sendMail({
    from: env.emailFrom,
    to,
    subject,
    html,
  });
};

const sendVerificationEmail = async (email: string, token: string): Promise<void> => {
  const url = `${env.appBaseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  await sendMail(
    email,
    "Verify your DocuMind email",
    `<p>Welcome to DocuMind.</p><p>Please verify your email:</p><p><a href="${url}">${url}</a></p><p>This link expires in 30 minutes.</p>`
  );
};

const sendPasswordResetEmail = async (email: string, token: string): Promise<void> => {
  const url = `${env.appBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail(
    email,
    "Reset your DocuMind password",
    `<p>You requested a password reset.</p><p>Use this link:</p><p><a href="${url}">${url}</a></p><p>This link expires in 30 minutes.</p>`
  );
};

export const emailService = {
  sendVerificationEmail,
  sendPasswordResetEmail,
};

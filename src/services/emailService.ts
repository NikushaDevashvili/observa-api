import { Resend } from "resend";
import { env } from "../config/env.js";
import { query } from "../db/client.js";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Email Service
 * Handles sending emails for onboarding, verification, and notifications
 */
export class EmailService {
  private static resend: Resend | null = null;

  /**
   * Initialize Resend client if API key is configured
   */
  private static getResend(): Resend | null {
    if (!env.EMAIL_SERVICE_API_KEY) {
      console.warn("⚠️ EMAIL_SERVICE_API_KEY not configured, email sending disabled");
      return null;
    }

    if (!this.resend) {
      this.resend = new Resend(env.EMAIL_SERVICE_API_KEY);
    }

    return this.resend;
  }

  /**
   * Get email template by name
   */
  private static async getTemplate(templateName: string): Promise<string | null> {
    const templatePath = path.join(__dirname, "../templates/emails", `${templateName}.html`);
    
    try {
      if (fs.existsSync(templatePath)) {
        return fs.readFileSync(templatePath, "utf-8");
      }
    } catch (error) {
      console.warn(`Template not found: ${templatePath}, using default`);
    }
    
    return null;
  }

  /**
   * Send welcome email with API key
   */
  static async sendWelcomeEmail(
    userId: string,
    email: string,
    name: string,
    apiKey: string
  ): Promise<void> {
    const resend = this.getResend();
    if (!resend) {
      console.log(`📧 Email service not configured, skipping welcome email to ${email}`);
      return;
    }

    try {
      const fromAddress = env.EMAIL_FROM_ADDRESS || "noreply@observa.ai";
      const fromName = env.EMAIL_FROM_NAME || "Observa";
      const frontendUrl = env.FRONTEND_URL || "https://observa-app.vercel.app";

      let html = await this.getTemplate("welcome");
      
      // Default template if file doesn't exist
      if (!html) {
        html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Observa</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #2563eb;">Welcome to Observa, ${name}!</h1>
  
  <p>Thank you for signing up. Your account has been created and you're ready to start tracking your AI applications.</p>
  
  <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h2 style="margin-top: 0;">Your API Key</h2>
    <p style="word-break: break-all; font-family: monospace; background: white; padding: 10px; border-radius: 4px;">${apiKey}</p>
    <p style="font-size: 12px; color: #666;">⚠️ Keep this key secure and never commit it to version control.</p>
  </div>
  
  <div style="margin: 30px 0;">
    <a href="${frontendUrl}/dashboard" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Go to Dashboard</a>
  </div>
  
  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
    <h3>Quick Start</h3>
    <ol>
      <li>Install the SDK: <code>npm install observa-sdk</code></li>
      <li>Initialize with your API key</li>
      <li>Start tracking traces in your application</li>
      <li>View results in your dashboard</li>
    </ol>
    
    <p><a href="${frontendUrl}/docs">View Documentation →</a></p>
  </div>
  
  <p style="margin-top: 30px; font-size: 12px; color: #666;">
    If you have any questions, feel free to reach out to our support team.
  </p>
</body>
</html>`;
      } else {
        // Replace template variables
        html = html
          .replace(/\{\{name\}\}/g, name)
          .replace(/\{\{apiKey\}\}/g, apiKey)
          .replace(/\{\{frontendUrl\}\}/g, frontendUrl);
      }

      await resend.emails.send({
        from: `${fromName} <${fromAddress}>`,
        to: email,
        subject: "Welcome to Observa!",
        html,
      });

      console.log(`✅ Welcome email sent to ${email}`);
    } catch (error) {
      console.error(`❌ Failed to send welcome email to ${email}:`, error);
      // Don't throw - email failures shouldn't break signup
    }
  }

  /**
   * Send email verification email
   */
  static async sendEmailVerificationEmail(
    userId: string,
    email: string,
    token: string
  ): Promise<void> {
    const resend = this.getResend();
    if (!resend) {
      console.log(`📧 Email service not configured, skipping verification email to ${email}`);
      return;
    }

    try {
      const fromAddress = env.EMAIL_FROM_ADDRESS || "noreply@observa.ai";
      const fromName = env.EMAIL_FROM_NAME || "Observa";
      const frontendUrl = env.FRONTEND_URL || "https://observa-app.vercel.app";
      const verificationUrl = `${frontendUrl}/auth/verify-email?token=${token}`;

      let html = await this.getTemplate("verification");
      
      if (!html) {
        html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #2563eb;">Verify Your Email Address</h1>
  
  <p>Please verify your email address to complete your account setup.</p>
  
  <div style="margin: 30px 0;">
    <a href="${verificationUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Verify Email Address</a>
  </div>
  
  <p style="color: #666; font-size: 14px;">
    Or copy and paste this link into your browser:<br>
    <a href="${verificationUrl}" style="word-break: break-all; color: #2563eb;">${verificationUrl}</a>
  </p>
  
  <p style="margin-top: 30px; font-size: 12px; color: #666;">
    This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
  </p>
</body>
</html>`;
      } else {
        html = html
          .replace(/\{\{verificationUrl\}\}/g, verificationUrl)
          .replace(/\{\{token\}\}/g, token);
      }

      await resend.emails.send({
        from: `${fromName} <${fromAddress}>`,
        to: email,
        subject: "Verify Your Email Address",
        html,
      });

      console.log(`✅ Verification email sent to ${email}`);
    } catch (error) {
      console.error(`❌ Failed to send verification email to ${email}:`, error);
      throw error;
    }
  }

  /**
   * Send onboarding completion email
   */
  static async sendOnboardingCompletionEmail(
    userId: string,
    email: string,
    name: string
  ): Promise<void> {
    const resend = this.getResend();
    if (!resend) {
      console.log(`📧 Email service not configured, skipping completion email to ${email}`);
      return;
    }

    try {
      const fromAddress = env.EMAIL_FROM_ADDRESS || "noreply@observa.ai";
      const fromName = env.EMAIL_FROM_NAME || "Observa";
      const frontendUrl = env.FRONTEND_URL || "https://observa-app.vercel.app";

      let html = await this.getTemplate("completion");
      
      if (!html) {
        html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Onboarding Complete!</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #2563eb;">🎉 Congratulations, ${name}!</h1>
  
  <p>You've completed the onboarding process and are ready to start getting the most out of Observa.</p>
  
  <div style="background: #f0fdf4; border: 2px solid #22c55e; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h2 style="margin-top: 0; color: #16a34a;">What's Next?</h2>
    <ul>
      <li>Explore advanced features in your dashboard</li>
      <li>Set up alerts and monitoring</li>
      <li>Invite your team members</li>
      <li>Check out our documentation for best practices</li>
    </ul>
  </div>
  
  <div style="margin: 30px 0;">
    <a href="${frontendUrl}/dashboard" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Go to Dashboard</a>
  </div>
  
  <p style="margin-top: 30px; font-size: 12px; color: #666;">
    Need help? Check out our <a href="${frontendUrl}/docs">documentation</a> or reach out to support.
  </p>
</body>
</html>`;
      } else {
        html = html
          .replace(/\{\{name\}\}/g, name)
          .replace(/\{\{frontendUrl\}\}/g, frontendUrl);
      }

      await resend.emails.send({
        from: `${fromName} <${fromAddress}>`,
        to: email,
        subject: "🎉 You're All Set!",
        html,
      });

      console.log(`✅ Onboarding completion email sent to ${email}`);
    } catch (error) {
      console.error(`❌ Failed to send completion email to ${email}:`, error);
      // Don't throw - email failures shouldn't break completion
    }
  }

  /**
   * Send onboarding reminder email
   */
  static async sendOnboardingReminderEmail(
    userId: string,
    email: string,
    name: string,
    progress: number,
    nextTask?: string
  ): Promise<void> {
    const resend = this.getResend();
    if (!resend) {
      console.log(`📧 Email service not configured, skipping reminder email to ${email}`);
      return;
    }

    try {
      const fromAddress = env.EMAIL_FROM_ADDRESS || "noreply@observa.ai";
      const fromName = env.EMAIL_FROM_NAME || "Observa";
      const frontendUrl = env.FRONTEND_URL || "https://observa-app.vercel.app";

      let html = await this.getTemplate("onboarding-reminder");
      
      if (!html) {
        html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Continue Your Setup</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #2563eb;">Hi ${name},</h1>
  
  <p>You're ${progress}% of the way through onboarding! Let's keep going.</p>
  
  ${nextTask ? `<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
    <strong>Next step:</strong> ${nextTask}
  </div>` : ''}
  
  <div style="margin: 30px 0;">
    <a href="${frontendUrl}/dashboard" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Continue Setup</a>
  </div>
  
  <p style="margin-top: 30px; font-size: 12px; color: #666;">
    Questions? Check out our <a href="${frontendUrl}/docs">documentation</a> or reach out to support.
  </p>
</body>
</html>`;
      } else {
        html = html
          .replace(/\{\{name\}\}/g, name)
          .replace(/\{\{progress\}\}/g, progress.toString())
          .replace(/\{\{nextTask\}\}/g, nextTask || "Continue setup")
          .replace(/\{\{frontendUrl\}\}/g, frontendUrl);
      }

      await resend.emails.send({
        from: `${fromName} <${fromAddress}>`,
        to: email,
        subject: `You're ${progress}% there! Continue your Observa setup`,
        html,
      });

      console.log(`✅ Reminder email sent to ${email}`);
    } catch (error) {
      console.error(`❌ Failed to send reminder email to ${email}:`, error);
      // Don't throw - email failures shouldn't break flow
    }
  }

  /**
   * Send password reset email
   */
  static async sendPasswordResetEmail(
    userId: string,
    email: string,
    token: string
  ): Promise<void> {
    const resend = this.getResend();
    if (!resend) {
      console.log(`📧 Email service not configured, skipping password reset email to ${email}`);
      return;
    }

    try {
      const fromAddress = env.EMAIL_FROM_ADDRESS || "noreply@observa.ai";
      const fromName = env.EMAIL_FROM_NAME || "Observa";
      const frontendUrl = env.FRONTEND_URL || "https://observa-app.vercel.app";
      const resetUrl = `${frontendUrl}/auth/reset-password?token=${token}`;

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #2563eb;">Reset Your Password</h1>
  
  <p>You requested to reset your password. Click the button below to create a new password.</p>
  
  <div style="margin: 30px 0;">
    <a href="${resetUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
  </div>
  
  <p style="color: #666; font-size: 14px;">
    Or copy and paste this link into your browser:<br>
    <a href="${resetUrl}" style="word-break: break-all; color: #2563eb;">${resetUrl}</a>
  </p>
  
  <p style="margin-top: 30px; font-size: 12px; color: #666;">
    This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
  </p>
</body>
</html>`;

      await resend.emails.send({
        from: `${fromName} <${fromAddress}>`,
        to: email,
        subject: "Reset Your Password",
        html,
      });

      console.log(`✅ Password reset email sent to ${email}`);
    } catch (error) {
      console.error(`❌ Failed to send password reset email to ${email}:`, error);
      throw error;
    }
  }

  /**
   * Generate email verification token
   */
  static async generateVerificationToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiration

    await query(
      `INSERT INTO email_verification_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [userId, token, expiresAt]
    );

    return token;
  }

  /**
   * Verify email token
   */
  static async verifyToken(token: string): Promise<string | null> {
    const result = await query(
      `SELECT user_id, expires_at, verified_at
       FROM email_verification_tokens
       WHERE token = $1`,
      [token]
    );

    if (result.length === 0) {
      return null;
    }

    const record = result[0];
    const now = new Date();

    // Check if already verified
    if (record.verified_at) {
      return null; // Token already used
    }

    // Check if expired
    if (new Date(record.expires_at) < now) {
      return null; // Token expired
    }

    // Mark as verified
    await query(
      `UPDATE email_verification_tokens
       SET verified_at = $1
       WHERE token = $2`,
      [now, token]
    );

    return record.user_id;
  }

  /**
   * Clean up expired tokens
   */
  static async cleanupExpiredTokens(): Promise<void> {
    try {
      const result = await query(
        `DELETE FROM email_verification_tokens
         WHERE expires_at < NOW()
         OR (verified_at IS NOT NULL AND verified_at < NOW() - INTERVAL '7 days')`
      );
      console.log(`🧹 Cleaned up expired verification tokens`);
    } catch (error) {
      console.error("❌ Failed to cleanup expired tokens:", error);
    }
  }
}


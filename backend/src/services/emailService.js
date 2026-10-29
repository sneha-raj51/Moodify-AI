/**
 * Email Service for Moodify AI
 * Provides secure email-based delivery for password reset tokens and security notices.
 * If no email provider is configured, it fails gracefully without revealing tokens or breaking flows.
 */

// In-memory capture for test verification
const sentEmailsForTesting = [];

export const getSentEmailsForTesting = () => [...sentEmailsForTesting];
export const clearSentEmailsForTesting = () => {
  sentEmailsForTesting.length = 0;
};
export const getLastSentEmailForTesting = () => {
  return sentEmailsForTesting[sentEmailsForTesting.length - 1] || null;
};

/**
 * Sends a password reset email using a configured provider (Resend, SendGrid, or test environment).
 * If no provider is configured, safely logs without exposing the token and returns a status.
 */
export const sendPasswordResetEmail = async ({ to, token, appName = 'Moodify AI' }) => {
  const isTest = process.env.NODE_ENV === 'test';

  if (isTest) {
    // Capture email safely in-memory for unit test assertions without external network calls
    sentEmailsForTesting.push({
      to,
      token,
      subject: `${appName} - Password Reset Request`,
      sentAt: new Date()
    });
    return { delivered: true, provider: 'test-transport' };
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || 'noreply@moodify.ai';

  // Configured via Resend HTTP API
  if (resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject: `${appName} - Password Reset Request`,
          text: `You recently requested to reset your password for ${appName}.\n\nYour reset token is: ${token}\n\nThis token will expire in 1 hour. If you did not make this request, you can safely ignore this email.`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 12px;">
              <h2 style="color: #0f172a;">Password Reset Request</h2>
              <p>You recently requested to reset your password for <strong>${appName}</strong>.</p>
              <p>Your one-time reset token is:</p>
              <div style="background-color: #f1f5f9; padding: 12px 18px; font-family: monospace; font-size: 16px; font-weight: bold; letter-spacing: 1px; border-radius: 8px; margin: 16px 0; word-break: break-all;">
                ${token}
              </div>
              <p style="color: #64748b; font-size: 14px;">This token is valid for 1 hour and can only be used once.</p>
              <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">If you did not request this, please ignore this email or review your account security.</p>
            </div>
          `
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.warn('[EmailService] Resend API rejected message:', errorData.message || response.status);
        return { delivered: false, provider: 'resend', error: errorData.message || response.statusText };
      }

      return { delivered: true, provider: 'resend' };
    } catch (err) {
      console.warn('[EmailService] Network error sending email via Resend:', err.message);
      return { delivered: false, provider: 'resend', error: err.message };
    }
  }

  // Safe fallback if no email provider is configured
  console.info('[EmailService] No email provider configured (set RESEND_API_KEY in environment). Token generated securely in database without exposure.');
  return { delivered: false, provider: 'none', reason: 'not_configured' };
};

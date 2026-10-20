import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';
import { env } from '../config/env';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export const escapeHtml = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

export const isValidHttpUrl = (urlString: unknown): boolean => {
  if (typeof urlString !== 'string' || !urlString.trim()) return false;
  try {
    const parsed = new URL(urlString.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const isValidEmail = (email: unknown): boolean => {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

// Testing transporter override
let customTransporter: Transporter | null = null;
export const setTransporterForTesting = (t: Transporter | null) => {
  customTransporter = t;
};

// Create Gmail transporter with credentials
const getGmailTransporter = (): Transporter | null => {
  if (customTransporter) {
    return customTransporter;
  }

  const user = (env.email?.user || process.env.GMAIL_USER || '').trim();
  const rawPass = (env.email?.pass || process.env.GMAIL_APP_PASS || '').trim();

  if (!user || !rawPass) {
    return null;
  }

  // Strip all spaces and quotes from app password to ensure clean authentication
  const pass = rawPass.replace(/[\s"']/g, '');

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 25000,
    greetingTimeout: 25000,
    socketTimeout: 25000,
  });
};

const sendWithRetry = async (
  transporter: Transporter,
  mailOptions: SendMailOptions,
  maxRetries = 2,
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  let lastError: any = null;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      lastError = err;
      console.warn(`[Email Service] Send attempt ${attempt} failed:`, err?.message || err);
      if (attempt <= maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
      }
    }
  }
  return { success: false, error: lastError?.message || String(lastError) };
};

export interface AlertConfirmationParams {
  email: string;
  userName?: string;
  productName: string;
  brand?: string;
  currentPrice: number;
  targetPrice: number;
  bestStore: string;
  productUrl: string;
  imageUrl?: string;
}

export interface PriceDropNotificationParams {
  email: string;
  userName?: string;
  productName: string;
  brand?: string;
  previousPrice?: number | null;
  currentPrice: number;
  targetPrice?: number | null;
  dropAmount?: number;
  bestStore: string;
  productUrl: string;
  imageUrl?: string;
}

/**
 * Sends a Price Alert Confirmation email when user tracks a product
 */
export const sendPriceAlertConfirmationEmail = async (params: AlertConfirmationParams) => {
  const {
    email,
    userName = 'Shopper',
    productName,
    brand,
    currentPrice,
    targetPrice,
    bestStore,
    productUrl,
    imageUrl,
  } = params;

  // Strict field validation
  if (!isValidEmail(email)) {
    console.warn('[Email Service] Rejected confirmation email: invalid recipient email address.');
    return { success: false, error: 'Invalid recipient email address' };
  }
  if (!productName || typeof productName !== 'string' || !productName.trim()) {
    console.warn('[Email Service] Rejected confirmation email: missing product name.');
    return { success: false, error: 'Product name is required' };
  }
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    console.warn('[Email Service] Rejected confirmation email: invalid current price.');
    return { success: false, error: 'Valid current price is required' };
  }
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    console.warn('[Email Service] Rejected confirmation email: invalid target price.');
    return { success: false, error: 'Valid target price is required' };
  }
  if (!bestStore || typeof bestStore !== 'string' || !bestStore.trim() || bestStore.trim() === 'Retail Store') {
    console.warn('[Email Service] Rejected confirmation email: verified retailer name is required.');
    return { success: false, error: 'Verified retailer name is required' };
  }
  if (!isValidHttpUrl(productUrl)) {
    console.warn('[Email Service] Rejected confirmation email: productUrl must be a valid HTTP/HTTPS link.');
    return { success: false, error: 'Valid productUrl is required' };
  }

  const transporter = getGmailTransporter();
  if (!transporter) {
    console.warn('[Email Service] Gmail SMTP credentials not configured. Skipping confirmation email.');
    return { success: false, error: 'Email service credentials not configured' };
  }

  const fromUser = (env.email?.user || process.env.GMAIL_USER || 'noreply@pricewise.io').trim();
  const fromEmail = `PriceWise Alerts <${fromUser}>`;

  const safeUserName = escapeHtml(userName.trim() || 'Shopper');
  const safeProductName = escapeHtml(productName.trim());
  const safeBrand = brand && brand.trim() ? escapeHtml(brand.trim()) : null;
  const safeBestStore = escapeHtml(bestStore.trim());
  const safeProductUrl = escapeHtml(productUrl.trim());
  const safeImageUrl = imageUrl && isValidHttpUrl(imageUrl) ? escapeHtml(imageUrl.trim()) : null;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Price Alert Active - PriceWise</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 30px auto; background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);">
    <!-- Header -->
    <tr>
      <td style="padding: 28px 32px; background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); text-align: center;">
        <table align="center" border="0" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background-color: #ffffff; border-radius: 10px; padding: 6px 12px; font-weight: bold; color: #4f46e5; font-size: 18px; display: inline-block;">
              ⚡
            </td>
            <td style="padding-left: 12px; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
              PriceWise
            </td>
          </tr>
        </table>
        <p style="margin: 8px 0 0 0; color: #e0e7ff; font-size: 13px; font-weight: 500;">Real-Time Price Intelligence & Tracker</p>
      </td>
    </tr>

    <!-- Main Content -->
    <tr>
      <td style="padding: 32px;">
        <div style="background-color: #064e3b; border: 1px solid #059669; border-radius: 10px; padding: 12px 16px; margin-bottom: 24px; text-align: center;">
          <span style="color: #34d399; font-weight: 600; font-size: 14px;">✓ Price Alert Successfully Activated!</span>
        </div>

        <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">
          Hello ${safeUserName},
        </h1>
        <p style="margin: 0 0 24px 0; font-size: 15px; color: #94a3b8; line-height: 1.6;">
          You've set a price alert for <strong style="color: #f8fafc;">${safeProductName}</strong>. PriceWise will continuously monitor prices across ${safeBestStore} and verified stores 24/7.
        </p>

        <!-- Product Card -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; margin-bottom: 24px;">
          <tr>
            ${safeImageUrl ? `
            <td width="110" style="padding: 16px; text-align: center; vertical-align: middle;">
              <img src="${safeImageUrl}" alt="${safeProductName}" width="90" height="90" style="object-fit: contain; border-radius: 8px; background-color: #1e293b; padding: 6px;" />
            </td>
            ` : ''}
            <td style="padding: 16px; vertical-align: middle;">
              ${safeBrand ? `<span style="font-size: 11px; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: 0.5px;">${safeBrand}</span>` : ''}
              <h3 style="margin: 4px 0 10px 0; font-size: 15px; font-weight: 600; color: #f8fafc; line-height: 1.4;">${safeProductName}</h3>
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right: 20px;">
                    <span style="font-size: 11px; color: #94a3b8; display: block;">Current Best Price</span>
                    <strong style="font-size: 16px; color: #f8fafc;">${inr(currentPrice)}</strong>
                    <span style="font-size: 11px; color: #64748b;">(at ${safeBestStore})</span>
                  </td>
                  <td>
                    <span style="font-size: 11px; color: #34d399; display: block; font-weight: 600;">Your Target Price</span>
                    <strong style="font-size: 18px; color: #34d399;">${inr(targetPrice)}</strong>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Info Points -->
        <div style="background-color: #0f172a; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px;">
          <h4 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 600; color: #818cf8; text-transform: uppercase;">What happens next?</h4>
          <ul style="margin: 0; padding-left: 18px; color: #94a3b8; font-size: 13px; line-height: 1.7;">
            <li>We ping store feeds and scrapers multiple times daily.</li>
            <li>The moment the price drops to or below <strong style="color: #34d399;">${inr(targetPrice)}</strong>, you'll receive an instant email.</li>
            <li>No spam guaranteed — alerts trigger only on genuine verified price drops.</li>
          </ul>
        </div>

        <!-- CTA Button -->
        <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 24px auto 8px auto;">
          <tr>
            <td align="center" style="background-color: #4f46e5; border-radius: 10px;">
              <a href="${safeProductUrl}" target="_blank" style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 10px;">
                View Product on PriceWise &rarr;
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 20px 32px; background-color: #090d16; border-top: 1px solid #334155; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
        <p style="margin: 0 0 6px 0;">This email was sent to <span style="color: #94a3b8;">${escapeHtml(email)}</span> because you requested price tracking on PriceWise.</p>
        <p style="margin: 0;">&copy; ${new Date().getFullYear()} PriceWise Intelligence Inc. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const result = await sendWithRetry(transporter, {
    from: fromEmail,
    to: email,
    subject: `🎯 Price Alert Active: ${productName.trim()} (Target: ${inr(targetPrice)})`,
    html: htmlContent,
  });

  if (result.success) {
    console.log(`[Email Service Success] Price alert confirmation sent to ${email}. MessageId: ${result.messageId}`);
  }
  return result;
};

/**
 * Sends a Price Drop / Target Reached notification email
 */
export const sendPriceDropAlertEmail = async (params: PriceDropNotificationParams) => {
  const {
    email,
    userName = 'Shopper',
    productName,
    brand,
    previousPrice,
    currentPrice,
    targetPrice,
    bestStore,
    productUrl,
    imageUrl,
  } = params;

  // Strict field validation
  if (!isValidEmail(email)) {
    console.warn('[Email Service] Rejected price drop email: invalid recipient email address.');
    return { success: false, error: 'Invalid recipient email address' };
  }
  if (!productName || typeof productName !== 'string' || !productName.trim()) {
    console.warn('[Email Service] Rejected price drop email: missing product name.');
    return { success: false, error: 'Product name is required' };
  }
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    console.warn('[Email Service] Rejected price drop email: invalid current price.');
    return { success: false, error: 'Valid current price is required' };
  }
  if (!bestStore || typeof bestStore !== 'string' || !bestStore.trim() || bestStore.trim() === 'Retail Store') {
    console.warn('[Email Service] Rejected price drop email: verified retailer name is required.');
    return { success: false, error: 'Verified retailer name is required' };
  }
  if (!isValidHttpUrl(productUrl)) {
    console.warn('[Email Service] Rejected price drop email: productUrl must be a valid HTTP/HTTPS link.');
    return { success: false, error: 'Valid productUrl is required' };
  }

  const transporter = getGmailTransporter();
  if (!transporter) {
    console.warn('[Email Service] Gmail SMTP credentials not configured. Skipping price drop alert email.');
    return { success: false, error: 'Email service credentials not configured' };
  }

  const fromUser = (env.email?.user || process.env.GMAIL_USER || 'noreply@pricewise.io').trim();
  const fromEmail = `PriceWise Alerts <${fromUser}>`;

  // Real savings calculation — only if verified previousPrice is strictly higher
  const hasVerifiedDrop =
    previousPrice !== null &&
    previousPrice !== undefined &&
    Number.isFinite(previousPrice) &&
    previousPrice > currentPrice;

  const savings = hasVerifiedDrop ? previousPrice - currentPrice : 0;
  const savingsPercent = hasVerifiedDrop ? Math.round((savings / previousPrice) * 100) : null;

  const safeUserName = escapeHtml(userName.trim() || 'Shopper');
  const safeProductName = escapeHtml(productName.trim());
  const safeBrand = brand && brand.trim() ? escapeHtml(brand.trim()) : null;
  const safeBestStore = escapeHtml(bestStore.trim());
  const safeProductUrl = escapeHtml(productUrl.trim());
  const safeImageUrl = imageUrl && isValidHttpUrl(imageUrl) ? escapeHtml(imageUrl.trim()) : null;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Price Drop Alert - PriceWise</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 30px auto; background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);">
    <!-- Header -->
    <tr>
      <td style="padding: 28px 32px; background: linear-gradient(135deg, #059669 0%, #047857 100%); text-align: center;">
        <table align="center" border="0" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background-color: #ffffff; border-radius: 10px; padding: 6px 12px; font-weight: bold; color: #059669; font-size: 18px; display: inline-block;">
              🎉
            </td>
            <td style="padding-left: 12px; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
              Price Drop Alert!
            </td>
          </tr>
        </table>
        <p style="margin: 8px 0 0 0; color: #d1fae5; font-size: 13px; font-weight: 500;">Good news! Your tracked product just got cheaper!</p>
      </td>
    </tr>

    <!-- Main Content -->
    <tr>
      <td style="padding: 32px;">
        <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">
          Great news, ${safeUserName}!
        </h1>
        <p style="margin: 0 0 24px 0; font-size: 15px; color: #94a3b8; line-height: 1.6;">
          The price for <strong style="color: #f8fafc;">${safeProductName}</strong> has just dropped to <strong style="color: #34d399;">${inr(currentPrice)}</strong> at <strong>${safeBestStore}</strong>!
        </p>

        <!-- Price Change Highlight Box -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; margin-bottom: 24px;">
          <tr>
            ${safeImageUrl ? `
            <td width="110" style="padding: 16px; text-align: center; vertical-align: middle;">
              <img src="${safeImageUrl}" alt="${safeProductName}" width="90" height="90" style="object-fit: contain; border-radius: 8px; background-color: #1e293b; padding: 6px;" />
            </td>
            ` : ''}
            <td style="padding: 16px; vertical-align: middle;">
              ${safeBrand ? `<span style="font-size: 11px; font-weight: 700; color: #818cf8; text-transform: uppercase;">${safeBrand}</span>` : ''}
              <h3 style="margin: 4px 0 10px 0; font-size: 15px; font-weight: 600; color: #f8fafc;">${safeProductName}</h3>
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  ${hasVerifiedDrop ? `
                  <td style="padding-right: 20px;">
                    <span style="font-size: 11px; color: #94a3b8; display: block;">Old Price</span>
                    <span style="font-size: 14px; color: #94a3b8; text-decoration: line-through;">${inr(previousPrice!)}</span>
                  </td>
                  ` : ''}
                  <td>
                    <span style="font-size: 11px; color: #34d399; display: block; font-weight: 600;">Current Verified Price</span>
                    <strong style="font-size: 20px; color: #34d399;">${inr(currentPrice)}</strong>
                  </td>
                </tr>
              </table>
              ${hasVerifiedDrop && savings > 0 ? `
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #34d399; font-weight: 600;">
                You save ${inr(savings)}${savingsPercent !== null ? ` (${savingsPercent}% off)` : ''}!
              </p>
              ` : ''}
              ${targetPrice && Number.isFinite(targetPrice) ? `
              <p style="margin: 6px 0 0 0; font-size: 11px; color: #94a3b8;">
                Alert threshold: <span style="color: #f8fafc;">${inr(targetPrice)}</span>
              </p>
              ` : ''}
            </td>
          </tr>
        </table>

        <!-- CTA Button -->
        <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 24px auto 8px auto;">
          <tr>
            <td align="center" style="background-color: #059669; border-radius: 10px;">
              <a href="${safeProductUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px;">
                Grab Deal at ${safeBestStore} &rarr;
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 20px 32px; background-color: #090d16; border-top: 1px solid #334155; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
        <p style="margin: 0 0 6px 0;">Sent to <span style="color: #94a3b8;">${escapeHtml(email)}</span> based on your PriceWise alert subscription.</p>
        <p style="margin: 0;">&copy; ${new Date().getFullYear()} PriceWise Intelligence Inc.</p>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const result = await sendWithRetry(transporter, {
    from: fromEmail,
    to: email,
    subject: `🔥 Price Dropped! ${productName.trim()} is now ${inr(currentPrice)} at ${bestStore.trim()}`,
    html: htmlContent,
  });

  if (result.success) {
    console.log(`[Email Service Success] Price drop notification sent to ${email}. MessageId: ${result.messageId}`);
  }
  return result;
};

export interface RegistrationOtpParams {
  email: string;
  name: string;
  otp: string;
}

/**
 * Sends a 6-digit registration verification code via email
 */
export const sendRegistrationOtpEmail = async (
  params: RegistrationOtpParams,
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  const { email, name, otp } = params;

  if (!isValidEmail(email)) {
    return { success: false, error: 'Invalid recipient email address' };
  }
  if (!otp || !/^\d{6}$/.test(otp.trim())) {
    return { success: false, error: 'Valid 6-digit verification code is required' };
  }

  const transporter = getGmailTransporter();
  if (!transporter) {
    console.warn('[Email Service] Gmail SMTP credentials not configured. Mocking registration OTP email send.');
    return { success: true, messageId: 'mock-otp-message-id' };
  }

  const fromUser = (env.email?.user || process.env.GMAIL_USER || 'noreply@pricewise.io').trim();
  const fromEmail = `PriceWise Security <${fromUser}>`;
  const safeName = escapeHtml(name.trim() || 'Shopper');
  const safeOtp = escapeHtml(otp.trim());

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your PriceWise Account</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 540px; margin: 30px auto; background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);">
    <tr>
      <td style="padding: 28px 32px; background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); text-align: center;">
        <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">⚡ PriceWise</h1>
        <p style="margin: 6px 0 0 0; color: #e0e7ff; font-size: 13px;">Account Email Verification</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px;">
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #f8fafc;">Hello <strong>${safeName}</strong>,</p>
        <p style="margin: 0 0 24px 0; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
          Thank you for creating a PriceWise account. Please enter the verification code below to verify your email address and activate your account:
        </p>
        <div style="background-color: #0f172a; border: 2px dashed #6366f1; border-radius: 12px; padding: 20px; text-align: center; margin: 0 0 24px 0;">
          <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #818cf8; font-family: 'Courier New', Courier, monospace;">${safeOtp}</span>
        </div>
        <p style="margin: 0 0 8px 0; font-size: 13px; color: #94a3b8; text-align: center;">
          This code expires in <strong>10 minutes</strong> and can only be used once.
        </p>
        <p style="margin: 0; font-size: 12px; color: #64748b; text-align: center;">
          If you did not request this verification code, please ignore this email.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 20px 32px; background-color: #090d16; border-top: 1px solid #334155; text-align: center; font-size: 12px; color: #64748b;">
        <p style="margin: 0;">&copy; ${new Date().getFullYear()} PriceWise Intelligence. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendWithRetry(transporter, {
    from: fromEmail,
    to: email,
    subject: `🔐 Your PriceWise Verification Code: ${otp}`,
    html: htmlContent,
  });
};


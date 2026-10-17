import nodemailer from 'nodemailer';
import { env } from '../config/env';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

// Create Gmail transporter with credentials
const getGmailTransporter = () => {
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

export interface AlertConfirmationParams {
  email: string;
  userName?: string;
  productName: string;
  brand?: string;
  currentPrice: number;
  targetPrice: number;
  bestStore?: string;
  productUrl?: string;
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
  bestStore?: string;
  productUrl?: string;
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
    brand = 'Smartphone',
    currentPrice,
    targetPrice,
    bestStore = 'Retail Store',
    productUrl = 'http://localhost:5173',
    imageUrl,
  } = params;

  const transporter = getGmailTransporter();
  if (!transporter) {
    console.warn('[Email Service] Gmail SMTP credentials not configured. Skipping confirmation email.');
    return { success: false, error: 'Email service credentials not configured' };
  }
  const fromUser = (env.email?.user || process.env.GMAIL_USER || 'noreply@pricewise.io').trim();
  const fromEmail = `PriceWise Alerts <${fromUser}>`;

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
          Hello ${userName},
        </h1>
        <p style="margin: 0 0 24px 0; font-size: 15px; color: #94a3b8; line-height: 1.6;">
          You've set a price alert for <strong style="color: #f8fafc;">${productName}</strong>. PriceWise will continuously monitor prices across Amazon, Flipkart, Croma, and other stores 24/7.
        </p>

        <!-- Product Card -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; margin-bottom: 24px;">
          <tr>
            ${imageUrl ? `
            <td width="110" style="padding: 16px; text-align: center; vertical-align: middle;">
              <img src="${imageUrl}" alt="${productName}" width="90" height="90" style="object-fit: contain; border-radius: 8px; background-color: #1e293b; padding: 6px;" />
            </td>
            ` : ''}
            <td style="padding: 16px; vertical-align: middle;">
              <span style="font-size: 11px; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: 0.5px;">${brand}</span>
              <h3 style="margin: 4px 0 10px 0; font-size: 15px; font-weight: 600; color: #f8fafc; line-height: 1.4;">${productName}</h3>
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right: 20px;">
                    <span style="font-size: 11px; color: #94a3b8; display: block;">Current Best Price</span>
                    <strong style="font-size: 16px; color: #f8fafc;">${inr(currentPrice)}</strong>
                    <span style="font-size: 11px; color: #64748b;">(at ${bestStore})</span>
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
            <li>The exact minute the price drops to or below <strong style="color: #34d399;">${inr(targetPrice)}</strong>, you'll receive an instant email.</li>
            <li>No spam guaranteed — alerts trigger only on genuine deals.</li>
          </ul>
        </div>

        <!-- CTA Button -->
        <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 24px auto 8px auto;">
          <tr>
            <td align="center" style="background-color: #4f46e5; border-radius: 10px;">
              <a href="${productUrl}" target="_blank" style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 10px;">
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
        <p style="margin: 0 0 6px 0;">This email was sent to <span style="color: #94a3b8;">${email}</span> because you requested price tracking on PriceWise.</p>
        <p style="margin: 0;">&copy; ${new Date().getFullYear()} PriceWise Intelligence Inc. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: email,
      subject: `🎯 Price Alert Active: ${productName} (Target: ${inr(targetPrice)})`,
      html: htmlContent,
    });
    console.log(`[Email Service Success] Price alert confirmation sent to ${email}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.error(`[Email Service Exception] Failed to send price alert to ${email}:`, err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
};

/**
 * Sends a Price Drop / Target Reached notification email
 */
export const sendPriceDropAlertEmail = async (params: PriceDropNotificationParams) => {
  const {
    email,
    userName = 'Shopper',
    productName,
    brand = 'Smartphone',
    previousPrice,
    currentPrice,
    targetPrice,
    bestStore = 'Retail Store',
    productUrl = 'http://localhost:5173',
    imageUrl,
  } = params;

  const transporter = getGmailTransporter();
  if (!transporter) {
    console.warn('[Email Service] Gmail SMTP credentials not configured. Skipping price drop alert email.');
    return { success: false, error: 'Email service credentials not configured' };
  }
  const fromUser = (env.email?.user || process.env.GMAIL_USER || 'noreply@pricewise.io').trim();
  const fromEmail = `PriceWise Alerts <${fromUser}>`;
  const savings = previousPrice && previousPrice > currentPrice ? previousPrice - currentPrice : 0;

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
        <p style="margin: 8px 0 0 0; color: #d1fae5; font-size: 13px; font-weight: 500;">Good news! Your tracked smartphone just got cheaper!</p>
      </td>
    </tr>

    <!-- Main Content -->
    <tr>
      <td style="padding: 32px;">
        <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">
          Great news, ${userName}!
        </h1>
        <p style="margin: 0 0 24px 0; font-size: 15px; color: #94a3b8; line-height: 1.6;">
          The price for <strong style="color: #f8fafc;">${productName}</strong> has just dropped to <strong style="color: #34d399;">${inr(currentPrice)}</strong> at <strong>${bestStore}</strong>!
        </p>

        <!-- Price Change Highlight Box -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; margin-bottom: 24px;">
          <tr>
            ${imageUrl ? `
            <td width="110" style="padding: 16px; text-align: center; vertical-align: middle;">
              <img src="${imageUrl}" alt="${productName}" width="90" height="90" style="object-fit: contain; border-radius: 8px; background-color: #1e293b; padding: 6px;" />
            </td>
            ` : ''}
            <td style="padding: 16px; vertical-align: middle;">
              <span style="font-size: 11px; font-weight: 700; color: #818cf8; text-transform: uppercase;">${brand}</span>
              <h3 style="margin: 4px 0 10px 0; font-size: 15px; font-weight: 600; color: #f8fafc;">${productName}</h3>
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  ${previousPrice ? `
                  <td style="padding-right: 20px;">
                    <span style="font-size: 11px; color: #94a3b8; display: block;">Old Price</span>
                    <span style="font-size: 14px; color: #94a3b8; text-decoration: line-through;">${inr(previousPrice)}</span>
                  </td>
                  ` : ''}
                  <td>
                    <span style="font-size: 11px; color: #34d399; display: block; font-weight: 600;">New Deal Price</span>
                    <strong style="font-size: 20px; color: #34d399;">${inr(currentPrice)}</strong>
                  </td>
                </tr>
              </table>
              ${savings > 0 ? `
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #34d399; font-weight: 600;">
                You save ${inr(savings)}!
              </p>
              ` : ''}
            </td>
          </tr>
        </table>

        <!-- CTA Button -->
        <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 24px auto 8px auto;">
          <tr>
            <td align="center" style="background-color: #059669; border-radius: 10px;">
              <a href="${productUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px;">
                Grab Deal at ${bestStore} &rarr;
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 20px 32px; background-color: #090d16; border-top: 1px solid #334155; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
        <p style="margin: 0 0 6px 0;">Sent to <span style="color: #94a3b8;">${email}</span> based on your PriceWise alert subscription.</p>
        <p style="margin: 0;">&copy; ${new Date().getFullYear()} PriceWise Intelligence Inc.</p>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: email,
      subject: `🔥 Price Dropped! ${productName} is now ${inr(currentPrice)} at ${bestStore}`,
      html: htmlContent,
    });
    console.log(`[Email Service Success] Price drop notification sent to ${email}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.error(`[Email Service Exception] Failed to send price drop notification to ${email}:`, err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
};

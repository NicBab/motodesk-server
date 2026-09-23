//************************************************************** */

export interface PasswordResetTemplateInput {
  firstName: string;

  resetUrl: string;

  expiresInMinutes: number;
}

//************************************************************** */

export interface PasswordResetEmailTemplate {
  subject: string;

  html: string;

  text: string;
}

//************************************************************** */

function escapeHtml(
  value: string,
): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

//************************************************************** */

export function buildPasswordResetTemplate(
  input: PasswordResetTemplateInput,
): PasswordResetEmailTemplate {
  const firstName =
    escapeHtml(
      input.firstName.trim() ||
        "there",
    );

  const resetUrl =
    escapeHtml(
      input.resetUrl,
    );

  const subject =
    "Reset your MotoDesk password";

  //************************************************************** */

  const text = [
    `Hi ${input.firstName.trim() || "there"},`,
    "",
    "We received a request to reset your MotoDesk password.",
    "",
    "Reset your password using the link below:",
    "",
    input.resetUrl,
    "",
    `This link expires in ${input.expiresInMinutes} minutes.`,
    "",
    "If you did not request a password reset, you can ignore this email. Your password will remain unchanged.",
    "",
    "MotoDesk",
  ].join("\n");

  //************************************************************** */

  const html = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${subject}</title>
  </head>

  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      border="0"
      style="width:100%;background:#f4f4f5;padding:32px 16px;"
    >
      <tr>
        <td align="center">
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            border="0"
            style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden;"
          >
            <tr>
              <td style="padding:28px 32px 20px 32px;border-bottom:1px solid #f4f4f5;">
                <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#18181b;">
                  Moto<span style="color:#f97316;">Desk</span>
                </div>

                <div style="margin-top:5px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#a1a1aa;">
                  Dealership Operations Platform
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:32px;">
                <div style="font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#f97316;">
                  Account security
                </div>

                <h1 style="margin:8px 0 14px 0;font-size:24px;line-height:32px;color:#18181b;">
                  Reset your password
                </h1>

                <p style="margin:0 0 22px 0;font-size:15px;line-height:24px;color:#52525b;">
                  Hi ${firstName}, we received a request to reset the password for your MotoDesk account.
                </p>

                <table
                  role="presentation"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                  style="margin:26px 0;"
                >
                  <tr>
                    <td
                      align="center"
                      bgcolor="#f97316"
                      style="border-radius:8px;"
                    >
                      <a
                        href="${resetUrl}"
                        style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;"
                      >
                        Reset password
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0;font-size:13px;line-height:21px;color:#71717a;">
                  This password-reset link expires in
                  <strong style="color:#3f3f46;">
                    ${input.expiresInMinutes} minutes
                  </strong>.
                </p>

                <p style="margin:20px 0 0 0;font-size:13px;line-height:21px;color:#71717a;">
                  If you did not request a password reset, you can safely ignore this email. Your current password will remain unchanged.
                </p>

                <p style="margin:24px 0 8px 0;font-size:11px;line-height:18px;color:#a1a1aa;">
                  If the button does not work, copy and paste this address into your browser:
                </p>

                <p style="margin:0;word-break:break-all;font-size:11px;line-height:18px;color:#71717a;">
                  ${resetUrl}
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #f4f4f5;">
                <p style="margin:0;font-size:11px;line-height:18px;color:#a1a1aa;">
                  This is an automated security message from MotoDesk.
                  MotoDesk will never ask you to send your password by email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();

  return {
    subject,
    html,
    text,
  };
}

//************************************************************** */
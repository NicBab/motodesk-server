//************************************************************** */

export interface EmailVerificationTemplateInput {
  firstName: string;

  verificationCode: string;

  expiresInMinutes: number;
}

//************************************************************** */

export interface EmailTemplate {
  subject: string;

  html: string;

  text: string;
}

//************************************************************** */

function escapeHtml(
  value: string,
): string {
  return value
    .replaceAll(
      "&",
      "&amp;",
    )
    .replaceAll(
      "<",
      "&lt;",
    )
    .replaceAll(
      ">",
      "&gt;",
    )
    .replaceAll(
      '"',
      "&quot;",
    )
    .replaceAll(
      "'",
      "&#039;",
    );
}

//************************************************************** */

export function buildEmailVerificationTemplate(
  input: EmailVerificationTemplateInput,
): EmailTemplate {
  const firstName =
    escapeHtml(
      input.firstName.trim() ||
        "there",
    );

  const verificationCode =
    escapeHtml(
      input.verificationCode,
    );

  const subject =
    "Verify your MotoDesk email";

  //************************************************************** */

  const text = [
    `Hi ${input.firstName.trim() || "there"},`,
    "",
    "Welcome to MotoDesk.",
    "",
    "Your email verification code is:",
    "",
    input.verificationCode,
    "",
    `This code expires in ${input.expiresInMinutes} minutes.`,
    "",
    "If you did not create a MotoDesk account, you can ignore this email.",
    "",
    "MotoDesk",
  ].join(
    "\n",
  );

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
                  Email verification
                </div>

                <h1 style="margin:8px 0 14px 0;font-size:24px;line-height:32px;color:#18181b;">
                  Verify your email address
                </h1>

                <p style="margin:0 0 22px 0;font-size:15px;line-height:24px;color:#52525b;">
                  Hi ${firstName}, enter the verification code below to finish securing your MotoDesk account.
                </p>

                <div
                  style="margin:24px 0;padding:22px 16px;border:1px solid #fed7aa;border-radius:12px;background:#fff7ed;text-align:center;"
                >
                  <div style="margin-bottom:8px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9a3412;">
                    Verification code
                  </div>

                  <div
                    style="font-family:'Courier New',Courier,monospace;font-size:34px;line-height:42px;font-weight:800;letter-spacing:8px;color:#18181b;"
                  >
                    ${verificationCode}
                  </div>
                </div>

                <p style="margin:0;font-size:13px;line-height:21px;color:#71717a;">
                  This code expires in
                  <strong style="color:#3f3f46;">
                    ${input.expiresInMinutes} minutes
                  </strong>.
                </p>

                <p style="margin:20px 0 0 0;font-size:13px;line-height:21px;color:#71717a;">
                  If you did not create a MotoDesk account, you can safely ignore this email.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #f4f4f5;">
                <p style="margin:0;font-size:11px;line-height:18px;color:#a1a1aa;">
                  This is an automated security message from MotoDesk.
                  Never share your verification code with anyone.
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

  //************************************************************** */

  return {
    subject,
    html,
    text,
  };
}

//************************************************************** */
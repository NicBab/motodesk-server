import {
  ResendEmailProvider,
} from "./providers/resend.provider.js";

import type {
  SendEmailInput,
  SendEmailResult,
} from "./email.types.js";

//************************************************************** */

const emailProvider =
  new ResendEmailProvider();

//************************************************************** */

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  return emailProvider.send(
    input,
  );
}

//************************************************************** */
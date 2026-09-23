//************************************************************** */

export interface SendEmailInput {
  to: string;

  subject: string;

  html: string;

  text: string;

  replyTo?: string;
}

//************************************************************** */

export interface SendEmailResult {
  messageId: string;
}

//************************************************************** */

export interface EmailProvider {
  send(
    input: SendEmailInput,
  ): Promise<SendEmailResult>;
}

//************************************************************** */
export interface InteractiveOption {
  id: string;
  title: string;
  description?: string;
}

export interface IWhatsAppProvider {
  sendText(to: string, body: string): Promise<void>;
  sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    params: string[],
  ): Promise<void>;
  // Sends a real tappable button/list message where the platform supports it.
  // `listButtonLabel` is only used when >3 options force a list-picker
  // (WhatsApp quick-reply buttons max out at 3).
  sendInteractive(
    to: string,
    body: string,
    options: InteractiveOption[],
    listButtonLabel?: string,
  ): Promise<void>;
}

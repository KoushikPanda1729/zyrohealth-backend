import { injectable } from 'tsyringe';
import {
  IWhatsAppProvider,
  InteractiveOption,
} from './whatsapp.provider.interface';

@injectable()
export class DevWhatsAppProvider implements IWhatsAppProvider {
  sendText(to: string, body: string): Promise<void> {
    console.log(`[DEV WHATSAPP] to=${to} body=${body}`);
    return Promise.resolve();
  }

  sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    params: string[],
  ): Promise<void> {
    console.log(
      `[DEV WHATSAPP] to=${to} template=${templateName} lang=${languageCode} params=${JSON.stringify(params)}`,
    );
    return Promise.resolve();
  }

  sendInteractive(
    to: string,
    body: string,
    options: InteractiveOption[],
    listButtonLabel?: string,
  ): Promise<void> {
    console.log(
      `[DEV WHATSAPP] to=${to} interactive body="${body}" button="${listButtonLabel}" options=${JSON.stringify(options)}`,
    );
    return Promise.resolve();
  }
}

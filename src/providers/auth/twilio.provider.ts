import { injectable } from 'tsyringe';
import twilio from 'twilio';
import * as jwt from 'jsonwebtoken';
import { IAuthProvider, DecodedToken } from './auth.provider.interface';
import { env } from '../../config/env';
import { AppError } from '../../utils/app-error';
import { generateAndStoreOtp } from '../../utils/otp.util';

@injectable()
export class TwilioAuthProvider implements IAuthProvider {
  private readonly client: ReturnType<typeof twilio>;

  constructor() {
    this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  async sendOtp(phone: string): Promise<void> {
    const code = await generateAndStoreOtp(phone);

    await this.client.messages.create({
      body: `${code} is your ZyroHealth verification code. Valid for 10 minutes. Do not share this with anyone.`,
      from: env.TWILIO_FROM_NUMBER,
      to: phone,
    });
  }

  verifyToken(token: string): Promise<DecodedToken> {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as {
        uid: string;
        phone: string;
      };
      return Promise.resolve({ uid: payload.uid, phone: payload.phone });
    } catch {
      throw AppError.unauthorized();
    }
  }
}

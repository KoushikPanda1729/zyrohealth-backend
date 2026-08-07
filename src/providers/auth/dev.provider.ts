import { injectable } from 'tsyringe';
import * as jwt from 'jsonwebtoken';
import { IAuthProvider, DecodedToken } from './auth.provider.interface';
import { AppDataSource } from '../../config/database';
import { OtpCode } from '../../entities/OtpCode';
import { env } from '../../config/env';
import { AppError } from '../../utils/app-error';

const DEV_OTP = '123456';

@injectable()
export class DevAuthProvider implements IAuthProvider {
  async sendOtp(phone: string): Promise<void> {
    const repo = AppDataSource.getRepository(OtpCode);
    await repo.delete({ phoneNumber: phone, verified: false });

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour in dev
    const otp = repo.create({ phoneNumber: phone, code: DEV_OTP, expiresAt });
    await repo.save(otp);

    console.log(`[DEV] OTP for ${phone}: ${DEV_OTP}`);
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

import { AppDataSource } from '../config/database';
import { OtpCode } from '../entities/OtpCode';

export async function generateAndStoreOtp(
  phone: string,
  expiryMinutes = 10,
): Promise<string> {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  const repo = AppDataSource.getRepository(OtpCode);
  await repo.delete({ phoneNumber: phone, verified: false });

  const otp = repo.create({ phoneNumber: phone, code, expiresAt });
  await repo.save(otp);

  return code;
}

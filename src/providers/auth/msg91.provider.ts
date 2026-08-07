import { injectable } from 'tsyringe';
import { IAuthProvider, DecodedToken } from './auth.provider.interface';

@injectable()
export class Msg91AuthProvider implements IAuthProvider {
  sendOtp(_phone: string): Promise<void> {
    throw new Error('Msg91AuthProvider not implemented');
  }

  verifyToken(_idToken: string): Promise<DecodedToken> {
    throw new Error('Msg91AuthProvider not implemented');
  }
}

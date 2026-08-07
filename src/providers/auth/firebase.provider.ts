import { injectable } from 'tsyringe';
import { IAuthProvider, DecodedToken } from './auth.provider.interface';

@injectable()
export class FirebaseAuthProvider implements IAuthProvider {
  sendOtp(_phone: string): Promise<void> {
    throw new Error('FirebaseAuthProvider not in use');
  }

  verifyToken(_idToken: string): Promise<DecodedToken> {
    throw new Error('FirebaseAuthProvider not in use');
  }
}

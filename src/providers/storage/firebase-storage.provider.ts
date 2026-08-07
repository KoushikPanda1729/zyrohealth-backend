import { injectable } from 'tsyringe';
import { IStorageProvider } from './storage.provider.interface';

// TODO: Implement Firebase Storage provider
@injectable()
export class FirebaseStorageProvider implements IStorageProvider {
  upload(_key: string, _buffer: Buffer, _mimeType: string): Promise<string> {
    throw new Error('FirebaseStorageProvider not implemented');
  }

  delete(_key: string): Promise<void> {
    throw new Error('FirebaseStorageProvider not implemented');
  }

  getSignedUrl(_key: string, _expiresIn: number): Promise<string> {
    throw new Error('FirebaseStorageProvider not implemented');
  }
}

import { injectable } from 'tsyringe';
import AWS from 'aws-sdk';
import { IStorageProvider } from './storage.provider.interface';
import { env } from '../../config/env';

@injectable()
export class S3StorageProvider implements IStorageProvider {
  private readonly s3: AWS.S3;
  private readonly bucket: string;

  constructor() {
    this.s3 = new AWS.S3({
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
      region: env.STORAGE_REGION,
    });
    this.bucket = env.STORAGE_BUCKET_NAME;
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    await this.s3
      .upload({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
      .promise();
    return `https://${this.bucket}.s3.${env.STORAGE_REGION}.amazonaws.com/${key}`;
  }

  async delete(key: string): Promise<void> {
    await this.s3
      .deleteObject({
        Bucket: this.bucket,
        Key: key,
      })
      .promise();
  }

  async getSignedUrl(key: string, expiresIn: number): Promise<string> {
    return this.s3.getSignedUrlPromise('getObject', {
      Bucket: this.bucket,
      Key: key,
      Expires: expiresIn,
    });
  }
}

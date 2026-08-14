import { Request, Response, NextFunction } from 'express';
import { injectable, inject } from 'tsyringe';
import { PatientFlowService } from './patient-flow.service';
import { success } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { IStorageProvider } from '../../providers/storage/storage.provider.interface';
import { STORAGE_PROVIDER } from '../../config/container';
import { mediaStorageKey } from '../whatsapp/whatsapp-media.util';

@injectable()
export class PatientFlowController {
  constructor(
    private readonly patientFlowService: PatientFlowService,
    @inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  reply = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      if (!req.user.tenantId) {
        throw AppError.badRequest('No tenant associated with this account');
      }
      const { text, media } = req.body as {
        text?: string;
        media?: { url: string; mimeType: string };
      };
      const result = await this.patientFlowService.reply(
        req.user.id,
        req.user.tenantId,
        text ?? '',
        media,
      );
      res.status(200).json(success(result));
    } catch (err) {
      next(err);
    }
  };

  history = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      if (!req.user.tenantId) {
        throw AppError.badRequest('No tenant associated with this account');
      }
      const result = await this.patientFlowService.history(req.user.id, req.user.tenantId);
      // The stored mediaUrl is the permanent (unsigned) upload() URL — the
      // bucket is private on purpose (these are prescription photos), so
      // it 403s if handed straight to the app. Sign it fresh on every read
      // instead of ever making patient documents public.
      const messages = await Promise.all(
        result.messages.map(async (message) => {
          if (!message.mediaUrl) return message;
          try {
            const key = decodeURIComponent(new URL(message.mediaUrl).pathname.replace(/^\//, ''));
            const signedUrl = await this.storage.getSignedUrl(key, 3600);
            return { ...message, mediaUrl: signedUrl };
          } catch {
            return message;
          }
        }),
      );
      res.status(200).json(success({ ...result, messages }));
    } catch (err) {
      next(err);
    }
  };

  quoteReceipt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      if (!req.user.tenantId) {
        throw AppError.badRequest('No tenant associated with this account');
      }
      const requestId = req.params['requestId'] as string;
      const quoteId = req.params['quoteId'] as string;
      const url = await this.patientFlowService.getQuoteReceiptUrl(
        req.user.id,
        req.user.tenantId,
        requestId,
        quoteId,
      );
      res.status(200).json(success({ url }));
    } catch (err) {
      next(err);
    }
  };

  // Uploads the raw file bytes to real storage first (same
  // IStorageProvider.upload pattern as doctor-documents) and hands back a
  // durable URL — the app calls this before /reply so upload_prescription
  // receives a real hosted URL, same shape WhatsApp's media pipeline
  // produces after downloading from Twilio/Meta.
  upload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const file = req.file;
      if (!file) throw AppError.badRequest('No file uploaded');
      const key = mediaStorageKey(req.user.tenantId ?? 'unknown', file.mimetype);
      const url = await this.storage.upload(key, file.buffer, file.mimetype);
      res.status(200).json(success({ url, mimeType: file.mimetype }));
    } catch (err) {
      next(err);
    }
  };
}

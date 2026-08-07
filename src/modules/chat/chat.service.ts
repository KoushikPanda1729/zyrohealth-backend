import { injectable, inject } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import { ChatMessage, MessageType } from '../../entities/ChatMessage';
import { Booking } from '../../entities/Booking';
import { AppError } from '../../utils/app-error';
import { SendMessageDtoType } from './chat.dto';
import { IStorageProvider } from '../../providers/storage/storage.provider.interface';
import { STORAGE_PROVIDER } from '../../config/container';

@injectable()
export class ChatService {
  constructor(
    @inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}
  async getMessages(
    bookingId: string,
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ data: ChatMessage[]; total: number }> {
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: bookingId },
    });
    if (!booking) throw AppError.notFound('Booking');
    if (booking.patientId !== userId && booking.doctorId !== userId) {
      throw AppError.forbidden();
    }

    const [data, total] = await AppDataSource.getRepository(
      ChatMessage,
    ).findAndCount({
      where: { bookingId },
      order: { sentAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['sender'],
    });

    // Replace S3 direct URLs with presigned URLs so private-bucket files are accessible
    const signed = await Promise.all(
      data.map(async (msg) => {
        if (msg.fileUrl?.includes('.amazonaws.com/')) {
          const key = msg.fileUrl.split('.amazonaws.com/')[1];
          if (key) {
            try {
              const presigned = await this.storage.getSignedUrl(key, 24 * 3600);
              return { ...msg, fileUrl: presigned };
            } catch {
              /* fall through — return original */
            }
          }
        }
        return msg;
      }),
    );

    return { data: signed, total };
  }

  async sendMessage(
    bookingId: string,
    senderId: string,
    senderRole: string,
    dto: SendMessageDtoType,
  ): Promise<ChatMessage> {
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: bookingId },
    });
    if (!booking) throw AppError.notFound('Booking');
    if (booking.patientId !== senderId && booking.doctorId !== senderId) {
      throw AppError.forbidden();
    }

    if (dto.type === 'prescription' && senderRole !== 'doctor') {
      throw AppError.forbidden();
    }

    const msg = AppDataSource.getRepository(ChatMessage).create({
      bookingId,
      senderId,
      type: dto.type as MessageType,
      content: dto.content,
      fileUrl: dto.fileUrl,
    });

    return AppDataSource.getRepository(ChatMessage).save(msg);
  }

  async markAsRead(bookingId: string, userId: string): Promise<void> {
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: bookingId },
    });
    if (!booking) throw AppError.notFound('Booking');
    if (booking.patientId !== userId && booking.doctorId !== userId) {
      throw AppError.forbidden();
    }

    await AppDataSource.getRepository(ChatMessage)
      .createQueryBuilder()
      .update(ChatMessage)
      .set({ isRead: true })
      .where(
        'booking_id = :bookingId AND sender_id != :userId AND is_read = false',
        {
          bookingId,
          userId,
        },
      )
      .execute();
  }

  async uploadFile(
    bookingId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: bookingId },
    });
    if (!booking) throw AppError.notFound('Booking');
    if (booking.patientId !== userId && booking.doctorId !== userId) {
      throw AppError.forbidden();
    }

    const ext = file.originalname.split('.').pop() ?? 'bin';
    const key = `chat/${bookingId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    return this.storage.upload(key, file.buffer, file.mimetype);
  }

  async saveMessage(
    bookingId: string,
    senderId: string,
    type: MessageType,
    content: string,
    fileUrl?: string,
  ): Promise<ChatMessage> {
    const msg = AppDataSource.getRepository(ChatMessage).create({
      bookingId,
      senderId,
      type,
      content,
      fileUrl,
    });
    const saved = await AppDataSource.getRepository(ChatMessage).save(msg);

    // Sign the URL before emitting via socket so image shows immediately
    if (saved.fileUrl?.includes('.amazonaws.com/')) {
      const key = saved.fileUrl.split('.amazonaws.com/')[1];
      if (key) {
        try {
          const presigned = await this.storage.getSignedUrl(key, 24 * 3600);
          return { ...saved, fileUrl: presigned };
        } catch {
          /* return original on error */
        }
      }
    }
    return saved;
  }
}

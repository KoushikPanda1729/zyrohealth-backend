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

  // Every entry point (REST and the Socket.IO gateway alike) must confirm
  // the caller is actually a participant on this booking before they can
  // read, send, upload into, or even just JOIN that booking's chat room —
  // otherwise any authenticated user could listen in on or post into a
  // booking that isn't theirs.
  async assertParticipant(bookingId: string, userId: string): Promise<Booking> {
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: bookingId },
    });
    if (!booking) throw AppError.notFound('Booking');
    if (booking.patientId !== userId && booking.doctorId !== userId) {
      throw AppError.forbidden();
    }
    return booking;
  }

  async getMessages(
    bookingId: string,
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ data: ChatMessage[]; total: number }> {
    await this.assertParticipant(bookingId, userId);

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
    await this.assertParticipant(bookingId, senderId);

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
    await this.assertParticipant(bookingId, userId);

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
    await this.assertParticipant(bookingId, userId);

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

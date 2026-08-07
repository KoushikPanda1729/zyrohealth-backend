import { injectable, inject } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import { AiSession, AiMessage } from '../../entities/AiSession';
import { AiDoctor } from '../../entities/AiDoctor';
import { PatientProfile } from '../../entities/PatientProfile';
import {
  PatientHistory,
  HistoryEntryType,
} from '../../entities/PatientHistory';
import {
  IAiProvider,
  PatientContext,
  HistoryEntry,
} from '../../providers/ai/ai.provider.interface';
import { IStorageProvider } from '../../providers/storage/storage.provider.interface';
import { AI_PROVIDER, STORAGE_PROVIDER } from '../../config/container';
import { AppError } from '../../utils/app-error';
import { buildSystemPrompt } from './ai.system-prompt';

@injectable()
export class AiService {
  constructor(
    @inject(AI_PROVIDER) private readonly aiProvider: IAiProvider,
    @inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  async listAiDoctors(): Promise<AiDoctor[]> {
    return AppDataSource.getRepository(AiDoctor).find({
      where: { isActive: true },
      select: ['id', 'name', 'specialty', 'description', 'avatarUrl'],
      order: { createdAt: 'ASC' },
    });
  }

  async createSession(userId: string, aiDoctorId?: string): Promise<AiSession> {
    if (aiDoctorId) {
      const doctor = await AppDataSource.getRepository(AiDoctor).findOne({
        where: { id: aiDoctorId, isActive: true },
      });
      if (!doctor) throw AppError.notFound('AI Doctor');
    }
    const session = AppDataSource.getRepository(AiSession).create({
      userId,
      aiDoctorId,
      messages: [],
      detectedSymptoms: [],
      referToDoctor: false,
      isClosed: false,
    });
    return AppDataSource.getRepository(AiSession).save(session);
  }

  async sendMessage(
    sessionId: string,
    userId: string,
    message: string,
    imageFile?: Express.Multer.File,
  ): Promise<AiSession> {
    const sessionRepo = AppDataSource.getRepository(AiSession);
    const session = await sessionRepo.findOne({
      where: { id: sessionId, userId },
    });
    if (!session) throw AppError.notFound('AI session');
    if (session.isClosed) throw AppError.unprocessable('Session is closed');

    const patientProfile = await AppDataSource.getRepository(
      PatientProfile,
    ).findOne({
      where: { userId },
    });

    const recentHistory = await AppDataSource.getRepository(
      PatientHistory,
    ).find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const patientContext: PatientContext = {
      bloodGroup: patientProfile?.bloodGroup ?? 'Unknown',
      allergies: patientProfile?.allergies ?? [],
      chronicConditions: patientProfile?.chronicConditions ?? [],
      history: recentHistory.map<HistoryEntry>((h) => ({
        entryType: h.entryType,
        summary: h.summary,
        detectedSymptoms: h.detectedSymptoms,
        createdAt: h.createdAt.toISOString(),
      })),
    };

    let systemPrompt: string;
    if (session.aiDoctorId) {
      const aiDoctor = await AppDataSource.getRepository(AiDoctor).findOne({
        where: { id: session.aiDoctorId },
      });
      systemPrompt =
        aiDoctor?.systemPrompt ?? buildSystemPrompt(patientContext);
    } else {
      systemPrompt = buildSystemPrompt(patientContext);
    }

    // Upload image to S3 and prepare base64 for vision analysis
    let imageUrl: string | undefined;
    let imageBase64: string | undefined;
    let imageMimeType: string | undefined;

    if (imageFile) {
      try {
        const key = `ai-chat/${userId}/${sessionId}/${Date.now()}-${imageFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        imageUrl = await this.storage.upload(
          key,
          imageFile.buffer,
          imageFile.mimetype,
        );
      } catch (err) {
        console.error(
          '[AI] Image S3 upload failed, proceeding without stored URL',
          err,
        );
      }
      imageBase64 = imageFile.buffer.toString('base64');
      imageMimeType = imageFile.mimetype;
    }

    const userMessage: AiMessage = {
      role: 'user',
      content: message || 'Please analyze this image.',
      timestamp: new Date().toISOString(),
      imageUrl,
    };

    const updatedMessages = [...session.messages, userMessage];

    const result = await this.aiProvider.chat({
      messages: updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      systemPrompt,
      patientContext,
      sessionId,
      imageBase64,
      imageMimeType,
    });

    const assistantMessage: AiMessage = {
      role: 'assistant',
      content: result.reply,
      timestamp: new Date().toISOString(),
      imageUrl: result.imageUrl,
    };

    session.messages = [...updatedMessages, assistantMessage];
    session.detectedSymptoms = result.structured.detectedSymptoms;
    session.severityScore = result.structured.severityScore;
    session.suggestedSpecialty = result.structured.suggestedSpecialty;
    session.referToDoctor = result.structured.referToDoctor;

    // Auto-title from the first user message
    if (!session.title) {
      session.title = message.slice(0, 60);
    }

    const saved = await sessionRepo.save(session);
    return this.hydrateImageUrls(saved);
  }

  private async hydrateImageUrls(session: AiSession): Promise<AiSession> {
    const s3Pattern = /\.s3\.[^.]+\.amazonaws\.com\//;
    const messages = await Promise.all(
      session.messages.map(async (msg) => {
        if (msg.imageUrl && s3Pattern.test(msg.imageUrl)) {
          try {
            const key = new URL(msg.imageUrl).pathname.slice(1);
            const signedUrl = await this.storage.getSignedUrl(key, 3600);
            return { ...msg, imageUrl: signedUrl };
          } catch {
            return msg;
          }
        }
        return msg;
      }),
    );
    return { ...session, messages };
  }

  async getSession(sessionId: string, userId: string): Promise<AiSession> {
    const session = await AppDataSource.getRepository(AiSession).findOne({
      where: { id: sessionId, userId },
    });
    if (!session) throw AppError.notFound('AI session');
    return this.hydrateImageUrls(session);
  }

  async listSessions(userId: string): Promise<AiSession[]> {
    return AppDataSource.getRepository(AiSession).find({
      where: { userId },
      order: { createdAt: 'DESC' },
      select: [
        'id',
        'createdAt',
        'updatedAt',
        'isClosed',
        'title',
        'messages',
        'detectedSymptoms',
        'severityScore',
        'suggestedSpecialty',
        'referToDoctor',
      ],
    });
  }

  async renameSession(
    sessionId: string,
    userId: string,
    title: string,
  ): Promise<AiSession> {
    const repo = AppDataSource.getRepository(AiSession);
    const session = await repo.findOne({ where: { id: sessionId, userId } });
    if (!session) throw AppError.notFound('AI session');
    session.title = title.trim().slice(0, 100);
    return repo.save(session);
  }

  async deleteSession(sessionId: string, userId: string): Promise<void> {
    const repo = AppDataSource.getRepository(AiSession);
    const session = await repo.findOne({ where: { id: sessionId, userId } });
    if (!session) throw AppError.notFound('AI session');
    await repo.remove(session);
  }

  async closeSession(sessionId: string, userId: string): Promise<AiSession> {
    const sessionRepo = AppDataSource.getRepository(AiSession);
    const session = await sessionRepo.findOne({
      where: { id: sessionId, userId },
    });
    if (!session) throw AppError.notFound('AI session');
    if (session.isClosed)
      throw AppError.unprocessable('Session already closed');

    const summaryMessages = session.messages.slice(-6);
    const summaryText = summaryMessages
      .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n');

    session.isClosed = true;
    session.closedAt = new Date();
    session.aiSummary =
      `Symptoms discussed: ${session.detectedSymptoms.join(', ') || 'None detected'}. ` +
      `Severity: ${session.severityScore ?? 'N/A'}/10. ` +
      `Suggested specialty: ${session.suggestedSpecialty ?? 'General Practice'}. ` +
      `Referral recommended: ${session.referToDoctor ? 'Yes' : 'No'}. ` +
      `Conversation summary: ${summaryText.slice(0, 500)}`;

    const saved = await sessionRepo.save(session);

    const history = AppDataSource.getRepository(PatientHistory).create({
      userId,
      entryType: HistoryEntryType.AI_CHAT,
      summary: session.aiSummary,
      referenceId: sessionId,
      detectedSymptoms: session.detectedSymptoms,
      severityScore: session.severityScore,
    });
    await AppDataSource.getRepository(PatientHistory).save(history);

    return saved;
  }
}

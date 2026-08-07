import { injectable } from 'tsyringe';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from '../../config/database';
import { VoiceAgent } from '../../entities/VoiceAgent';
import { VoiceAgentDraft } from '../../entities/VoiceAgentDraft';
import {
  VoiceAgentVersion,
  VoiceAgentVersionSource,
} from '../../entities/VoiceAgentVersion';
import { VoiceAgentPhoneNumber } from '../../entities/VoiceAgentPhoneNumber';
import {
  VoiceAgentCall,
  VoiceAgentCallType,
  VoiceAgentCallStatus,
} from '../../entities/VoiceAgentCall';
import { User } from '../../entities/User';
import { AppError } from '../../utils/app-error';
import { env } from '../../config/env';
import {
  agentServiceClient,
  AgentServiceError,
  AgentStatusResponse,
} from '../../lib/agentServiceClient';
import {
  livekitDispatcher,
  LivekitDispatchResult,
} from '../../lib/livekitDispatch';
import { livekitSipClient } from '../../lib/sipClient';
import { WebhookReceiver, EgressClient } from 'livekit-server-sdk';
import {
  buildRecordingUrl,
  getPresignedRecordingUrl,
  buildS3EgressOutput,
} from '../../lib/s3Recording';
import {
  CreateAgentDtoType,
  UpdateDraftDtoType,
  OutboundCallDtoType,
  PublishAgentDtoType,
} from './voice-agent.dto';

export type InboundCallPayload = {
  roomName: string;
  agentName: string;
  fromNumber: string;
  toNumber: string;
};

// Inova-style: name is kebab-cased, immutable, unique per doctor
function buildAgentName(displayName: string, suffix: string): string {
  return `${displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${suffix}`;
}

@injectable()
export class VoiceAgentService {
  private get agentRepo(): Repository<VoiceAgent> {
    return AppDataSource.getRepository(VoiceAgent);
  }
  private get draftRepo(): Repository<VoiceAgentDraft> {
    return AppDataSource.getRepository(VoiceAgentDraft);
  }
  private get versionRepo(): Repository<VoiceAgentVersion> {
    return AppDataSource.getRepository(VoiceAgentVersion);
  }
  private get phoneRepo(): Repository<VoiceAgentPhoneNumber> {
    return AppDataSource.getRepository(VoiceAgentPhoneNumber);
  }
  private get callRepo(): Repository<VoiceAgentCall> {
    return AppDataSource.getRepository(VoiceAgentCall);
  }

  async createAgent(
    doctorId: string,
    tenantId: string,
    dto: CreateAgentDtoType,
  ): Promise<{ agent: VoiceAgent; draft: VoiceAgentDraft }> {
    const suffix = uuidv4().slice(0, 8);
    const name = buildAgentName(dto.displayName, suffix);

    const agent = this.agentRepo.create({
      doctorId,
      tenantId,
      name,
      displayName: dto.displayName,
      active: true,
    });
    await this.agentRepo.save(agent);

    const draft = this.draftRepo.create({ agentId: agent.id });
    await this.draftRepo.save(draft);

    return { agent, draft };
  }

  async getAgent(
    agentId: string,
    doctorId: string,
  ): Promise<{
    agent: VoiceAgent;
    draft: VoiceAgentDraft | null;
    deployedVersion: VoiceAgentVersion | null;
    phoneNumber: VoiceAgentPhoneNumber | null;
  }> {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, doctorId },
    });
    if (!agent) throw AppError.notFound('Voice agent');

    const draft = await this.draftRepo.findOne({ where: { agentId } });
    const deployedVersion = agent.deployedVersionId
      ? await this.versionRepo.findOne({
          where: { id: agent.deployedVersionId },
        })
      : null;

    const phoneNumber = await this.phoneRepo.findOne({
      where: { assignedDoctorId: doctorId },
    });

    return { agent, draft, deployedVersion, phoneNumber };
  }

  async listAgents(doctorId: string): Promise<VoiceAgent[]> {
    return this.agentRepo.find({
      where: { doctorId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateDraft(
    agentId: string,
    doctorId: string,
    dto: UpdateDraftDtoType,
  ): Promise<VoiceAgentDraft> {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, doctorId },
    });
    if (!agent) throw AppError.notFound('Voice agent');

    let draft = await this.draftRepo.findOne({ where: { agentId } });
    if (!draft) {
      draft = this.draftRepo.create({ agentId });
    }

    if (dto.prompt !== undefined) draft.prompt = dto.prompt;
    if (dto.welcomeMessage !== undefined)
      draft.welcomeMessage = dto.welcomeMessage;
    if (dto.welcomeAllowInterruptions !== undefined)
      draft.welcomeAllowInterruptions = dto.welcomeAllowInterruptions;
    if (dto.allowInterruptions !== undefined)
      draft.allowInterruptions = dto.allowInterruptions;
    if (dto.minInterruptionDuration !== undefined)
      draft.minInterruptionDuration = dto.minInterruptionDuration;
    if (dto.minInterruptionWords !== undefined)
      draft.minInterruptionWords = dto.minInterruptionWords;
    if (dto.language !== undefined) draft.language = dto.language;
    if (dto.llmProvider !== undefined) draft.llmProvider = dto.llmProvider;
    if (dto.llmModel !== undefined) draft.llmModel = dto.llmModel;
    if (dto.llmTemperature !== undefined)
      draft.llmTemperature = dto.llmTemperature;
    if (dto.sttProvider !== undefined) draft.sttProvider = dto.sttProvider;
    if (dto.sttModel !== undefined) draft.sttModel = dto.sttModel;
    if (dto.ttsProvider !== undefined) draft.ttsProvider = dto.ttsProvider;
    if (dto.ttsModel !== undefined) draft.ttsModel = dto.ttsModel;
    if (dto.ttsVoiceId !== undefined) draft.ttsVoiceId = dto.ttsVoiceId;
    if (dto.ttsLanguage !== undefined) draft.ttsLanguage = dto.ttsLanguage;
    if (dto.ttsVoiceSettings !== undefined)
      draft.ttsVoiceSettings = dto.ttsVoiceSettings;
    if (dto.dynamicVariables !== undefined)
      draft.dynamicVariables = dto.dynamicVariables as Record<
        string,
        string | number | boolean
      >;

    return this.draftRepo.save(draft);
  }

  async publishAgent(
    agentId: string,
    doctorId: string,
    dto: PublishAgentDtoType,
  ): Promise<{
    agent: VoiceAgent;
    version: VoiceAgentVersion;
    status: string;
  }> {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, doctorId },
    });
    if (!agent) throw AppError.notFound('Voice agent');

    // Resolve config — from a specific version (rollback) or current draft
    let config: VoiceAgentDraft | VoiceAgentVersion | null;
    let source = VoiceAgentVersionSource.PUBLISH;

    if (dto.sourceVersionId) {
      config = await this.versionRepo.findOne({
        where: { id: dto.sourceVersionId, agentId },
      });
      if (!config) throw AppError.notFound('Version');
      source = VoiceAgentVersionSource.ROLLBACK;
    } else {
      config = await this.draftRepo.findOne({ where: { agentId } });
      if (!config) throw AppError.badRequest('Draft not found');
    }

    if (!config.prompt)
      throw AppError.badRequest('Agent prompt is required before publishing');

    // Get next version number
    const latestVersion = await this.versionRepo.findOne({
      where: { agentId },
      order: { version: 'DESC' },
    });
    const nextVersion = (latestVersion?.version ?? 0) + 1;
    const versionId = uuidv4();

    // Get doctor info for agent service payload
    const doctor = await AppDataSource.getRepository(User).findOne({
      where: { id: doctorId },
    });

    // Build agent service payload (like inova)
    const payload = {
      agent_id: agent.id,
      version_id: versionId,
      doctor_id: doctorId,
      name: agent.name,
      display_name: agent.displayName,
      active: agent.active,
      system_prompt: config.prompt,
      welcome_message: config.welcomeMessage ?? null,
      welcome_allow_interruptions: config.welcomeAllowInterruptions,
      allow_interruptions: config.allowInterruptions ?? true,
      min_interruption_duration: Number(config.minInterruptionDuration ?? 0.5),
      min_interruption_words: config.minInterruptionWords ?? 2,
      language: config.language,
      llm_provider: config.llmProvider,
      llm_model: config.llmModel,
      llm_temperature: Number(config.llmTemperature),
      stt_provider: config.sttProvider,
      stt_model: config.sttModel,
      tts_provider: config.ttsProvider,
      tts_model: config.ttsModel,
      tts_voice: config.ttsVoiceId ?? undefined,
      tts_language: config.ttsLanguage,
      tts_voice_settings: config.ttsVoiceSettings ?? undefined,
      dynamic_variables: config.dynamicVariables ?? undefined,
      doctor_name: doctor?.fullName,
    };

    // Create version row BEFORE calling agent service (like inova)
    const version = this.versionRepo.create({
      id: versionId,
      agentId,
      version: nextVersion,
      source,
      deploymentStatus: 'pending',
      prompt: config.prompt,
      welcomeMessage: config.welcomeMessage,
      welcomeAllowInterruptions: config.welcomeAllowInterruptions,
      allowInterruptions: config.allowInterruptions ?? true,
      minInterruptionDuration: config.minInterruptionDuration ?? 0.5,
      minInterruptionWords: config.minInterruptionWords ?? 2,
      language: config.language,
      llmProvider: config.llmProvider,
      llmModel: config.llmModel,
      llmTemperature: config.llmTemperature,
      sttProvider: config.sttProvider,
      sttModel: config.sttModel,
      ttsProvider: config.ttsProvider,
      ttsModel: config.ttsModel,
      ttsVoiceId: config.ttsVoiceId,
      ttsLanguage: config.ttsLanguage,
      ttsVoiceSettings: config.ttsVoiceSettings,
      dynamicVariables: config.dynamicVariables,
    });
    await this.versionRepo.save(version);

    // Call Python AI service (like inova)
    let serviceResponse;
    try {
      if (agent.externalId) {
        serviceResponse = await agentServiceClient.updateAgent(
          agent.externalId,
          payload,
        );
      } else {
        serviceResponse = await agentServiceClient.createAgent(payload);
      }
    } catch (err) {
      if (err instanceof AgentServiceError) {
        console.error(
          '[publishAgent] Agent service error:',
          err.message,
          err.details,
        );
        throw new AppError(
          `${err.message}: ${JSON.stringify(err.details)}`,
          500,
          'INTERNAL_ERROR',
        );
      }
      throw err;
    }

    const externalId = serviceResponse.livekit_agent_id ?? agent.externalId;

    // Save externalId immediately so retries use the update path
    await this.agentRepo.update(agentId, { externalId });

    // Update version deployment status
    await this.versionRepo.update(versionId, {
      deploymentStatus: serviceResponse.status ?? 'pending',
    });

    return { agent, version, status: serviceResponse.status };
  }

  async getVersions(
    agentId: string,
    doctorId: string,
  ): Promise<VoiceAgentVersion[]> {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, doctorId },
    });
    if (!agent) throw AppError.notFound('Voice agent');
    return this.versionRepo.find({
      where: { agentId },
      order: { version: 'DESC' },
    });
  }

  async getDeploymentStatus(
    agentId: string,
    doctorId: string,
  ): Promise<{ status: string } | AgentStatusResponse> {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, doctorId },
    });
    if (!agent) throw AppError.notFound('Voice agent');
    if (!agent.externalId) return { status: 'not_deployed' };

    const status = await agentServiceClient.getStatus(agent.externalId);

    // Sync deploymentStatus back to version if completed
    if (
      agent.deployedVersionId &&
      status.latest_deployment?.status === 'completed'
    ) {
      await this.versionRepo.update(agent.deployedVersionId, {
        deploymentStatus: 'completed',
      });
    }

    return status;
  }

  async makeOutboundCall(
    agentId: string,
    doctorId: string,
    dto: OutboundCallDtoType,
  ): Promise<VoiceAgentCall> {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, doctorId },
    });
    if (!agent) throw AppError.notFound('Voice agent');
    if (!agent.deployedVersionId)
      throw AppError.badRequest(
        'Agent must be published and deployed before making calls',
      );

    const phoneNumber = await this.phoneRepo.findOne({
      where: { assignedDoctorId: doctorId },
    });
    if (!phoneNumber)
      throw AppError.badRequest('No phone number assigned to your account');
    if (!phoneNumber.outboundTrunkId)
      throw AppError.badRequest('Outbound SIP trunk not configured');

    const deployedVersion = await this.versionRepo.findOne({
      where: { id: agent.deployedVersionId },
    });
    if (!deployedVersion) throw AppError.notFound('Deployed version');

    const roomName = `outbound-${agent.name}-${uuidv4().slice(0, 8)}`;

    const metadata = {
      agent_id: agent.id,
      agent_name: agent.name,
      doctor_id: doctorId,
      from_number: phoneNumber.phoneNumber,
      to_number: dto.toNumber,
      dynamic_variables: dto.dynamicVariables ?? {},
    };

    // Create call record
    const call = this.callRepo.create({
      agentId: agent.id,
      doctorId,
      roomName,
      callType: VoiceAgentCallType.OUTBOUND,
      fromNumber: phoneNumber.phoneNumber,
      toNumber: dto.toNumber,
      status: VoiceAgentCallStatus.INITIATED,
    });
    await this.callRepo.save(call);

    try {
      // Dispatch agent to room (like inova)
      await livekitDispatcher.createDispatch({
        doctorId,
        agentId: agent.id,
        agentName: agent.name,
        roomName,
        participantIdentity: `dialer-${uuidv4().slice(0, 8)}`,
        participantName: 'Outbound Dialer',
        metadata,
      });

      // Create SIP participant (dial the patient)
      await livekitSipClient.createSipParticipant(
        phoneNumber.outboundTrunkId,
        dto.toNumber,
        roomName,
        {
          participantIdentity: `sip-${uuidv4().slice(0, 8)}`,
          participantName: 'Patient',
        },
      );

      await this.callRepo.update(call.id, {
        status: VoiceAgentCallStatus.ACTIVE,
      });

      await this.startRecordingEgress(doctorId, agent.id, roomName);

      return call;
    } catch (err) {
      await this.callRepo.update(call.id, {
        status: VoiceAgentCallStatus.FAILED,
      });
      throw err;
    }
  }

  async getCalls(agentId: string, doctorId: string): Promise<VoiceAgentCall[]> {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, doctorId },
    });
    if (!agent) throw AppError.notFound('Voice agent');
    return this.callRepo.find({
      where: { agentId },
      order: { createdAt: 'DESC' },
    });
  }

  async getAllCalls(
    doctorId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    data: Array<VoiceAgentCall & { agentDisplayName: string }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { In } = await import('typeorm');
    const agents = await this.agentRepo.find({
      where: { doctorId },
      select: ['id', 'displayName', 'name'],
    });
    if (agents.length === 0)
      return { data: [], total: 0, page, limit, totalPages: 0 };
    const agentMap = Object.fromEntries(
      agents.map((a) => [a.id, a.displayName ?? a.name]),
    );
    const [calls, total] = await this.callRepo.findAndCount({
      where: { agentId: In(agents.map((a) => a.id)) },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: calls.map((c) => ({
        ...c,
        agentDisplayName: agentMap[c.agentId] ?? c.agentId,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async playgroundToken(
    agentId: string,
    doctorId: string,
  ): Promise<LivekitDispatchResult> {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, doctorId },
    });
    if (!agent) throw AppError.notFound('Voice agent');
    if (!agent.deployedVersionId)
      throw AppError.badRequest(
        'Agent is not deployed. Publish the agent first.',
      );

    const roomName = `playground-${agent.name}-${uuidv4().slice(0, 8)}`;
    const dispatch = await livekitDispatcher.createDispatch({
      doctorId,
      agentId,
      agentName: agent.name,
      roomName,
      participantIdentity: `doctor-${doctorId.slice(0, 8)}`,
      participantName: 'Doctor',
    });

    // Record the web/playground call too (outbound/inbound already do this).
    await this.startRecordingEgress(doctorId, agent.id, roomName);

    return dispatch;
  }

  async deleteAgent(agentId: string, doctorId: string): Promise<void> {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, doctorId },
    });
    if (!agent) throw AppError.notFound('Voice agent');

    if (agent.externalId) {
      try {
        await agentServiceClient.deleteAgent(agent.externalId, doctorId);
      } catch {
        /* best effort */
      }
    }

    await this.draftRepo.delete({ agentId });
    await this.agentRepo.delete(agentId);
  }

  // Called by LiveKit webhook when a SIP participant joins an inbound room
  async handleLivekitWebhook(
    rawBody: string,
    authHeader: string | undefined,
  ): Promise<void> {
    const receiver = new WebhookReceiver(
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET,
    );
    const event = await receiver.receive(rawBody, authHeader, !authHeader);

    if (event.event !== 'participant_joined') return;

    // SIP participant kind = 3
    if ((event.participant?.kind as number) !== 3) return;

    // Inbound rooms are named inbound-<phone_digits>-<random>
    const roomName = event.room?.name ?? '';
    const match = roomName.match(/^inbound-(\d+)-/);
    if (!match) return;

    const phoneDigits = match[1];
    const phoneNumber = `+${phoneDigits}`;

    const phoneRepo = AppDataSource.getRepository(VoiceAgentPhoneNumber);
    const phone = await phoneRepo.findOne({
      where: { phoneNumber, isActive: true },
    });
    if (!phone?.assignedAgentId) return;

    const agent = await this.agentRepo.findOne({
      where: { id: phone.assignedAgentId },
    });
    if (!agent) return;

    // Avoid duplicate dispatches for the same room
    const existing = await this.callRepo.findOne({ where: { roomName } });
    if (existing) return;

    const fromNumber = event.participant?.attributes?.['sip.caller_number'];

    const call = this.callRepo.create({
      agentId: agent.id,
      doctorId: phone.assignedDoctorId ?? '',
      roomName,
      callType: VoiceAgentCallType.INBOUND,
      fromNumber: fromNumber ?? undefined,
      toNumber: phone.phoneNumber,
      status: VoiceAgentCallStatus.INITIATED,
    });
    await this.callRepo.save(call);

    await livekitDispatcher.createDispatch({
      doctorId: phone.assignedDoctorId ?? '',
      agentId: agent.id,
      agentName: agent.name,
      roomName,
    });
    // Inbound recording is handled by the RoomEgress config embedded in the SIP dispatch rule
  }

  // Legacy inbound webhook kept for compatibility
  async handleInboundCall(
    data: InboundCallPayload,
  ): Promise<VoiceAgentCall | null> {
    const agent = await this.agentRepo.findOne({
      where: { name: data.agentName },
    });
    if (!agent) return null;

    const existing = await this.callRepo.findOne({
      where: { roomName: data.roomName },
    });
    if (existing) return existing;

    const call = this.callRepo.create({
      agentId: agent.id,
      doctorId: agent.doctorId,
      roomName: data.roomName,
      callType: VoiceAgentCallType.INBOUND,
      fromNumber: data.fromNumber,
      toNumber: data.toNumber,
      status: VoiceAgentCallStatus.INITIATED,
    });
    return this.callRepo.save(call);
  }

  // Receives full session report from agent on_session_end
  async handleCallReport(report: Record<string, unknown>): Promise<void> {
    const roomName = report['room'] as string | undefined;
    if (!roomName) return;

    const sip = report['sip'] as Record<string, unknown> | undefined;
    const fromNumber =
      (sip?.['caller_number'] as string | undefined) ?? undefined;
    const toNumber =
      (sip?.['receiver_number'] as string | undefined) ?? undefined;
    const durationSeconds = report['call_duration_seconds'] as
      | number
      | undefined;
    const transcript = report['chat_history'] ?? undefined;
    const summary = (report['call_summary'] as string | undefined) ?? undefined;
    const agentMeta = report['agent'] as Record<string, unknown> | undefined;
    const agentId =
      (agentMeta?.['agent_id'] as string | undefined) ?? undefined;

    // Find call by room name
    const existing = await this.callRepo.findOne({ where: { roomName } });

    if (existing) {
      const recUrl =
        existing.doctorId && existing.agentId
          ? buildRecordingUrl(existing.doctorId, existing.agentId, roomName)
          : undefined;
      await this.callRepo.update(existing.id, {
        status: VoiceAgentCallStatus.COMPLETED,
        ...(fromNumber && { fromNumber }),
        ...(toNumber && { toNumber }),
        ...(durationSeconds != null && {
          durationSeconds: Math.round(durationSeconds),
        }),
        ...(transcript !== undefined && { transcript }),
        ...(summary && { summary }),
        ...(recUrl && { recordingUrl: recUrl }),
        rawJson: report,
      });
    } else if (agentId) {
      // No existing call record (e.g. web calls), create one
      const agent = await this.agentRepo.findOne({ where: { id: agentId } });
      if (agent) {
        const recUrl = buildRecordingUrl(agent.doctorId, agent.id, roomName);
        await this.callRepo.save(
          this.callRepo.create({
            agentId: agent.id,
            doctorId: agent.doctorId,
            roomName,
            callType: VoiceAgentCallType.INBOUND,
            fromNumber,
            toNumber,
            status: VoiceAgentCallStatus.COMPLETED,
            durationSeconds:
              durationSeconds != null ? Math.round(durationSeconds) : undefined,
            transcript,
            summary,
            recordingUrl: recUrl,
            rawJson: report,
          }),
        );
      }
    }
  }

  async getCallDetail(
    agentId: string,
    callId: string,
    doctorId: string,
  ): Promise<VoiceAgentCall> {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, doctorId },
    });
    if (!agent) throw AppError.notFound('Voice agent');
    const call = await this.callRepo.findOne({
      where: { id: callId, agentId },
    });
    if (!call) throw AppError.notFound('Call');
    return call;
  }

  async getCallRecordingUrl(
    callId: string,
    doctorId: string,
  ): Promise<string | null> {
    const call = await this.callRepo.findOne({
      where: { id: callId, doctorId },
    });
    if (!call) throw AppError.notFound('Call');
    if (!call.recordingUrl) return null;
    return getPresignedRecordingUrl(call.recordingUrl);
  }

  // Generates AI summary from call transcript items
  async generateCallSummary(
    items: Array<{ type: string; role?: string; content?: string[] }>,
  ): Promise<string | null> {
    const lines = items
      .filter((i) => i.type === 'message')
      .map((i) => {
        const role = i.role ?? 'unknown';
        const content = Array.isArray(i.content) ? i.content.join(' ') : '';
        return `${role}: ${content}`.trim();
      })
      .filter((l) => l.length > 0);

    if (lines.length < 3) return null;
    const transcript = lines.join('\n');
    if (transcript.length < 100) return null;

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const prompt = [
      'You are a medical call summarization assistant.',
      "Write a concise summary of this call between a patient and a doctor's AI voice agent.",
      'Write it as a single paragraph in third person, past tense.',
      "Include: the patient's concern, information exchanged, and outcome (booking made, info given, etc.).",
      'Do NOT use bullet points or headers.',
      '',
      'Transcript:',
      transcript,
    ].join('\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
    });

    return completion.choices[0]?.message?.content?.trim() ?? null;
  }

  async ttsPreview(
    provider: string,
    voiceId: string,
    model?: string,
  ): Promise<Buffer> {
    if (provider === 'openai') {
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const response = await openai.audio.speech.create({
        model: 'tts-1',
        voice: voiceId,
        input: "Hello! I'm your voice assistant. How can I help you today?",
      });
      return Buffer.from(await response.arrayBuffer());
    }
    if (provider === 'sarvam') {
      if (!env.SARVAM_API_KEY)
        throw AppError.badRequest('Sarvam API key not configured');
      const res = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': env.SARVAM_API_KEY,
        },
        body: JSON.stringify({
          inputs: [
            "Hello! I'm your voice assistant. How can I help you today?",
          ],
          target_language_code: 'en-IN',
          speaker: voiceId,
          model: model ?? 'bulbul:v3',
          speech_sample_rate: 22050,
        }),
      });
      if (!res.ok) throw AppError.badRequest('Sarvam TTS preview failed');
      const json = (await res.json()) as { audios: string[] };
      const b64 = json.audios?.[0];
      if (!b64) throw AppError.badRequest('No audio returned from Sarvam');
      return Buffer.from(b64, 'base64');
    }
    throw AppError.badRequest('Preview not available for this provider');
  }

  private async startRecordingEgress(
    doctorId: string,
    agentId: string,
    roomName: string,
  ): Promise<void> {
    try {
      const egressClient = new EgressClient(
        env.LIVEKIT_URL,
        env.LIVEKIT_API_KEY,
        env.LIVEKIT_API_SECRET,
      );
      const output = buildS3EgressOutput(doctorId, agentId);
      await egressClient.startRoomCompositeEgress(roomName, output, {
        audioOnly: true,
      });
    } catch (err) {
      // Non-fatal — call continues without recording
      console.error(
        '[recording] Failed to start egress for room',
        roomName,
        err,
      );
    }
  }
}

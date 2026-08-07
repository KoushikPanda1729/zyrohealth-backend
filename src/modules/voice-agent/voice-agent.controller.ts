import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { VoiceAgentService, InboundCallPayload } from './voice-agent.service';
import {
  CreateAgentDto,
  UpdateDraftDto,
  OutboundCallDto,
  PublishAgentDto,
} from './voice-agent.dto';
import { success } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

@injectable()
export class VoiceAgentController {
  constructor(private readonly svc: VoiceAgentService) {}

  createAgent = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const doctorId = req.user!.id as string;
      if (!req.user!.canCreateAgent) throw AppError.forbidden();
      const dto = CreateAgentDto.parse(req.body);
      const result = await this.svc.createAgent(
        doctorId,
        req.user!.tenantId as string,
        dto,
      );
      res.status(201).json(success(result));
    } catch (err) {
      next(err);
    }
  };

  getAgent = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.svc.getAgent(
        req.params['id'] as string,
        req.user!.id as string,
      );
      res.json(success(result));
    } catch (err) {
      next(err);
    }
  };

  listAgents = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const agents = await this.svc.listAgents(req.user!.id as string);
      res.json(success(agents));
    } catch (err) {
      next(err);
    }
  };

  updateDraft = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const dto = UpdateDraftDto.parse(req.body);
      const draft = await this.svc.updateDraft(
        req.params['id'] as string,
        req.user!.id as string,
        dto,
      );
      res.json(success(draft));
    } catch (err) {
      next(err);
    }
  };

  publishAgent = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const dto = PublishAgentDto.parse(req.body);
      const result = await this.svc.publishAgent(
        req.params['id'] as string,
        req.user!.id as string,
        dto,
      );
      res.json(success(result));
    } catch (err) {
      next(err);
    }
  };

  getVersions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const versions = await this.svc.getVersions(
        req.params['id'] as string,
        req.user!.id as string,
      );
      res.json(success(versions));
    } catch (err) {
      next(err);
    }
  };

  getDeploymentStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const status = await this.svc.getDeploymentStatus(
        req.params['id'] as string,
        req.user!.id as string,
      );
      res.json(success(status));
    } catch (err) {
      next(err);
    }
  };

  makeOutboundCall = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const dto = OutboundCallDto.parse(req.body);
      const call = await this.svc.makeOutboundCall(
        req.params['id'] as string,
        req.user!.id as string,
        dto,
      );
      res.status(201).json(success(call));
    } catch (err) {
      next(err);
    }
  };

  getAllCalls = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(req.query['limit'] as string) || 20),
      );
      const result = await this.svc.getAllCalls(
        req.user!.id as string,
        page,
        limit,
      );
      res.json(success(result));
    } catch (err) {
      next(err);
    }
  };

  getCalls = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const calls = await this.svc.getCalls(
        req.params['id'] as string,
        req.user!.id as string,
      );
      res.json(success(calls));
    } catch (err) {
      next(err);
    }
  };

  getCallDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const call = await this.svc.getCallDetail(
        req.params['id'] as string,
        req.params['callId'] as string,
        req.user!.id as string,
      );
      res.json(success(call));
    } catch (err) {
      next(err);
    }
  };

  getCallRecording = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const url = await this.svc.getCallRecordingUrl(
        req.params['callId'] as string,
        req.user!.id as string,
      );
      res.json(success({ url }));
    } catch (err) {
      next(err);
    }
  };

  playgroundToken = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.svc.playgroundToken(
        req.params['id'] as string,
        req.user!.id as string,
      );
      res.json(success(result));
    } catch (err) {
      next(err);
    }
  };

  ttsPreview = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { provider, voiceId, model } = req.query as {
        provider: string;
        voiceId: string;
        model?: string;
      };
      const audio = await this.svc.ttsPreview(provider, voiceId, model);
      res.set('Content-Type', 'audio/mpeg');
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(audio);
    } catch (err) {
      next(err);
    }
  };

  deleteAgent = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.svc.deleteAgent(
        req.params['id'] as string,
        req.user!.id as string,
      );
      res.json(success({ deleted: true }));
    } catch (err) {
      next(err);
    }
  };

  livekitWebhook = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const body: unknown = req.body;
      const rawBody =
        (req as Request & { rawBody?: string }).rawBody ??
        (typeof body === 'string'
          ? body
          : Buffer.isBuffer(body)
            ? body.toString('utf8')
            : '');
      const authHeader = req.headers['authorization'];
      await this.svc.handleLivekitWebhook(rawBody, authHeader);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  };

  inboundWebhook = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.svc.handleInboundCall(req.body as InboundCallPayload);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  };

  callReport = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.svc.handleCallReport(req.body as Record<string, unknown>);
      res.json(success({ ok: true }));
    } catch (err) {
      next(err);
    }
  };

  callSummary = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { items } = req.body as {
        items?: Array<{ type: string; role?: string; content?: string[] }>;
      };
      const summary = await this.svc.generateCallSummary(items ?? []);
      res.json(
        success({
          summary: summary ?? 'Insufficient transcript to summarize.',
        }),
      );
    } catch (err) {
      next(err);
    }
  };
}

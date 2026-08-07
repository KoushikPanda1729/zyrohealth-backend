import { Router, Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { VoiceAgentController } from './voice-agent.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { env } from '../../config/env';
import { AppError } from '../../utils/app-error';

function requireInternalToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token = env.BACKEND_INTERNAL_TOKEN;
  if (!token) return next();
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ') || auth.slice(7) !== token) {
    return next(AppError.unauthorized('Invalid internal token'));
  }
  return next();
}

const router = Router();
const ctrl = container.resolve(VoiceAgentController);

// Doctor-only routes
router.use(verifyToken, attachRole, requireRole('doctor'));

router.get('/', (req, res, next) => void ctrl.listAgents(req, res, next));
router.post('/', (req, res, next) => void ctrl.createAgent(req, res, next));
router.get(
  '/tts-preview',
  (req, res, next) => void ctrl.ttsPreview(req, res, next),
);
router.get('/calls', (req, res, next) => void ctrl.getAllCalls(req, res, next));
router.get('/:id', (req, res, next) => void ctrl.getAgent(req, res, next));
router.put(
  '/:id/draft',
  (req, res, next) => void ctrl.updateDraft(req, res, next),
);
router.post(
  '/:id/publish',
  (req, res, next) => void ctrl.publishAgent(req, res, next),
);
router.get(
  '/:id/versions',
  (req, res, next) => void ctrl.getVersions(req, res, next),
);
router.get(
  '/:id/status',
  (req, res, next) => void ctrl.getDeploymentStatus(req, res, next),
);
router.post(
  '/:id/outbound-call',
  (req, res, next) => void ctrl.makeOutboundCall(req, res, next),
);
router.get(
  '/:id/calls',
  (req, res, next) => void ctrl.getCalls(req, res, next),
);
router.get(
  '/:id/calls/:callId',
  (req, res, next) => void ctrl.getCallDetail(req, res, next),
);
router.get(
  '/calls/:callId/recording',
  (req, res, next) => void ctrl.getCallRecording(req, res, next),
);
router.get(
  '/:id/playground-token',
  (req, res, next) => void ctrl.playgroundToken(req, res, next),
);
router.delete(
  '/:id',
  (req, res, next) => void ctrl.deleteAgent(req, res, next),
);

export { router as voiceAgentRouter };

// Internal webhook router — called by agent and LiveKit SIP service
const webhookRouter = Router();
const webhookCtrl = container.resolve(VoiceAgentController);
webhookRouter.post(
  '/livekit',
  (req, res, next) => void webhookCtrl.livekitWebhook(req, res, next),
);
webhookRouter.post(
  '/inbound',
  (req, res, next) => void webhookCtrl.inboundWebhook(req, res, next),
);
webhookRouter.post(
  '/call-report',
  requireInternalToken,
  (req, res, next) => void webhookCtrl.callReport(req, res, next),
);
webhookRouter.post(
  '/call-summary',
  requireInternalToken,
  (req, res, next) => void webhookCtrl.callSummary(req, res, next),
);

export { webhookRouter as voiceAgentWebhookRouter };

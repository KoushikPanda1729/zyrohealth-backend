import 'reflect-metadata';
import './config/container';
import express, {
  Express,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { errorMiddleware } from './middleware/error.middleware';
import { globalLimiter } from './middleware/rateLimit.middleware';

import { authRouter } from './modules/auth/auth.routes';
import { patientsRouter } from './modules/patients/patients.routes';
import {
  doctorsRouter,
  doctorPrivateRouter,
} from './modules/doctors/doctors.routes';
import { bookingsRouter } from './modules/bookings/bookings.routes';
import { paymentsRouter } from './modules/payments/payments.routes';
import { chatRouter } from './modules/chat/chat.routes';
import { prescriptionsRouter } from './modules/prescriptions/prescriptions.routes';
import { aiRouter } from './modules/ai/ai.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { platformRouter } from './modules/platform/platform.routes';
import {
  voiceAgentRouter,
  voiceAgentWebhookRouter,
} from './modules/voice-agent/voice-agent.routes';
import { phoneNumberRouter } from './modules/phone-number/phone-number.routes';
import { medicineOrdersRouter } from './modules/medicine-orders/medicine-orders.routes';
import { pharmacyRouter } from './modules/pharmacy/pharmacy.routes';
import { hospitalsRouter } from './modules/hospitals/hospitals.routes';
import { ambulanceRouter } from './modules/ambulance/ambulance.routes';
import { articlesRouter } from './modules/articles/articles.routes';
import { womenHealthRouter } from './modules/women-health/women-health.routes';
import { appConfigRouter } from './modules/app-config/app-config.routes';
import { bannersRouter } from './modules/banners/banners.routes';
import { policiesRouter } from './modules/policies/policies.routes';
import { shopRouter } from './modules/shop/shop.routes';
import { patientFlowRouter } from './modules/patient-flow/patient-flow.routes';
import { PaymentsController } from './modules/payments/payments.controller';
import { WhatsAppWebhookController } from './modules/whatsapp/whatsapp-webhook.controller';
import { container } from './config/container';

export function createApp(): Express {
  const app = express();

  // Trust exactly one hop (Nginx, the only reverse proxy in front of this
  // app) so req.protocol/req.ip reflect the real client — needed for
  // Twilio's webhook signature validation (see above) and for
  // rate-limiting to key on the real client IP rather than Nginx's.
  // `true` (trust the whole chain unconditionally) lets a client spoof
  // X-Forwarded-For to fake their IP and bypass IP-based rate limits
  // entirely — express-rate-limit refuses to run under that setting.
  app.set('trust proxy', 1);

  app.use(helmet());
  // Reflects whatever Origin the request sends (any origin allowed) instead
  // of a fixed list — needed so `flutter run -d chrome` (a random localhost
  // port each run) and any other web client can hit the API during testing.
  app.use(cors({ origin: true, credentials: true }));
  app.use(globalLimiter);

  // Stripe webhook MUST receive raw body — mount BEFORE express.json()
  const paymentsCtrl = container.resolve(PaymentsController);
  const webhookHandler: RequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    void paymentsCtrl.webhook(req, res, next);
  };
  app.post(
    '/api/payments/webhook',
    express.raw({ type: 'application/json' }),
    webhookHandler,
  );

  // LiveKit webhook — raw body required for signature verification
  app.post(
    '/api/voice-agent/webhook/livekit',
    express.raw({ type: '*/*' }),
    (req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { rawBody?: string }).rawBody = (
        req.body as Buffer
      ).toString('utf8');
      next();
    },
  );

  // WhatsApp inbound webhooks — raw/urlencoded body required for signature verification,
  // mounted BEFORE the global body parsers (same reason as the webhooks above).
  const whatsappWebhookCtrl = container.resolve(WhatsAppWebhookController);
  app.get('/api/whatsapp/webhook/meta', (req, res) => {
    whatsappWebhookCtrl.verifyMeta(req, res);
  });
  app.post(
    '/api/whatsapp/webhook/meta',
    express.raw({ type: 'application/json' }),
    (req: Request, res: Response, next: NextFunction) => {
      void whatsappWebhookCtrl.receiveMeta(req, res, next);
    },
  );
  app.post(
    '/api/whatsapp/webhook/twilio',
    express.urlencoded({ extended: false }),
    (req: Request, res: Response, next: NextFunction) => {
      void whatsappWebhookCtrl.receiveTwilio(req, res, next);
    },
  );
  // Gupshup has no HMAC webhook signing — the :secret path segment is a
  // self-chosen shared secret checked inside receiveGupshup.
  app.post(
    '/api/whatsapp/webhook/gupshup/:secret',
    express.json(),
    (req: Request, res: Response, next: NextFunction) => {
      void whatsappWebhookCtrl.receiveGupshup(req, res, next);
    },
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/', (_req: Request, res: Response) => {
    res.json({ message: 'Welcome to ZyroHealth API' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/patients', patientsRouter);
  app.use('/api/doctors', doctorsRouter);
  app.use('/api/doctor', doctorPrivateRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/prescriptions', prescriptionsRouter);
  app.use('/api/medicine-orders', medicineOrdersRouter);
  app.use('/api/pharmacy', pharmacyRouter);
  app.use('/api/hospitals', hospitalsRouter);
  app.use('/api/ambulance-requests', ambulanceRouter);
  app.use('/api/articles', articlesRouter);
  app.use('/api/women-health', womenHealthRouter);
  app.use('/api/app-config', appConfigRouter);
  app.use('/api/banners', bannersRouter);
  app.use('/api/policies', policiesRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/platform', platformRouter);
  app.use('/api/doctor/voice-agents', voiceAgentRouter);
  app.use('/api/doctor/phone-numbers', phoneNumberRouter);
  app.use('/api/voice-agent/webhook', voiceAgentWebhookRouter);
  app.use('/api/shop', shopRouter);
  app.use('/api/patient-flow', patientFlowRouter);

  app.use(errorMiddleware);

  return app;
}

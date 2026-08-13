import 'dotenv/config';
import 'reflect-metadata';
import './config/container';
import http from 'http';
import { createApp } from './app';
import { AppDataSource } from './config/database';
import { initSocket } from './socket';
import { env } from './config/env';
import { scheduleMedicineShopAlerts } from './jobs/medicine-shop-alerts.job';

async function bootstrap(): Promise<void> {
  await AppDataSource.initialize();

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);
  scheduleMedicineShopAlerts();

  server.listen(env.PORT, () => {
    process.stdout.write(`Server running on http://localhost:${env.PORT}\n`);
  });

  const shutdown = (): void => {
    server.close(() => {
      void AppDataSource.destroy()
        .catch((err: unknown) => {
          process.stderr.write(String(err) + '\n');
        })
        .finally(() => {
          process.exit(0);
        });
    });
  };

  process.on('SIGTERM', () => {
    void shutdown();
  });
  process.on('SIGINT', () => {
    void shutdown();
  });

  // Without these, an unhandled error anywhere outside Express's own request
  // handling (e.g. a stray promise in a background job) crashes the whole
  // process with no chance to log context. Log and exit so Docker's
  // `restart: unless-stopped` brings it back up, instead of the process
  // dying silently or hanging in a broken state.
  process.on('uncaughtException', (err: unknown) => {
    process.stderr.write(`uncaughtException: ${String(err)}\n`);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason: unknown) => {
    process.stderr.write(`unhandledRejection: ${String(reason)}\n`);
    process.exit(1);
  });
}

void bootstrap().catch((err: unknown) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});

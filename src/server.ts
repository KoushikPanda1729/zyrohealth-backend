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
}

void bootstrap().catch((err: unknown) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});

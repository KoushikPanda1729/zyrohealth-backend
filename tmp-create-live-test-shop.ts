import 'reflect-metadata';
import './src/config/container';
import { container } from 'tsyringe';
import { AppDataSource } from './src/config/database';
import { PlatformService } from './src/modules/platform/platform.service';

async function main() {
  await AppDataSource.initialize();
  const svc = container.resolve(PlatformService);

  const result = await svc.createStandaloneMedicineShop({
    shopName: '[TEST] PO & Batch Demo Pharmacy',
    contactPhone: '+919812345678',
    loginEmail: 'demo.shop@fullhealth.test',
    loginFullName: 'Demo Shop Owner',
    loginPassword: 'DemoShop123!',
  });

  console.log('shopId=', result.shop.id);
  console.log('tenantId=', result.tenant.id);
  console.log('login email=', result.user.email);

  await AppDataSource.destroy();
}

main().catch((e) => { console.error(e); process.exit(1); });

import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from './env';
import { User } from '../entities/User';
import { PatientProfile } from '../entities/PatientProfile';
import { DoctorProfile } from '../entities/DoctorProfile';
import { DoctorAvailability } from '../entities/DoctorAvailability';
import { MedicineCatalogue } from '../entities/MedicineCatalogue';
import { TestCatalogue } from '../entities/TestCatalogue';
import { Booking } from '../entities/Booking';
import { Prescription } from '../entities/Prescription';
import { ChatMessage } from '../entities/ChatMessage';
import { Payment } from '../entities/Payment';
import { AiSession } from '../entities/AiSession';
import { PatientHistory } from '../entities/PatientHistory';
import { Review } from '../entities/Review';
import { OtpCode } from '../entities/OtpCode';
import { DoctorDocument } from '../entities/DoctorDocument';
import { AiDoctor } from '../entities/AiDoctor';
import { RefreshToken } from '../entities/RefreshToken';
import { VoiceAgent } from '../entities/VoiceAgent';
import { VoiceAgentDraft } from '../entities/VoiceAgentDraft';
import { VoiceAgentVersion } from '../entities/VoiceAgentVersion';
import { VoiceAgentPhoneNumber } from '../entities/VoiceAgentPhoneNumber';
import { VoiceAgentCall } from '../entities/VoiceAgentCall';
import { MedicineOrder } from '../entities/MedicineOrder';
import { WhatsAppSession } from '../entities/WhatsAppSession';
import { WhatsAppFlow } from '../entities/WhatsAppFlow';
import { Tenant } from '../entities/Tenant';
import { Permission } from '../entities/Permission';
import { TenantPermission } from '../entities/TenantPermission';
import { Role } from '../entities/Role';
import { RolePermission } from '../entities/RolePermission';
import { Department } from '../entities/Department';
import { TenantWhatsAppConfig } from '../entities/TenantWhatsAppConfig';
import { InviteToken } from '../entities/InviteToken';
import { MedicineShop } from '../entities/MedicineShop';
import { PrescriptionUploadRequest } from '../entities/PrescriptionUploadRequest';
import { MedicineShopQuote } from '../entities/MedicineShopQuote';
import { MedicineShopCatalogItem } from '../entities/MedicineShopCatalogItem';
import { MedicineShopStockMovement } from '../entities/MedicineShopStockMovement';
import { MedicineShopSupplier } from '../entities/MedicineShopSupplier';
import { MedicineShopPurchaseOrder } from '../entities/MedicineShopPurchaseOrder';
import { MedicineShopCatalogItemBatch } from '../entities/MedicineShopCatalogItemBatch';
import { MedicineShopCustomer } from '../entities/MedicineShopCustomer';
import { MedicineShopCustomerLedgerEntry } from '../entities/MedicineShopCustomerLedgerEntry';
import { MedicineShopSale } from '../entities/MedicineShopSale';
import { MedicineShopSupplierPrice } from '../entities/MedicineShopSupplierPrice';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  synchronize: false,
  logging: false,
  entities: [
    User,
    PatientProfile,
    DoctorProfile,
    DoctorAvailability,
    MedicineCatalogue,
    TestCatalogue,
    Booking,
    Prescription,
    ChatMessage,
    Payment,
    AiSession,
    PatientHistory,
    Review,
    OtpCode,
    DoctorDocument,
    AiDoctor,
    RefreshToken,
    VoiceAgent,
    VoiceAgentDraft,
    VoiceAgentVersion,
    VoiceAgentPhoneNumber,
    VoiceAgentCall,
    MedicineOrder,
    WhatsAppSession,
    WhatsAppFlow,
    Tenant,
    Permission,
    TenantPermission,
    Role,
    RolePermission,
    Department,
    TenantWhatsAppConfig,
    InviteToken,
    MedicineShop,
    PrescriptionUploadRequest,
    MedicineShopQuote,
    MedicineShopCatalogItem,
    MedicineShopStockMovement,
    MedicineShopSupplier,
    MedicineShopPurchaseOrder,
    MedicineShopCatalogItemBatch,
    MedicineShopCustomer,
    MedicineShopCustomerLedgerEntry,
    MedicineShopSale,
    MedicineShopSupplierPrice,
  ],
  migrations: ['src/migrations/*.ts'],
  subscribers: [],
});

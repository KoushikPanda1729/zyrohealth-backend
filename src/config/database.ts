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
import { MedicineOrderPayment } from '../entities/MedicineOrderPayment';
import { MedicineShopPayout } from '../entities/MedicineShopPayout';
import { WhatsAppSession } from '../entities/WhatsAppSession';
import { AppFlowSession } from '../entities/AppFlowSession';
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
import { MedicineShopRole } from '../entities/MedicineShopRole';
import { MedicineShopRolePermission } from '../entities/MedicineShopRolePermission';
import { MedicineShopAttendance } from '../entities/MedicineShopAttendance';
import { MedicineShopLeaveRequest } from '../entities/MedicineShopLeaveRequest';
import { MedicineShopStaffProfile } from '../entities/MedicineShopStaffProfile';
import { MedicineShopPayrollRecord } from '../entities/MedicineShopPayrollRecord';
import { MedicineShopWhatsAppConfig } from '../entities/MedicineShopWhatsAppConfig';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  poolSize: 10,
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
    MedicineOrderPayment,
    MedicineShopPayout,
    WhatsAppSession,
    AppFlowSession,
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
    MedicineShopRole,
    MedicineShopRolePermission,
    MedicineShopAttendance,
    MedicineShopLeaveRequest,
    MedicineShopStaffProfile,
    MedicineShopPayrollRecord,
    MedicineShopWhatsAppConfig,
  ],
  migrations: ['src/migrations/*.ts'],
  subscribers: [],
});

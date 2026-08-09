import { AppDataSource } from '../../config/database';
import {
  MedicineShopStaffProfile,
  PayrollMode,
} from '../../entities/MedicineShopStaffProfile';
import {
  MedicineShopPayrollRecord,
  PayrollRecordStatus,
  PayrollAdjustment,
} from '../../entities/MedicineShopPayrollRecord';
import { MedicineShopLeaveRequest, LeaveStatus } from '../../entities/MedicineShopLeaveRequest';
import { AppError } from '../../utils/app-error';
import { getMonthAttendanceSummary } from './attendance.util';

// ESI (Employee State Insurance) only applies below this gross-wage
// threshold in India — above it an employee is exempt regardless of the
// configured percentage. Applied automatically so a shop can leave
// ESI "enabled" for a staff member and not worry about it silently
// over-deducting if their pay crosses the line.
const ESI_GROSS_THRESHOLD_CENTS = 21_000_00;

export async function getStaffProfile(
  shopId: string,
  userId: string,
): Promise<MedicineShopStaffProfile | null> {
  return AppDataSource.getRepository(MedicineShopStaffProfile).findOne({
    where: { shopId, userId },
  });
}

export async function listStaffProfiles(shopId: string): Promise<MedicineShopStaffProfile[]> {
  return AppDataSource.getRepository(MedicineShopStaffProfile).find({
    where: { shopId },
    order: { createdAt: 'ASC' },
  });
}

export async function upsertStaffProfile(
  shopId: string,
  userId: string,
  data: Partial<{
    employeeCode: string;
    joinedAt: string;
    monthlyBaseSalaryCents: number;
    annualLeaveQuota: number;
    payrollMode: PayrollMode;
    pfEnabled: boolean;
    pfEmployeePercent: number;
    esiEnabled: boolean;
    esiEmployeePercent: number;
    professionalTaxEnabled: boolean;
    professionalTaxCents: number;
    tdsEnabled: boolean;
    tdsPercent: number;
    isActive: boolean;
  }>,
): Promise<MedicineShopStaffProfile> {
  const repo = AppDataSource.getRepository(MedicineShopStaffProfile);
  let profile = await repo.findOne({ where: { shopId, userId } });
  if (!profile) {
    profile = repo.create({ shopId, userId });
  }
  Object.assign(profile, data);
  return repo.save(profile);
}

async function getMonthPaidUnpaidLeaveDays(
  staffUserId: string,
  month: string,
): Promise<{ paidLeaveDays: number; unpaidLeaveDays: number }> {
  const [year, monthNum] = month.split('-').map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(year, monthNum, 0)).toISOString().slice(0, 10);

  const requests = await AppDataSource.getRepository(MedicineShopLeaveRequest)
    .createQueryBuilder('l')
    .where('l.staff_user_id = :staffUserId', { staffUserId })
    .andWhere('l.status = :status', { status: LeaveStatus.APPROVED })
    .andWhere('l.start_date <= :monthEnd', { monthEnd })
    .andWhere('l.end_date >= :monthStart', { monthStart })
    .getMany();

  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  for (const req of requests) {
    const overlapStart = req.startDate > monthStart ? req.startDate : monthStart;
    const overlapEnd = req.endDate < monthEnd ? req.endDate : monthEnd;
    const days =
      Math.round(
        (new Date(`${overlapEnd}T00:00:00Z`).getTime() -
          new Date(`${overlapStart}T00:00:00Z`).getTime()) /
          86_400_000,
      ) + 1;
    if (days <= 0) continue;
    if (req.isPaid) paidLeaveDays += days;
    else unpaidLeaveDays += days;
  }
  return { paidLeaveDays, unpaidLeaveDays };
}

function sumAdjustments(adjustments: PayrollAdjustment[]): { bonusCents: number; deductionCents: number } {
  let bonusCents = 0;
  let deductionCents = 0;
  for (const adj of adjustments) {
    if (adj.type === 'bonus') bonusCents += adj.amountCents;
    else deductionCents += adj.amountCents;
  }
  return { bonusCents, deductionCents };
}

// Computes/recomputes a draft payroll record for one staff member for
// one month, from their salary profile + attendance + approved leave.
// Safe to call repeatedly while still in draft (e.g. after correcting an
// attendance entry) — existing owner-added adjustments are preserved
// across regeneration. Throws if the record has already been finalized.
export async function generatePayrollRecord(
  shopId: string,
  staffUserId: string,
  month: string,
): Promise<MedicineShopPayrollRecord> {
  const profile = await getStaffProfile(shopId, staffUserId);
  if (!profile) {
    throw AppError.badRequest('Set up a salary profile for this staff member first');
  }

  const recordRepo = AppDataSource.getRepository(MedicineShopPayrollRecord);
  let record = await recordRepo.findOne({ where: { staffUserId, month } });
  if (record && record.status !== PayrollRecordStatus.DRAFT) {
    throw AppError.badRequest(
      `This payroll record is already ${record.status} — cannot regenerate`,
    );
  }

  const [year, monthNum] = month.split('-').map(Number);
  const workingDaysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();

  const attendance = await getMonthAttendanceSummary(staffUserId, month);
  const { paidLeaveDays, unpaidLeaveDays } = await getMonthPaidUnpaidLeaveDays(staffUserId, month);

  const paidDaysEquivalent = attendance.presentDays + attendance.halfDays * 0.5 + paidLeaveDays;
  const proRatedGrossCents = Math.round(
    (profile.monthlyBaseSalaryCents * paidDaysEquivalent) / workingDaysInMonth,
  );

  const statutory = profile.payrollMode === PayrollMode.STATUTORY;
  const pfDeductionCents =
    statutory && profile.pfEnabled
      ? Math.round((proRatedGrossCents * Number(profile.pfEmployeePercent)) / 100)
      : 0;
  const esiDeductionCents =
    statutory && profile.esiEnabled && proRatedGrossCents <= ESI_GROSS_THRESHOLD_CENTS
      ? Math.round((proRatedGrossCents * Number(profile.esiEmployeePercent)) / 100)
      : 0;
  const professionalTaxCents =
    statutory && profile.professionalTaxEnabled ? profile.professionalTaxCents : 0;
  const tdsCents =
    statutory && profile.tdsEnabled
      ? Math.round((proRatedGrossCents * Number(profile.tdsPercent)) / 100)
      : 0;

  const adjustments = record?.adjustments ?? [];
  const { bonusCents, deductionCents } = sumAdjustments(adjustments);

  const netPayCents =
    proRatedGrossCents +
    bonusCents -
    deductionCents -
    pfDeductionCents -
    esiDeductionCents -
    professionalTaxCents -
    tdsCents;

  if (!record) {
    record = recordRepo.create({ shopId, staffUserId, month });
  }
  Object.assign(record, {
    workingDaysInMonth,
    presentDays: attendance.presentDays,
    halfDays: attendance.halfDays,
    paidLeaveDays,
    unpaidLeaveDays,
    absentDays: attendance.absentDays,
    baseSalaryCents: profile.monthlyBaseSalaryCents,
    proRatedGrossCents,
    adjustments,
    bonusCents,
    deductionCents,
    pfDeductionCents,
    esiDeductionCents,
    professionalTaxCents,
    tdsCents,
    netPayCents,
    status: PayrollRecordStatus.DRAFT,
  });
  return recordRepo.save(record);
}

export async function addPayrollAdjustment(
  shopId: string,
  recordId: string,
  adjustment: PayrollAdjustment,
): Promise<MedicineShopPayrollRecord> {
  const repo = AppDataSource.getRepository(MedicineShopPayrollRecord);
  const record = await repo.findOne({ where: { id: recordId, shopId } });
  if (!record) throw AppError.notFound('Payroll record');
  if (record.status !== PayrollRecordStatus.DRAFT) {
    throw AppError.badRequest('Only draft payroll records can be adjusted');
  }

  record.adjustments = [...record.adjustments, adjustment];
  const { bonusCents, deductionCents } = sumAdjustments(record.adjustments);
  record.bonusCents = bonusCents;
  record.deductionCents = deductionCents;
  record.netPayCents =
    record.proRatedGrossCents +
    bonusCents -
    deductionCents -
    record.pfDeductionCents -
    record.esiDeductionCents -
    record.professionalTaxCents -
    record.tdsCents;
  return repo.save(record);
}

export async function finalizePayrollRecord(
  shopId: string,
  recordId: string,
): Promise<MedicineShopPayrollRecord> {
  const repo = AppDataSource.getRepository(MedicineShopPayrollRecord);
  const record = await repo.findOne({ where: { id: recordId, shopId } });
  if (!record) throw AppError.notFound('Payroll record');
  if (record.status !== PayrollRecordStatus.DRAFT) {
    throw AppError.badRequest('Only draft payroll records can be finalized');
  }
  record.status = PayrollRecordStatus.FINALIZED;
  return repo.save(record);
}

export async function markPayrollPaid(
  shopId: string,
  recordId: string,
  paidVia: string,
  notes?: string,
): Promise<MedicineShopPayrollRecord> {
  const repo = AppDataSource.getRepository(MedicineShopPayrollRecord);
  const record = await repo.findOne({ where: { id: recordId, shopId } });
  if (!record) throw AppError.notFound('Payroll record');
  if (record.status !== PayrollRecordStatus.FINALIZED) {
    throw AppError.badRequest('Only finalized payroll records can be marked paid');
  }
  record.status = PayrollRecordStatus.PAID;
  record.paidAt = new Date();
  record.paidVia = paidVia;
  if (notes !== undefined) record.notes = notes;
  return repo.save(record);
}

export async function listPayrollRecords(
  shopId: string,
  filters: { staffUserId?: string; month?: string },
): Promise<MedicineShopPayrollRecord[]> {
  return AppDataSource.getRepository(MedicineShopPayrollRecord).find({
    where: {
      shopId,
      ...(filters.staffUserId ? { staffUserId: filters.staffUserId } : {}),
      ...(filters.month ? { month: filters.month } : {}),
    },
    order: { month: 'DESC' },
  });
}

export async function getPayrollRecord(
  shopId: string,
  recordId: string,
): Promise<MedicineShopPayrollRecord> {
  const record = await AppDataSource.getRepository(MedicineShopPayrollRecord).findOne({
    where: { id: recordId, shopId },
  });
  if (!record) throw AppError.notFound('Payroll record');
  return record;
}

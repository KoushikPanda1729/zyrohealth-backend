import { AppDataSource } from '../../config/database';
import {
  MedicineShopLeaveRequest,
  LeaveStatus,
  LeaveCreatedVia,
} from '../../entities/MedicineShopLeaveRequest';
import { MedicineShopStaffProfile } from '../../entities/MedicineShopStaffProfile';
import { AttendanceStatus } from '../../entities/MedicineShopAttendance';
import { markAttendance } from './attendance.util';
import { AppError } from '../../utils/app-error';

const DEFAULT_ANNUAL_LEAVE_QUOTA = 12;

function inclusiveDayCount(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return diffDays;
}

export interface LeaveBalance {
  annualQuota: number;
  paidDaysTakenThisYear: number;
  remaining: number;
}

// All-or-nothing per request: if the remaining paid balance covers the
// whole request it's paid, otherwise the whole request is unpaid. Kept
// this simple deliberately — splitting a single request across the
// paid/unpaid boundary would need day-level paid flags instead of one
// per request, which isn't worth the complexity for a v1.
export async function getLeaveBalance(
  shopId: string,
  staffUserId: string,
): Promise<LeaveBalance> {
  const profile = await AppDataSource.getRepository(MedicineShopStaffProfile).findOne({
    where: { userId: staffUserId, shopId },
  });
  const annualQuota = profile?.annualLeaveQuota ?? DEFAULT_ANNUAL_LEAVE_QUOTA;

  const currentYear = new Date().getUTCFullYear();
  const approved = await AppDataSource.getRepository(MedicineShopLeaveRequest)
    .createQueryBuilder('l')
    .where('l.staff_user_id = :staffUserId', { staffUserId })
    .andWhere('l.status = :status', { status: LeaveStatus.APPROVED })
    .andWhere('l.is_paid = true')
    .andWhere(`extract(year from l.start_date) = :year`, { year: currentYear })
    .getMany();

  const paidDaysTakenThisYear = approved.reduce((sum, r) => sum + r.days, 0);
  return {
    annualQuota,
    paidDaysTakenThisYear,
    remaining: Math.max(0, annualQuota - paidDaysTakenThisYear),
  };
}

async function writeLeaveAttendanceRows(
  shopId: string,
  staffUserId: string,
  startDate: string,
  endDate: string,
  markedByUserId: string,
): Promise<void> {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    await markAttendance(
      shopId,
      staffUserId,
      iso,
      AttendanceStatus.LEAVE,
      markedByUserId,
    );
  }
}

async function decideAndApply(
  request: MedicineShopLeaveRequest,
  decidedByUserId: string,
): Promise<MedicineShopLeaveRequest> {
  const balance = await getLeaveBalance(request.shopId, request.staffUserId);
  request.isPaid = request.days <= balance.remaining;
  request.status = LeaveStatus.APPROVED;
  request.decidedByUserId = decidedByUserId;
  request.decidedAt = new Date();
  const saved = await AppDataSource.getRepository(MedicineShopLeaveRequest).save(request);

  await writeLeaveAttendanceRows(
    request.shopId,
    request.staffUserId,
    request.startDate,
    request.endDate,
    decidedByUserId,
  );
  return saved;
}

export async function requestLeave(
  shopId: string,
  staffUserId: string,
  startDate: string,
  endDate: string,
  reason?: string,
): Promise<MedicineShopLeaveRequest> {
  const days = inclusiveDayCount(startDate, endDate);
  if (days <= 0) throw AppError.badRequest('End date must be on or after start date');

  const repo = AppDataSource.getRepository(MedicineShopLeaveRequest);
  return repo.save(
    repo.create({
      shopId,
      staffUserId,
      startDate,
      endDate,
      days,
      reason,
      status: LeaveStatus.PENDING,
      createdVia: LeaveCreatedVia.STAFF_REQUEST,
      isPaid: true,
    }),
  );
}

// The owner/a manager (shop_leave.manage) marking leave directly for a
// staff member — auto-approved, no pending step, but goes through the
// exact same paid/unpaid balance + attendance-writing logic as an
// approved staff request.
export async function ownerDirectMarkLeave(
  shopId: string,
  staffUserId: string,
  startDate: string,
  endDate: string,
  reason: string | undefined,
  markedByUserId: string,
): Promise<MedicineShopLeaveRequest> {
  const days = inclusiveDayCount(startDate, endDate);
  if (days <= 0) throw AppError.badRequest('End date must be on or after start date');

  const repo = AppDataSource.getRepository(MedicineShopLeaveRequest);
  const request = repo.create({
    shopId,
    staffUserId,
    startDate,
    endDate,
    days,
    reason,
    status: LeaveStatus.PENDING,
    createdVia: LeaveCreatedVia.OWNER_DIRECT,
    isPaid: true,
  });
  return decideAndApply(request, markedByUserId);
}

export async function decideLeaveRequest(
  shopId: string,
  requestId: string,
  approve: boolean,
  decidedByUserId: string,
  decisionNote?: string,
): Promise<MedicineShopLeaveRequest> {
  const repo = AppDataSource.getRepository(MedicineShopLeaveRequest);
  const request = await repo.findOne({ where: { id: requestId, shopId } });
  if (!request) throw AppError.notFound('Leave request');
  if (request.status !== LeaveStatus.PENDING) {
    throw AppError.badRequest('This request has already been decided');
  }

  if (!approve) {
    request.status = LeaveStatus.REJECTED;
    request.decidedByUserId = decidedByUserId;
    request.decidedAt = new Date();
    request.decisionNote = decisionNote;
    return repo.save(request);
  }

  request.decisionNote = decisionNote;
  return decideAndApply(request, decidedByUserId);
}

export async function listLeaveRequests(
  shopId: string,
  filters: { staffUserId?: string; status?: LeaveStatus },
): Promise<MedicineShopLeaveRequest[]> {
  return AppDataSource.getRepository(MedicineShopLeaveRequest).find({
    where: {
      shopId,
      ...(filters.staffUserId ? { staffUserId: filters.staffUserId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    order: { createdAt: 'DESC' },
  });
}

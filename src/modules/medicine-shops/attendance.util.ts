import { AppDataSource } from '../../config/database';
import {
  MedicineShopAttendance,
  AttendanceStatus,
  AttendanceMarkedBy,
} from '../../entities/MedicineShopAttendance';
import { AppError } from '../../utils/app-error';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function selfCheckIn(
  shopId: string,
  staffUserId: string,
): Promise<MedicineShopAttendance> {
  const repo = AppDataSource.getRepository(MedicineShopAttendance);
  const date = todayIso();
  let row = await repo.findOne({ where: { staffUserId, date } });
  if (row?.checkInAt) {
    throw AppError.badRequest('Already checked in today');
  }
  if (!row) {
    row = repo.create({
      shopId,
      staffUserId,
      date,
      status: AttendanceStatus.PRESENT,
      markedBy: AttendanceMarkedBy.SELF,
      markedByUserId: staffUserId,
    });
  }
  row.checkInAt = new Date();
  row.status = AttendanceStatus.PRESENT;
  return repo.save(row);
}

export async function selfCheckOut(
  _shopId: string,
  staffUserId: string,
): Promise<MedicineShopAttendance> {
  const repo = AppDataSource.getRepository(MedicineShopAttendance);
  const date = todayIso();
  const row = await repo.findOne({ where: { staffUserId, date } });
  if (!row?.checkInAt) {
    throw AppError.badRequest("You haven't checked in today");
  }
  if (row.checkOutAt) {
    throw AppError.badRequest('Already checked out today');
  }
  row.checkOutAt = new Date();
  return repo.save(row);
}

export async function getMyTodayAttendance(
  staffUserId: string,
): Promise<MedicineShopAttendance | null> {
  return AppDataSource.getRepository(MedicineShopAttendance).findOne({
    where: { staffUserId, date: todayIso() },
  });
}

// Owner/manager (shop_attendance.manage) marking or correcting a staff
// member's attendance for a given day — always wins over a self-marked
// row for the same date, since the manual record is presumed to be the
// ground truth correction.
export async function markAttendance(
  shopId: string,
  staffUserId: string,
  date: string,
  status: AttendanceStatus,
  markedByUserId: string,
  notes?: string,
): Promise<MedicineShopAttendance> {
  const repo = AppDataSource.getRepository(MedicineShopAttendance);
  let row = await repo.findOne({ where: { staffUserId, date } });
  if (!row) {
    row = repo.create({ shopId, staffUserId, date });
  }
  row.status = status;
  row.markedBy = AttendanceMarkedBy.OWNER;
  row.markedByUserId = markedByUserId;
  if (notes !== undefined) row.notes = notes;
  return repo.save(row);
}

export async function listAttendance(
  shopId: string,
  filters: { staffUserId?: string; from?: string; to?: string },
): Promise<MedicineShopAttendance[]> {
  const qb = AppDataSource.getRepository(MedicineShopAttendance)
    .createQueryBuilder('a')
    .where('a.shop_id = :shopId', { shopId });
  if (filters.staffUserId) qb.andWhere('a.staff_user_id = :staffUserId', { staffUserId: filters.staffUserId });
  if (filters.from) qb.andWhere('a.date >= :from', { from: filters.from });
  if (filters.to) qb.andWhere('a.date <= :to', { to: filters.to });
  qb.orderBy('a.date', 'DESC');
  return qb.getMany();
}

export interface MonthAttendanceSummary {
  presentDays: number;
  halfDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
}

// month is 'YYYY-MM'. Only counts days that actually have an attendance
// row — a day with no row at all contributes to neither bucket, which
// means it's implicitly unpaid when payroll pro-rates against the
// month's total calendar days (see payroll.util.ts). This is
// deliberate: the shop must actively record attendance (via self
// check-in or a manual mark) for a day to count as paid.
export async function getMonthAttendanceSummary(
  staffUserId: string,
  month: string,
): Promise<MonthAttendanceSummary> {
  const rows = await AppDataSource.getRepository(MedicineShopAttendance)
    .createQueryBuilder('a')
    .where('a.staff_user_id = :staffUserId', { staffUserId })
    .andWhere(`to_char(a.date, 'YYYY-MM') = :month`, { month })
    .getMany();

  const summary: MonthAttendanceSummary = {
    presentDays: 0,
    halfDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    absentDays: 0,
  };
  for (const row of rows) {
    if (row.status === AttendanceStatus.PRESENT) summary.presentDays += 1;
    else if (row.status === AttendanceStatus.HALF_DAY) summary.halfDays += 1;
    else if (row.status === AttendanceStatus.ABSENT) summary.absentDays += 1;
    // LEAVE rows are counted separately by leave.util.ts (which knows
    // paid vs unpaid from the originating leave request) rather than
    // here, since this table alone can't tell the two apart.
  }
  return summary;
}

import { DoctorAvailability, DayOfWeek } from '../entities/DoctorAvailability';
import { Booking, BookingStatus } from '../entities/Booking';

export interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

const DAY_MAP: Record<number, DayOfWeek> = {
  0: DayOfWeek.SUNDAY,
  1: DayOfWeek.MONDAY,
  2: DayOfWeek.TUESDAY,
  3: DayOfWeek.WEDNESDAY,
  4: DayOfWeek.THURSDAY,
  5: DayOfWeek.FRIDAY,
  6: DayOfWeek.SATURDAY,
};

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function generateAvailableSlots(
  availability: DoctorAvailability[],
  existingBookings: Booking[],
  date: Date,
): TimeSlot[] {
  const dayOfWeek = DAY_MAP[date.getDay()];
  if (!dayOfWeek) return [];

  const dayAvailability = availability.filter(
    (a) => a.dayOfWeek === dayOfWeek && a.isActive,
  );

  if (dayAvailability.length === 0) return [];

  const bookedTimes = new Set<string>(
    existingBookings
      .filter((b) => b.status !== BookingStatus.CANCELLED)
      .map((b) => {
        const d = new Date(b.scheduledAt);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }),
  );

  const slots: TimeSlot[] = [];

  for (const avail of dayAvailability) {
    const startMinutes = timeToMinutes(avail.startTime);
    const endMinutes = timeToMinutes(avail.endTime);
    const duration = avail.slotDurationMinutes;

    for (
      let current = startMinutes;
      current + duration <= endMinutes;
      current += duration
    ) {
      const slotStart = minutesToTime(current);
      const slotEnd = minutesToTime(current + duration);
      slots.push({
        startTime: slotStart,
        endTime: slotEnd,
        available: !bookedTimes.has(slotStart),
      });
    }
  }

  return slots;
}

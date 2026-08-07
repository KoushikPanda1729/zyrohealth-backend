import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { BookingsService } from './bookings.service';
import { success, paginated } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { CreateBookingDtoType } from './bookings.dto';

@injectable()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  createBooking = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const booking = await this.bookingsService.createBooking(
        req.user.id,
        req.body as CreateBookingDtoType,
      );
      res.status(201).json(success(booking, 'Booking created'));
    } catch (err) {
      next(err);
    }
  };

  listBookings = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id || !req.user.role) throw AppError.unauthorized();
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const { data, total } = await this.bookingsService.listBookings(
        req.user.id,
        req.user.role,
        page,
        limit,
      );
      res.status(200).json(paginated(data, total, page, limit));
    } catch (err) {
      next(err);
    }
  };

  getBookingById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const booking = await this.bookingsService.getBookingById(
        id,
        req.user.id,
      );
      res.status(200).json(success(booking));
    } catch (err) {
      next(err);
    }
  };

  cancelBooking = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id || !req.user.role) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const { reason } = req.body as { reason?: string };
      const result = await this.bookingsService.cancelBooking(
        id,
        req.user.id,
        req.user.role,
        reason,
      );
      const msg = result.refundInitiated
        ? 'Booking cancelled and refund initiated'
        : 'Booking cancelled';
      res.status(200).json(success(result, msg));
    } catch (err) {
      next(err);
    }
  };

  joinRoom = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id || !req.user.role) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const result = await this.bookingsService.joinRoom(
        id,
        req.user.id,
        req.user.role,
      );
      res.status(200).json(success(result));
    } catch (err) {
      next(err);
    }
  };

  completeBooking = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const booking = await this.bookingsService.completeBooking(
        id,
        req.user.id,
      );
      res.status(200).json(success(booking, 'Booking completed'));
    } catch (err) {
      next(err);
    }
  };

  agentCreateBooking = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { patientName, patientPhone, doctorId, scheduledAt } = req.body as {
        patientName: string;
        patientPhone: string;
        doctorId: string;
        scheduledAt: string;
      };
      if (!patientName || !patientPhone || !doctorId || !scheduledAt) {
        throw AppError.badRequest(
          'patientName, patientPhone, doctorId, and scheduledAt are required',
        );
      }
      const booking = await this.bookingsService.agentCreateBooking({
        patientName,
        patientPhone,
        doctorId,
        scheduledAt,
      });
      res.status(201).json(success(booking, 'Booking created by agent'));
    } catch (err) {
      next(err);
    }
  };
}

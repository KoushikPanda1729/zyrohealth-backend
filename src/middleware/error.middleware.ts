import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { QueryFailedError } from 'typeorm';
import { AppError } from '../utils/app-error';
import { env } from '../config/env';

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  if (err instanceof QueryFailedError) {
    const driverError = err.driverError as { code?: string };
    if (driverError?.code === '23505') {
      res.status(409).json({
        success: false,
        error: 'Resource already exists',
        code: 'CONFLICT',
      });
      return;
    }
  }

  const message =
    env.NODE_ENV === 'production' ? 'Internal server error' : String(err);
  res.status(500).json({
    success: false,
    error: message,
    code: 'INTERNAL_ERROR',
  });
}

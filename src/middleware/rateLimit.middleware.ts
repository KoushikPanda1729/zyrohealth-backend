import { rateLimit } from 'express-rate-limit';

// TEMP: raised for load testing — revert to 300 before merging back to normal use.
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1_000_000,
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many attempts, please try again later.' },
});

export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI message limit reached, please try again later.' },
});

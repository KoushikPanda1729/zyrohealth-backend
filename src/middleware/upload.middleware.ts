import multer from 'multer';
import { AppError } from '../utils/app-error';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

const MAX_SIZE_MB = 10;

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(AppError.badRequest('Only JPEG, PNG, WEBP and PDF files are allowed'));
    }
  },
});

// Browsers/OSes report .csv inconsistently (text/csv, application/vnd.ms-excel,
// or a generic application/octet-stream) — the actual gate against garbage
// content is the extension check + row parsing in catalog-import.util.ts,
// this filter is just a first-pass sanity check.
const SPREADSHEET_MIME_TYPES = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
];
const MAX_SPREADSHEET_SIZE_MB = 5;

export const catalogUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SPREADSHEET_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const hasSpreadsheetExtension = /\.(csv|xlsx?)$/i.test(file.originalname);
    if (
      SPREADSHEET_MIME_TYPES.includes(file.mimetype) &&
      hasSpreadsheetExtension
    ) {
      cb(null, true);
    } else {
      cb(AppError.badRequest('Only .csv and .xlsx files are allowed'));
    }
  },
});

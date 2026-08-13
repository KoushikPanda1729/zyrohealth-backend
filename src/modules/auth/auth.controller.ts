import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { AuthService } from './auth.service';
import { success } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

@injectable()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  sendOtp = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { phone, channel } = req.body as {
        phone: string;
        channel?: 'sms' | 'whatsapp';
      };
      await this.authService.sendOtp(phone, channel);
      res.status(200).json(success(null, 'OTP sent successfully'));
    } catch (err) {
      next(err);
    }
  };

  verifyOtp = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { phone, code, role, tenantId } = req.body as {
        phone: string;
        code: string;
        role?: 'patient' | 'doctor';
        tenantId?: string;
      };
      const { user, accessToken, refreshToken, isNewUser } =
        await this.authService.verifyOtpAndLogin(phone, code, role, tenantId);
      res
        .status(200)
        .json(
          success(
            { user, accessToken, refreshToken, role: user.role, isNewUser },
            isNewUser ? 'Registered successfully' : 'Logged in successfully',
          ),
        );
    } catch (err) {
      next(err);
    }
  };

  me = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.uid) throw AppError.unauthorized();
      const user = await this.authService.getCurrentUser(req.user.uid);
      if (!user) throw AppError.notFound('User');
      res.status(200).json(success(user));
    } catch (err) {
      next(err);
    }
  };

  updateMe = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.uid) throw AppError.unauthorized();
      const { fullName, email, bio } = req.body as {
        fullName?: string;
        email?: string;
        bio?: string;
      };
      const user = await this.authService.updateMe(req.user.uid, {
        fullName,
        email,
        bio,
      });
      res.status(200).json(success(user, 'Profile updated'));
    } catch (err) {
      next(err);
    }
  };

  verifyInvite = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { token } = req.query as { token?: string };
      if (!token) throw AppError.badRequest('token is required');
      const result = await this.authService.verifyInviteToken(token);
      res.status(200).json(success(result));
    } catch (err) {
      next(err);
    }
  };

  acceptInvite = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { token, newPassword } = req.body as {
        token?: string;
        newPassword?: string;
      };
      if (!token || !newPassword) {
        throw AppError.badRequest('token and newPassword are required');
      }
      if (newPassword.length < 8) {
        throw AppError.badRequest('Password must be at least 8 characters');
      }
      const result = await this.authService.acceptInvite(token, newPassword);
      res.status(200).json(success(result));
    } catch (err) {
      next(err);
    }
  };

  changePassword = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.uid) throw AppError.unauthorized();
      const { currentPassword, newPassword } = req.body as {
        currentPassword?: string;
        newPassword?: string;
      };
      if (!currentPassword || !newPassword) {
        throw AppError.badRequest(
          'currentPassword and newPassword are required',
        );
      }
      if (newPassword.length < 8) {
        throw AppError.badRequest('New password must be at least 8 characters');
      }
      await this.authService.changePassword(
        req.user.uid,
        currentPassword,
        newPassword,
      );
      res.status(200).json(success(null, 'Password updated'));
    } catch (err) {
      next(err);
    }
  };

  uploadAvatar = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.uid) throw AppError.unauthorized();
      if (!req.file) throw AppError.badRequest('file is required');
      const user = await this.authService.uploadAvatar(req.user.uid, req.file);
      res.status(200).json(success(user, 'Photo updated'));
    } catch (err) {
      next(err);
    }
  };

  generateBio = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { fullName, roleLabel, bio } = req.body as {
        fullName?: string;
        roleLabel?: string;
        bio?: string;
      };
      const value = await this.authService.generateBio({
        fullName,
        roleLabel,
        bio,
      });
      res.status(200).json(success({ value }));
    } catch (err) {
      next(err);
    }
  };

  logout = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { refreshToken } = req.body as { refreshToken?: string };
      if (refreshToken) {
        await this.authService.revokeRefreshToken(refreshToken);
      }
      res.status(200).json(success(null, 'Logged out successfully'));
    } catch (err) {
      next(err);
    }
  };

  refresh = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { refreshToken } = req.body as { refreshToken: string };
      if (!refreshToken) throw AppError.badRequest('Refresh token is required');
      const tokens = await this.authService.refreshAccessToken(refreshToken);
      res.status(200).json(success(tokens, 'Token refreshed'));
    } catch (err) {
      next(err);
    }
  };

  adminRegister = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { email, password, fullName } = req.body as {
        email: string;
        password: string;
        fullName: string;
      };
      if (!email) throw AppError.badRequest('Email is required');
      if (!password || password.length < 8)
        throw AppError.badRequest('Password must be at least 8 characters');
      if (!fullName) throw AppError.badRequest('Full name is required');
      const { user, accessToken, refreshToken } =
        await this.authService.adminRegister(email, password, fullName);
      res
        .status(201)
        .json(
          success({ user, accessToken, refreshToken }, 'Admin account created'),
        );
    } catch (err) {
      next(err);
    }
  };

  adminLogin = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { email, password } = req.body as {
        email: string;
        password: string;
      };
      if (!email) throw AppError.badRequest('Email is required');
      if (!password) throw AppError.badRequest('Password is required');
      // Set by the admin frontend to the hostname it's actually being
      // viewed on (window.location.host) — the request itself always hits
      // api.zyrohealthai.com regardless of which tenant subdomain the user
      // is on, so that context would otherwise be lost.
      const portalHost = req.get('x-portal-host');
      const { user, accessToken, refreshToken } =
        await this.authService.adminLogin(email, password, portalHost);
      res
        .status(200)
        .json(
          success(
            { user, accessToken, refreshToken, role: user.role },
            'Logged in successfully',
          ),
        );
    } catch (err) {
      next(err);
    }
  };
}

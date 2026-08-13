import { injectable, inject } from 'tsyringe';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { IAuthProvider } from '../../providers/auth/auth.provider.interface';
import { IWhatsAppProvider } from '../../providers/whatsapp/whatsapp.provider.interface';
import { IStorageProvider } from '../../providers/storage/storage.provider.interface';
import { IAiProvider } from '../../providers/ai/ai.provider.interface';
import {
  AUTH_PROVIDER,
  WHATSAPP_PROVIDER,
  STORAGE_PROVIDER,
  AI_PROVIDER,
} from '../../config/container';
import { AppDataSource } from '../../config/database';
import { User, UserRole } from '../../entities/User';
import { DoctorProfile } from '../../entities/DoctorProfile';
import { OtpCode } from '../../entities/OtpCode';
import { RefreshToken } from '../../entities/RefreshToken';
import { InviteToken } from '../../entities/InviteToken';
import { Tenant } from '../../entities/Tenant';
import { env } from '../../config/env';
import { AppError } from '../../utils/app-error';
import { generateAndStoreOtp } from '../../utils/otp.util';
import { getDefaultTenantId } from '../tenancy/permissions.util';
import { RESERVED_SUBDOMAINS } from '../../utils/subdomain.util';

// portalHost is the browser's actual Host header (e.g.
// "apollo-clinic.zyrohealthai.com"), sent explicitly by the frontend via
// X-Portal-Host — see auth.controller.ts#adminLogin for why the request's
// own hostname can't be used (it always targets api.zyrohealthai.com).
function extractTenantSubdomain(portalHost: string | undefined): string | null {
  if (!portalHost || !env.TENANT_ROOT_DOMAIN) return null;
  const host = portalHost.split(':')[0].toLowerCase();
  const suffix = `.${env.TENANT_ROOT_DOMAIN.toLowerCase()}`;
  if (!host.endsWith(suffix)) return null;
  const subdomain = host.slice(0, -suffix.length);
  if (!subdomain || subdomain.includes('.') || RESERVED_SUBDOMAINS.has(subdomain)) {
    return null;
  }
  return subdomain;
}

@injectable()
export class AuthService {
  constructor(
    @inject(AUTH_PROVIDER) private readonly authProvider: IAuthProvider,
    @inject(WHATSAPP_PROVIDER)
    private readonly whatsAppProvider: IWhatsAppProvider,
    @inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    @inject(AI_PROVIDER) private readonly ai: IAiProvider,
  ) {}

  // Public — also used by PlatformService for super-admin tenant impersonation.
  async issueTokens(
    user: User,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = jwt.sign(
      {
        uid: user.firebaseUid,
        phone: user.phoneNumber,
        email: user.email,
        id: user.id,
      },
      env.JWT_SECRET,
      { expiresIn: '1h' },
    );

    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const refreshTokenRecord = AppDataSource.getRepository(RefreshToken).create(
      {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    );
    await AppDataSource.getRepository(RefreshToken).save(refreshTokenRecord);

    return { accessToken, refreshToken: rawRefreshToken };
  }

  async sendOtp(
    phone: string,
    channel: 'sms' | 'whatsapp' = 'sms',
  ): Promise<void> {
    if (channel === 'whatsapp') {
      const code = await generateAndStoreOtp(phone);
      await this.whatsAppProvider.sendText(
        phone,
        `${code} is your ZyroHealth verification code. Valid for 10 minutes. Do not share this with anyone.`,
      );
      return;
    }
    await this.authProvider.sendOtp(phone);
  }

  async verifyOtpAndLogin(
    phone: string,
    code: string,
    role: 'patient' | 'doctor' = 'patient',
    tenantId?: string,
  ): Promise<{
    user: User;
    accessToken: string;
    refreshToken: string;
    isNewUser: boolean;
  }> {
    const repo = AppDataSource.getRepository(OtpCode);
    const otp = await repo.findOne({
      where: { phoneNumber: phone, code, verified: false },
      order: { createdAt: 'DESC' },
    });

    if (!otp) throw AppError.unprocessable('Invalid OTP');
    if (otp.expiresAt < new Date()) throw AppError.unprocessable('OTP expired');

    otp.verified = true;
    await repo.save(otp);

    // No per-tenant signup surface exists yet — each tenant's own
    // booking link/app instance would pass its own tenantId; requests
    // that omit it (today's app) fall back to the default tenant. A phone
    // number can belong to a different User row per tenant, so the lookup
    // itself must be tenant-scoped too.
    const resolvedTenantId = tenantId ?? (await getDefaultTenantId());

    const userRepo = AppDataSource.getRepository(User);
    let isNewUser = false;
    let user = await userRepo.findOne({
      where: { phoneNumber: phone, tenantId: resolvedTenantId },
      relations: ['patientProfile', 'doctorProfile'],
    });

    if (!user) {
      isNewUser = true;
      user = userRepo.create({
        firebaseUid: `phone_${resolvedTenantId}_${phone}`,
        phoneNumber: phone,
        role: role === 'doctor' ? UserRole.DOCTOR : UserRole.PATIENT,
        isActive: true,
        tenantId: resolvedTenantId,
      });
      await userRepo.save(user);

      if (role === 'doctor') {
        const profileRepo = AppDataSource.getRepository(DoctorProfile);
        const existing = await profileRepo.findOne({
          where: { userId: user.id },
        });
        if (!existing) {
          await profileRepo.save(
            profileRepo.create({
              userId: user.id,
              tenantId: resolvedTenantId,
            }),
          );
        }
      }
    }

    const { accessToken, refreshToken } = await this.issueTokens(user);
    return { user, accessToken, refreshToken, isNewUser };
  }

  async getCurrentUser(uid: string): Promise<User | null> {
    const user = await AppDataSource.getRepository(User).findOne({
      where: { firebaseUid: uid },
      relations: ['patientProfile', 'doctorProfile'],
    });
    if (!user) return null;
    return this.hydrateAvatarUrl(user);
  }

  async updateMe(
    uid: string,
    data: { fullName?: string; email?: string; bio?: string },
  ): Promise<User> {
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({ where: { firebaseUid: uid } });
    if (!user) throw AppError.notFound('User');
    if (data.fullName !== undefined) user.fullName = data.fullName;
    if (data.email !== undefined) user.email = data.email;
    if (data.bio !== undefined) user.bio = data.bio;
    const saved = await repo.save(user);
    return this.hydrateAvatarUrl(saved);
  }

  // ── Invite links ──────────────────────────────────────────────────────
  // Used when a tenant admin invites staff, or a super admin creates a
  // tenant admin, without setting a password up front. The account is
  // created with no passwordHash (login is blocked until the invite is
  // accepted), and this raw one-time token is embedded in a link shown to
  // whoever created the invite to copy/share — there's no email-sending
  // provider wired up yet, so nothing is actually emailed automatically.

  async createInviteToken(userId: string): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const repo = AppDataSource.getRepository(InviteToken);
    await repo.save(repo.create({ userId, tokenHash, expiresAt }));
    return rawToken;
  }

  buildInviteLink(rawToken: string): string {
    return `${env.ADMIN_PANEL_URL}/accept-invite?token=${rawToken}`;
  }

  private async findValidInvite(rawToken: string): Promise<InviteToken> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const invite = await AppDataSource.getRepository(InviteToken).findOne({
      where: { tokenHash },
    });
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      throw AppError.badRequest('This invite link is invalid or has expired');
    }
    return invite;
  }

  async verifyInviteToken(
    rawToken: string,
  ): Promise<{ fullName?: string; email?: string }> {
    const invite = await this.findValidInvite(rawToken);
    const user = await AppDataSource.getRepository(User).findOne({
      where: { id: invite.userId },
    });
    if (!user) throw AppError.notFound('User');
    return { fullName: user.fullName, email: user.email };
  }

  async acceptInvite(
    rawToken: string,
    newPassword: string,
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const invite = await this.findValidInvite(rawToken);

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: invite.userId } });
    if (!user) throw AppError.notFound('User');

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await userRepo.save(user);

    invite.usedAt = new Date();
    await AppDataSource.getRepository(InviteToken).save(invite);

    const { accessToken, refreshToken } = await this.issueTokens(user);
    return { user, accessToken, refreshToken };
  }

  // Only meaningful for admin/super_admin accounts (email+password login) —
  // patient/doctor accounts authenticate via OTP and have no passwordHash.
  async changePassword(
    uid: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const repo = AppDataSource.getRepository(User);
    const user = await repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.firebaseUid = :uid', { uid })
      .getOne();
    if (!user) throw AppError.notFound('User');
    if (!user.passwordHash) {
      throw AppError.badRequest(
        'Password login is not enabled for this account',
      );
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw AppError.unauthorized('Current password is incorrect');

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await repo.save(user);
  }

  async uploadAvatar(uid: string, file: Express.Multer.File): Promise<User> {
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({ where: { firebaseUid: uid } });
    if (!user) throw AppError.notFound('User');

    const ext = file.originalname.split('.').pop() ?? 'jpg';
    const key = `avatars/${user.id}/${Date.now()}.${ext}`;
    user.avatarUrl = await this.storage.upload(key, file.buffer, file.mimetype);
    const saved = await repo.save(user);
    return this.hydrateAvatarUrl(saved);
  }

  // Stored avatar URLs are the raw (private) S3 object URL, not a usable
  // signed link — same convention as doctor documents and AI chat images
  // elsewhere in the app. Resolve it to a short-lived signed URL on read.
  private async hydrateAvatarUrl(user: User): Promise<User> {
    if (!user.avatarUrl) return user;
    const s3Pattern = /\.s3\.[^.]+\.amazonaws\.com\//;
    if (!s3Pattern.test(user.avatarUrl)) return user;
    try {
      const key = new URL(user.avatarUrl).pathname.slice(1);
      const signedUrl = await this.storage.getSignedUrl(key, 3600);
      return { ...user, avatarUrl: signedUrl };
    } catch {
      return user;
    }
  }

  // Generates a short professional bio for the account profile page — the
  // same per-field AI-assist pattern used for AI doctor personas and real
  // doctor profiles (admin.service.ts), applied to the logged-in staff
  // member's own account.
  async generateBio(context: {
    fullName?: string;
    roleLabel?: string;
    bio?: string;
  }): Promise<string> {
    const contextLines = [
      context.fullName && `Name: ${context.fullName}`,
      context.roleLabel && `Role at ZyroHealth: ${context.roleLabel}`,
      context.bio && `Existing bio so far: ${context.bio}`,
    ]
      .filter(Boolean)
      .join('\n');

    const VARIATION_HINTS = [
      'Lean into a warm, approachable tone for this one.',
      'Lean into a crisp, professional, no-nonsense tone for this one.',
      'Lean into a confident, experienced-operator tone for this one.',
      'Lean into a friendly, down-to-earth tone for this one.',
    ];
    const variationHint =
      VARIATION_HINTS[Math.floor(Math.random() * VARIATION_HINTS.length)];

    const prompt = `Write a warm, professional 2-3 sentence bio for this ZyroHealth staff member's account profile, first person ("I ..."), naturally referencing their role if known.\n\n${variationHint}\n\n${contextLines || 'No other details given — write a short, plausible generic staff bio.'}\n\nThis may be regenerated multiple times — give a genuinely different, fresh alternative each time rather than the most generic answer.\n\nReturn ONLY the bio text itself — no quotes, no markdown, no explanation, no labels.`;

    const result = await this.ai.chat({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt:
        'You generate varied, professional account-profile bios for staff on a telemedicine admin panel. Follow the instruction exactly and return only the requested value. Never repeat the same phrasing you might have used before — always produce a fresh take.',
      patientContext: {
        bloodGroup: '',
        allergies: [],
        chronicConditions: [],
        history: [],
      },
      sessionId: 'account-bio-generation',
    });

    return result.reply.trim().replace(/^["'`]|["'`]$/g, '');
  }

  // Bootstraps the single, global super admin — a one-time setup step, not
  // a general admin-provisioning mechanism. Tenant admins are created
  // exclusively through the platform module's tenant-creation/invite flow
  // (never public self-registration).
  async adminRegister(
    email: string,
    password: string,
    fullName: string,
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const userRepo = AppDataSource.getRepository(User);

    const existing = await userRepo.findOne({ where: { email } });
    if (existing) throw AppError.conflict('Email already in use');

    const superAdminCount = await userRepo.count({
      where: { role: UserRole.SUPER_ADMIN },
    });
    if (superAdminCount > 0) {
      throw AppError.forbidden(
        'Super admin account already exists. Use login instead.',
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = userRepo.create({
      firebaseUid: `admin_${email}`,
      email,
      fullName,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      tenantId: null,
      isActive: true,
    });
    await userRepo.save(user);

    const { accessToken, refreshToken } = await this.issueTokens(user);
    return { user, accessToken, refreshToken };
  }

  async adminLogin(
    email: string,
    password: string,
    portalHost?: string,
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const userRepo = AppDataSource.getRepository(User);

    const user = await userRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email AND u.role IN (:...roles)', {
        email,
        roles: [
          UserRole.ADMIN,
          UserRole.SUPER_ADMIN,
          UserRole.SHOP,
          UserRole.PLATFORM_SUPPORT,
        ],
      })
      .getOne();

    if (!user) throw AppError.unauthorized('Invalid email or password');
    if (!user.isActive) throw AppError.forbidden('Account is banned');
    if (!user.passwordHash)
      throw AppError.unauthorized('Invalid email or password');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw AppError.unauthorized('Invalid email or password');

    // Checked only after credentials pass, so a wrong-portal attempt never
    // reveals anything an invalid-password attempt wouldn't. Tenant-less
    // users (super_admin) skip this entirely and can log in from any
    // portal or the generic admin domain.
    const subdomain = extractTenantSubdomain(portalHost);
    if (subdomain) {
      const tenant = await AppDataSource.getRepository(Tenant).findOne({
        where: { subdomain },
      });
      if (!tenant) throw AppError.notFound('This portal does not exist');
      if (user.tenantId && user.tenantId !== tenant.id) {
        throw AppError.forbidden(
          'This account does not belong to this portal',
        );
      }
    }

    const { accessToken, refreshToken } = await this.issueTokens(user);
    return { user, accessToken, refreshToken };
  }

  async refreshAccessToken(
    rawRefreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

    const record = await AppDataSource.getRepository(RefreshToken).findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!record) throw AppError.unauthorized('Invalid refresh token');
    if (record.revokedAt)
      throw AppError.unauthorized('Refresh token has been revoked');
    if (record.expiresAt < new Date())
      throw AppError.unauthorized('Refresh token expired');
    if (!record.user.isActive) throw AppError.forbidden('Account is banned');

    // Revoke old token (rotation)
    record.revokedAt = new Date();
    await AppDataSource.getRepository(RefreshToken).save(record);

    const { accessToken, refreshToken } = await this.issueTokens(record.user);
    return { accessToken, refreshToken };
  }

  async revokeRefreshToken(rawRefreshToken: string): Promise<void> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');
    const record = await AppDataSource.getRepository(RefreshToken).findOne({
      where: { tokenHash },
    });
    if (record && !record.revokedAt) {
      record.revokedAt = new Date();
      await AppDataSource.getRepository(RefreshToken).save(record);
    }
  }
}

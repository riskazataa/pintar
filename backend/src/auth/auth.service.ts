import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RegistrationStatus } from '@prisma/client';
import { ResetPasswordDto } from './dto/password-reset.dto';

const RESET_VALIDITY_MINUTES = 30;
const RESET_VALIDITY_MS = RESET_VALIDITY_MINUTES * 60_000;
const RESET_COOLDOWN_MS = 5 * 60_000;

function resetDigest(token: string, email: string, passwordHash: string) {
  return createHash('sha256').update(JSON.stringify([token, email, passwordHash])).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.role === 'UNIT' && !dto.satker_id) {
      throw new BadRequestException('satker_id wajib diisi untuk role UNIT');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        no_hp: dto.no_hp,
        nama_lengkap: dto.nama_lengkap,
        role: dto.role,
        satker_id: dto.satker_id ?? null,
      },
    });

    const { password, ...result } = user;
    return result;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { satker: true },
    });

    if (!user) {
      throw new UnauthorizedException('Email atau password salah');
    }

    if (user.status_registrasi === 'PENDING') {
      throw new ForbiddenException('Akun belum disetujui admin');
    }

    if (user.status_registrasi === 'REJECTED') {
      throw new ForbiddenException('Akun ditolak');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email atau password salah');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      satker_id: user.satker_id,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        nama_lengkap: user.nama_lengkap,
        no_hp: user.no_hp,
        role: user.role,
        satker_id: user.satker_id,
        satker: user.satker,
      },
    };
  }

  async forgotPassword(email: string) {
    if (!this.emailService.canSendPasswordReset()) {
      throw new ServiceUnavailableException('Pengiriman tautan reset belum tersedia. Silakan hubungi admin.');
    }
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, password: true, status_registrasi: true },
    });

    if (user?.status_registrasi === 'APPROVED') {
      const token = randomBytes(32).toString('hex');
      const now = Date.now();
      const data = {
        token_hash: resetDigest(token, user.email, user.password),
        expires_at: new Date(now + RESET_VALIDITY_MS),
      };
      const created = await this.prisma.passwordReset.createMany({
        data: { user_id: user.id, ...data },
        skipDuplicates: true,
      });
      const issued = created.count > 0 || (await this.prisma.passwordReset.updateMany({
        where: {
          user_id: user.id,
          expires_at: { lte: new Date(now + RESET_VALIDITY_MS - RESET_COOLDOWN_MS) },
        },
        data,
      })).count > 0;

      if (issued) {
        void this.emailService.sendPasswordReset(user.email, user.id, token, RESET_VALIDITY_MINUTES)
          .catch(() => this.logger.error('Gagal mengirim email reset kata sandi melalui Resend.'));
      }
    }

    return { message: 'Jika akun aktif terdaftar, tautan reset akan dikirim. Periksa kotak masuk dan folder Spam.' };
  }

  async resetPassword({ userId, token, password }: ResetPasswordDto) {
    const invalidLink = () => new BadRequestException('Tautan reset tidak valid, sudah digunakan, atau kedaluwarsa.');
    const reset = await this.prisma.passwordReset.findUnique({
      where: { user_id: userId },
      include: { user: { select: { email: true, password: true, status_registrasi: true } } },
    });
    if (!reset || reset.expires_at <= new Date() || reset.user.status_registrasi !== 'APPROVED') {
      throw invalidLink();
    }
    const digest = resetDigest(token, reset.user.email, reset.user.password);
    if (!timingSafeEqual(Buffer.from(reset.token_hash, 'hex'), Buffer.from(digest, 'hex'))) {
      throw invalidLink();
    }
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException('Kata sandi melebihi batas ukuran. Gunakan kata sandi yang lebih pendek.');
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordReset.deleteMany({
        where: { user_id: userId, token_hash: digest, expires_at: { gt: new Date() } },
      });
      if (!consumed.count) throw invalidLink();
      const updated = await tx.user.updateMany({
        where: {
          id: userId,
          email: reset.user.email,
          password: reset.user.password,
          status_registrasi: 'APPROVED',
        },
        data: { password: hashedPassword },
      });
      if (!updated.count) throw invalidLink();
    });
  }

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nama_lengkap: true,
        no_hp: true,
        role: true,
        status_registrasi: true,
        satker_id: true,
        satker: { select: { id: true, nama_satker: true } },
      },
    });
    if (!user) throw new NotFoundException('Akun tidak ditemukan');
    return user;
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!currentUser) throw new NotFoundException('Akun tidak ditemukan');

    const data: {
      nama_lengkap?: string;
      email?: string;
      no_hp?: string | null;
      password?: string;
    } = {};

    if (dto.nama_lengkap !== undefined) {
      const nama = dto.nama_lengkap.trim();
      if (!nama) throw new BadRequestException('Nama lengkap wajib diisi');
      data.nama_lengkap = nama;
    }

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existing && existing.id !== userId) throw new ConflictException('Email sudah digunakan akun lain');
      data.email = email;
    }

    if (dto.no_hp !== undefined) data.no_hp = dto.no_hp.trim() || null;

    if (dto.new_password) {
      if (!dto.current_password) throw new BadRequestException('Password saat ini wajib diisi untuk mengganti password');
      const isCurrentPasswordValid = await bcrypt.compare(dto.current_password, currentUser.password);
      if (!isCurrentPasswordValid) throw new UnauthorizedException('Password saat ini tidak sesuai');
      data.password = await bcrypt.hash(dto.new_password, 12);
    }

    if (Object.keys(data).length === 0) return this.getProfile(userId);
    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getProfile(userId);
  }

  async verifyUserRegistration(id: number, status: RegistrationStatus) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { status_registrasi: status },
    });

    await this.emailService.sendRegistrationNotification(
      updatedUser.email,
      status,
      updatedUser.nama_lengkap,
    );

    const { password, ...result } = updatedUser;
    return result;
  }

  async getTimPenilai() {
    return this.prisma.user.findMany({
      where: {
        role: 'REVIEWER',
        status_registrasi: 'APPROVED',
      },
      select: {
        id: true,
        nama_lengkap: true,
        role: true,
      },
    });
  }
}

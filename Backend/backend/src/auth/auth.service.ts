import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RegistrationStatus } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.role === 'SATKER' && !dto.satker_id) {
      throw new BadRequestException('satker_id wajib diisi untuk role SATKER');
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
        role: user.role,
        satker_id: user.satker_id,
        satker: user.satker,
      },
    };
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
        role: { in: ['SUPER_ADMIN', 'TIM_PENILAI_MARVEL'] },
      },
      select: {
        id: true,
        nama_lengkap: true,
        role: true,
      },
    });
  }
}

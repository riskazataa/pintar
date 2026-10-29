import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegistrationStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserByStatus(status: RegistrationStatus) {
    return this.prisma.user.findMany({
      where: { status_registrasi: status },
      select: {
        id: true,
        email: true,
        nama_lengkap: true,
        role: true,
        status_registrasi: true,
        satker_id: true,
        satker: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  async deleteUser(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    return this.prisma.user.delete({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nama_lengkap: true,
        role: true,
      },
    });
  }

  async getStats() {
    const [pendingCount, approvedCount, rejectedCount, satkerCount] =
      await Promise.all([
        this.prisma.user.count({ where: { status_registrasi: 'PENDING' } }),
        this.prisma.user.count({ where: { status_registrasi: 'APPROVED' } }),
        this.prisma.user.count({ where: { status_registrasi: 'REJECTED' } }),
        this.prisma.satker.count(),
      ]);
    return {
      active: approvedCount,
      waiting: pendingCount,
      approved: approvedCount,
      total_satker: satkerCount,
    };
  }
}

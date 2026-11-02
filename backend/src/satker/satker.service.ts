import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSatkerDto } from './dto/create-satker.dto';
import { UpdateSatkerDto } from './dto/update-satker.dto';

@Injectable()
export class SatkerService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.satker.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number) {
    const satker = await this.prisma.satker.findUnique({
      where: { id },
    });

    if (!satker) {
      throw new NotFoundException('Satker tidak ditemukan');
    }

    return satker;
  }

  async create(dto: CreateSatkerDto) {
    return this.prisma.satker.create({
      data: { nama_satker: dto.nama_satker },
    });
  }

  async update(id: number, dto: UpdateSatkerDto) {
    await this.findOne(id);

    return this.prisma.satker.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.satker.delete({
      where: { id },
    });
  }
}

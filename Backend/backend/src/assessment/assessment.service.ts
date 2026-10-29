import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

@Injectable()
export class AssessmentService {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveQuestions() {
    return this.prisma.assessmentQuestion.findMany({
      where: { parent_id: null, is_active: true },
      include: {
        children: {
          where: { is_active: true },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
    });
  }

  async findAllQuestions() {
    return this.prisma.assessmentQuestion.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async createQuestion(dto: CreateQuestionDto) {
    return this.prisma.assessmentQuestion.create({
      data: {
        pertanyaan: dto.pertanyaan,
        is_active: dto.is_active ?? true,
        parent_id: dto.parent_id ?? null,
      },
    });
  }

  async updateQuestion(id: number, dto: UpdateQuestionDto) {
    const existing = await this.prisma.assessmentQuestion.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Pertanyaan tidak ditemukan');
    }

    return this.prisma.assessmentQuestion.update({
      where: { id },
      data: dto,
    });
  }

  async removeQuestion(id: number) {
    const existing = await this.prisma.assessmentQuestion.findUnique({
      where: { id },
      include: { children: { select: { id: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Pertanyaan tidak ditemukan');
    }

    const childIds = existing.children.map((c) => c.id);

    return this.prisma.$transaction(async (tx) => {
      if (childIds.length > 0) {
        await tx.assessmentQuestion.updateMany({
          where: { id: { in: childIds } },
          data: { is_active: false },
        });
      }

      return tx.assessmentQuestion.update({
        where: { id },
        data: { is_active: false },
      });
    });
  }
}

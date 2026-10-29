import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import * as engine from './workflow';

type Actor = { sub: number; role: string; satker_id?: number | null };
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}
  admin(user: Actor) {
    if (user.role !== 'SUPER_ADMIN')
      throw new ForbiddenException(
        'Hanya admin yang dapat mengatur template dan reviewer',
      );
  }
  readAccess(item: { satker_id: number; workflow: unknown }, user: Actor) {
    if (user.role === 'SUPER_ADMIN') return;
    if (user.role === 'SATKER' && item.satker_id === user.satker_id) return;
    const w = item.workflow as engine.Workflow;
    if (w?.stages.some((s) => s.reviewer_ids.includes(user.sub))) return;
    throw new ForbiddenException('Anda tidak memiliki akses ke assessment ini');
  }
  async packages(user: Actor) {
    this.admin(user);
    const rows = await this.prisma.assessmentTemplatePackage.findMany({
      orderBy: { id: 'desc' },
    });
    return rows.map((p) => ({ ...p, config: engine.validateConfig(p.config) }));
  }
  async activePackage() {
    const pack = await this.prisma.assessmentTemplatePackage.findFirst({
      where: { published_at: { not: null } },
      orderBy: [{ published_at: 'desc' }, { id: 'desc' }],
    });
    return pack
      ? { ...pack, config: engine.validateConfig(pack.config) }
      : null;
  }
  async createPackage(body: any, user: Actor) {
    this.admin(user);
    try {
      engine.check(
        typeof body.nama === 'string' && body.nama.trim(),
        'Nama paket wajib diisi',
      );
      const config = engine.validateConfig(body.config);
      return await this.prisma.assessmentTemplatePackage.create({
        data: { nama: body.nama.trim(), config: json(config) },
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
  async publish(id: number, user: Actor) {
    this.admin(user);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AssessmentTemplatePackage" WHERE id = ${id} FOR UPDATE`;
      const pack = await tx.assessmentTemplatePackage.findUnique({
        where: { id },
      });
      if (!pack) throw new NotFoundException('Template tidak ditemukan');
      if (pack.published_at)
        throw new BadRequestException(
          'Template sudah dipublikasikan; buat versi baru untuk perubahan',
        );
      try {
        engine.validateConfig(pack.config as unknown as engine.Config);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      return tx.assessmentTemplatePackage.update({
        where: { id },
        data: { published_at: new Date() },
      });
    });
  }
  async initialise(
    tx: Prisma.TransactionClient,
    packageId: number | undefined,
    answers: engine.Answer[],
  ) {
    // Require a published package for every new submission. Never silently fall back
    // to the legacy destructive shared-answer workflow.
    if (!packageId)
      throw new BadRequestException(
        'Pilih paket template yang telah dipublikasikan admin',
      );
    await tx.$queryRaw`SELECT id FROM "AssessmentTemplatePackage" WHERE id = ${packageId} FOR UPDATE`;
    const pack = await tx.assessmentTemplatePackage.findUnique({
      where: { id: packageId },
    });
    if (!pack?.published_at)
      throw new BadRequestException('Template belum dipublikasikan');
    let w: engine.Workflow;
    try {
      w = engine.initialise(pack.config as unknown as engine.Config, answers);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    await tx.assessmentTemplatePackage.update({
      where: { id: packageId },
      data: { used_at: pack.used_at ?? new Date() },
    });
    return { template_package_id: packageId, workflow: json(w) };
  }
  async get(id: number, user: Actor) {
    const item = await this.prisma.inovasi.findUnique({
      where: { id },
      include: { satker: true, template_package: { select: { nama: true } } },
    });
    if (!item?.workflow)
      throw new NotFoundException(
        'Usulan ini belum menggunakan assessment bertahap',
      );
    this.readAccess(item, user);
    const workflow = engine.publicWorkflow(
      item.workflow as unknown as engine.Workflow,
      user.sub,
    );
    const users = await this.prisma.user.findMany({
      where: { id: { in: workflow.stages.flatMap((s) => s.reviewer_ids) } },
      select: { id: true, nama_lengkap: true },
    });
    return {
      id: item.id,
      judul: item.judul,
      satker: item.satker,
      template: item.template_package?.nama,
      status: item.status,
      catatan_perbaikan: item.catatan_perbaikan,
      workflow,
      reviewers: users,
    };
  }
  async mutate(
    id: number,
    number: number,
    action: string,
    body: any,
    user: Actor,
  ) {
    if (!Number.isSafeInteger(number) || number < 1)
      throw new BadRequestException('Nomor tahap tidak valid');
    const stageNumber = number;
    await this.prisma.$transaction(async (tx) => {
      // Serialize every state change including competing signatures, votes, returns,
      // assignments, and self resubmission on the same database row.
      await tx.$queryRaw`SELECT id FROM "Inovasi" WHERE id = ${id} FOR UPDATE`;
      const item = await tx.inovasi.findUnique({ where: { id } });
      if (!item?.workflow)
        throw new NotFoundException('Assessment tidak ditemukan');
      this.readAccess(item, user);
      const w = engine.normaliseWorkflow(item.workflow);
      if (body.revision !== w.revision)
        throw new BadRequestException(
          'Data telah berubah. Muat ulang sebelum melanjutkan',
        );
      try {
        engine.stageAt(w, stageNumber);
        switch (action) {
          case 'assign': {
            this.admin(user);
            engine.check(
              Array.isArray(body.reviewer_ids),
              'Reviewer wajib diisi',
            );
            const users = await tx.user.findMany({
              where: {
                id: { in: body.reviewer_ids },
                role: { in: ['TIM_PENILAI_MARVEL', 'TIM_PENILAI_ITJEN'] },
                status_registrasi: 'APPROVED',
              },
            });
            engine.check(
              users.length === body.reviewer_ids.length,
              'Reviewer harus akun penilai yang telah disetujui',
            );
            engine.assign(w, stageNumber, body.reviewer_ids);
            break;
          }
          case 'answers':
            engine.saveAnswers(w, stageNumber, user.sub, body.answers);
            break;
          case 'sign': {
            const account = await tx.user.findUniqueOrThrow({
              where: { id: user.sub },
            });
            engine.check(
              typeof body.nip === 'string' &&
                typeof body.jabatan === 'string' &&
                typeof body.signature_data === 'string',
              'Lengkapi tanda tangan',
            );
            engine.sign(w, stageNumber, {
              user_id: user.sub,
              nama: account.nama_lengkap,
              role: body.jabatan,
              nip: body.nip,
              ttd_image: body.signature_data,
              signed_at: new Date().toISOString(),
              vote: null,
            });
            break;
          }
          case 'vote':
            engine.vote(w, stageNumber, user.sub, body.lolos);
            break;
          case 'return':
            engine.check(
              user.role === 'SUPER_ADMIN' || w.active === stageNumber,
              'Pengembalian hanya dari tahap aktif',
            );
            engine.returnToSelf(
              w,
              user.sub,
              body.reason,
              user.role === 'SUPER_ADMIN',
            );
            break;
          default:
            throw new Error('Aksi tidak dikenal');
        }
      } catch (e) {
        if (e instanceof ForbiddenException) throw e;
        throw new BadRequestException((e as Error).message);
      }
      w.revision++;
      await tx.inovasi.update({
        where: { id },
        data: {
          workflow: json(w),
          status: engine.workflowStatus(w),
          catatan_perbaikan: w.active === 0 ? body.reason : null,
          penilai: {
            set: [...new Set(w.stages.flatMap((s) => s.reviewer_ids))].map(
              (id) => ({ id }),
            ),
          },
        },
      });
    });
    return this.get(id, user);
  }
  async resubmit(
    id: number,
    answers: engine.Answer[],
    user: Actor,
    data: Prisma.InovasiUpdateInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Inovasi" WHERE id = ${id} FOR UPDATE`;
      const item = await tx.inovasi.findUniqueOrThrow({ where: { id } });
      if (user.role !== 'SATKER' || item.satker_id !== user.satker_id)
        throw new ForbiddenException(
          'Hanya satker pemilik yang dapat mengirim ulang',
        );
      const w = engine.normaliseWorkflow(item.workflow);
      try {
        engine.resubmit(w, answers);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      w.revision++;
      return tx.inovasi.update({
        where: { id },
        data: {
          ...data,
          workflow: json(w),
          status: 'PENDING',
          catatan_perbaikan: null,
        },
      });
    });
  }
}

// Real HTTP controllers + validation + PostgreSQL. Creates and removes only its
// own fixtures. Run after npm run build and prisma migrate deploy.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const { ConfigModule } = require('@nestjs/config');
const request = require('supertest');
const { PrismaModule } = require('../dist/src/prisma/prisma.module');
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const { InovasiModule } = require('../dist/src/inovasi/inovasi.module');
const image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/RsAAAAASUVORK5CYII=';

async function main() {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(
    new URL(process.env.DATABASE_URL).hostname,
  );
  assert.ok(local, 'Integration fixtures are restricted to a local database');
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      PrismaModule,
      InovasiModule,
    ],
  }).compile();
  const app = module.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  const prisma = app.get(PrismaService);
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  const key = `workflow-test-${Date.now()}`;
  let satker;
  let packageId;
  let inovasiId;
  const users = [];
  try {
    satker = await prisma.satker.create({ data: { nama_satker: key } });
    for (const role of [
      'SUPER_ADMIN',
      'SATKER',
      'TIM_PENILAI_MARVEL',
      'TIM_PENILAI_ITJEN',
      'TIM_PENILAI_MARVEL',
      'SATKER',
    ]) {
      users.push(
        await prisma.user.create({
          data: {
            email: `${key}-${users.length}@example.test`,
            password: 'fixture-not-a-login-hash',
            nama_lengkap: `Fixture ${users.length}`,
            role,
            status_registrasi: 'APPROVED',
            satker_id: satker.id,
          },
        }),
      );
    }
    const tokens = users.map((user) =>
      jwt.sign({ sub: user.id, role: user.role, satker_id: user.satker_id }),
    );
    const send = async (index, method, url, payload, expected = 201) => {
      const res = await request(app.getHttpServer())
        [method](url)
        .set('Authorization', `Bearer ${tokens[index]}`)
        .send(payload);
      assert.equal(
        res.status,
        expected,
        `${method} ${url}: ${JSON.stringify(res.body)}`,
      );
      return res.body;
    };
    const config = {
      tahap1: [{ id: 1, pertanyaan: 'Orisinil', parent_id: null }],
      tahap2: [{ id: 10, pertanyaan: 'Dampak', parent_id: null }],
      mappings: [
        { source_stage: 0, source_id: 1, target_stage: 1, target_id: 1 },
        { source_stage: 1, source_id: 1, target_stage: 2, target_id: 10 },
      ],
    };
    await send(
      2,
      'post',
      '/assessment-workflow/templates',
      { nama: key, config },
      403,
    );
    const pack = await send(0, 'post', '/assessment-workflow/templates', {
      nama: key,
      config,
    });
    packageId = pack.id;
    await send(
      0,
      'post',
      `/assessment-workflow/templates/${packageId}/publish`,
      {},
    );
    await send(
      0,
      'post',
      `/assessment-workflow/templates/${packageId}/publish`,
      {},
      400,
    );
    const self = [
      {
        question_id: 1,
        jawaban_boolean: true,
        catatan_string: 'Self asli',
        link: 'https://example.test/bukti',
      },
    ];
    const payload = {
      template_package_id: packageId,
      judul: key,
      tahun: 2026,
      jenis_inovasi: 'Metode kerja',
      kriteria_inovasi: ['Orisinil'],
      link_data_dukung: 'https://example.test',
      pic_nama: 'Fixture PIC',
      pic_telp: '000',
      assessment_answers: self,
    };
    const created = await send(1, 'post', '/inovasi', payload);
    inovasiId = created.id;
    const adminList = await send(
      0,
      'get',
      `/inovasi?search=${key}&assignedToMe=false`,
      undefined,
      200,
    );
    assert.ok(
      adminList.data.some((item) => item.id === inovasiId),
      'Admin must see unassigned submissions',
    );
    assert.equal(
      adminList.data[0].workflow.self,
      undefined,
      'List responses expose summaries, not unfiltered answers/votes',
    );
    let detail = await send(
      0,
      'get',
      `/assessment-workflow/inovasi/${inovasiId}`,
      undefined,
      200,
    );
    const action = async (index, stage, name, data, expected = 201) => {
      const result = await send(
        index,
        'post',
        `/assessment-workflow/inovasi/${inovasiId}/stages/${stage}/${name}`,
        { revision: detail.workflow.revision, ...data },
        expected,
      );
      if (expected === 201) detail = result;
      return result;
    };
    await send(
      2,
      'get',
      `/assessment-workflow/inovasi/${inovasiId}`,
      undefined,
      403,
    );
    await action(0, 1, 'assign', {
      reviewer_ids: users.slice(2, 5).map((u) => u.id),
    });
    await action(0, 2, 'assign', { reviewer_ids: [users[2].id, users[3].id] });
    await action(0, 1, 'assign', { reviewer_ids: [users[4].id] }, 400);
    await action(2, 1, 'vote', { lolos: true }, 400);
    await send(
      2,
      'patch',
      `/inovasi/${inovasiId}/assessment`,
      { assessment_answers: self },
      403,
    );
    // Both requests read the same revision: exactly one may win the row lock.
    const body = {
      revision: detail.workflow.revision,
      answers: [{ ...self[0], catatan_string: 'Review tersimpan' }],
    };
    const url = `/assessment-workflow/inovasi/${inovasiId}/stages/1/answers`;
    const concurrent = await Promise.all([
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${tokens[2]}`)
        .send(body),
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${tokens[3]}`)
        .send(body),
    ]);
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 400]);
    detail = await send(
      0,
      'get',
      `/assessment-workflow/inovasi/${inovasiId}`,
      undefined,
      200,
    );
    const signing = { nip: '123', jabatan: 'SKI', signature_data: image };
    await action(2, 1, 'sign', signing);
    await action(2, 1, 'vote', { lolos: true });
    assert.equal(
      detail.workflow.stages[0].signatures[0].nama,
      users[2].nama_lengkap,
    );
    const hidden = await send(
      3,
      'get',
      `/assessment-workflow/inovasi/${inovasiId}`,
      undefined,
      200,
    );
    assert.equal(hidden.workflow.stages[0].signatures[0].vote, null);
    await action(3, 1, 'answers', { answers: self }, 400);
    await action(3, 1, 'sign', signing);
    await action(3, 1, 'vote', { lolos: true });
    assert.equal(detail.workflow.stages[0].result, null);
    await action(4, 1, 'sign', signing);
    await action(4, 1, 'vote', { lolos: false });
    assert.equal(detail.workflow.stages[0].result, 'LOLOS');
    assert.equal(
      detail.workflow.stages[1].answers[0].catatan_string,
      'Review tersimpan',
    );
    await action(2, 2, 'sign', signing);
    await action(2, 2, 'vote', { lolos: false });
    await action(3, 2, 'return', { reason: 'Perbaiki self assessment' });
    assert.equal(detail.workflow.active, 0);
    assert.equal(detail.workflow.history.length, 1);
    assert.ok(
      detail.workflow.stages.every((s) => !s.signatures.length && !s.result),
    );
    await send(2, 'patch', `/inovasi/${inovasiId}`, payload, 403);
    await send(
      1,
      'patch',
      `/inovasi/${inovasiId}`,
      {
        ...payload,
        assessment_answers: [{ ...self[0], catatan_string: 'Self diperbaiki' }],
      },
      200,
    );
    detail = await send(
      0,
      'get',
      `/assessment-workflow/inovasi/${inovasiId}`,
      undefined,
      200,
    );
    assert.equal(detail.workflow.self[0].catatan_string, 'Self diperbaiki');
    assert.equal(
      detail.workflow.stages[0].answers[0].catatan_string,
      'Review tersimpan',
    );
    assert.equal(
      detail.workflow.stages[1].answers[0].catatan_string,
      'Review tersimpan',
    );
    const refreshed = await prisma.assessmentTemplatePackage.findUniqueOrThrow({
      where: { id: packageId },
    });
    assert.ok(refreshed.used_at);
    console.log(
      'PASS: HTTP + PostgreSQL: template freeze, role access, independent stages, concurrent writes, signatures, majority votes, return and resubmit without recopy',
    );
  } finally {
    if (inovasiId) await prisma.inovasi.delete({ where: { id: inovasiId } });
    if (packageId)
      await prisma.assessmentTemplatePackage.delete({
        where: { id: packageId },
      });
    if (users.length)
      await prisma.user.deleteMany({
        where: { id: { in: users.map((u) => u.id) } },
      });
    if (satker) await prisma.satker.delete({ where: { id: satker.id } });
    await prisma.$disconnect();
    await app.close();
  }
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });

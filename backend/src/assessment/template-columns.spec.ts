import { AssessmentService } from './assessment.service';

describe('Kolom BA dinamis', () => {
  const defaults = [
    { key: 'jawaban_boolean', title: 'Hasil', type: 'checkbox', required: false },
    { key: 'catatan_string', title: 'Catatan', type: 'textarea', required: false },
    { key: 'link', title: 'Tautan', type: 'url', required: false },
  ];
  it('mewarisi kolom Tahap 1 dan menyimpan kolom tambahan Tahap 2', async () => {
    const templates: any[] = [];
    const db: any = { assessmentTemplatePackage: {
      create: jest.fn(async ({ data }) => { templates.push(data); return data; }),
      findFirst: jest.fn(async ({ where }) => templates.filter((t) => t.nama === where.nama).at(-1)),
    } };
    const service = new AssessmentService(db);
    const columns = [...defaults, { key: 'nilai', title: 'Nilai', type: 'number', required: true }];
    await service.saveColumns(1, { columns });
    expect(await service.getColumns(1)).toEqual({ columns });
    expect(await service.getColumns(2)).toMatchObject({ columns, inheritedColumnKeys: columns.map((column) => column.key) });
    const extra = { key: 'verifikasi', title: 'Verifikasi lanjutan', type: 'text', required: false };
    await service.saveColumns(2, { columns: [...columns, extra] });
    expect(templates.at(-1).config.columns).toEqual([extra]);
    expect(await service.getColumns(2)).toMatchObject({ columns: [...columns, extra] });
    expect(await service.getColumns(1)).toEqual({ columns });
  });
  it('menolak kunci ganda tetapi mengizinkan menghapus kolom dasar', async () => {
    const service = new AssessmentService({} as any);
    await expect(service.saveColumns(1, { columns: [...defaults, defaults[0]] })).rejects.toThrow('unik');
    const db: any = { assessmentTemplatePackage: { create: jest.fn(async ({ data }) => data) } };
    const editableService = new AssessmentService(db);
    await expect(editableService.saveColumns(1, { columns: [defaults[0], defaults[1]] })).resolves.toMatchObject({ columns: [defaults[0], defaults[1]] });
  });
});

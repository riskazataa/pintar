import type { PrismaService } from '../prisma/prisma.service';
import type { TemplateColumnDto, ReportHeaderDto } from './dto/template-columns.dto';

type TemplateConfig = { columns: TemplateColumnDto[]; questionTitle?: string; reportHeader?: ReportHeaderDto };
const defaultColumns: TemplateColumnDto[] = [
  { key: 'jawaban_boolean', title: 'Hasil', type: 'checkbox', required: false },
  { key: 'catatan_string', title: 'Catatan', type: 'textarea', required: false },
  { key: 'link', title: 'Tautan', type: 'url', required: false },
];

export async function loadTemplateConfig(db: Pick<PrismaService, 'assessmentTemplatePackage'>, tahap: number): Promise<TemplateConfig & { inheritedColumnKeys?: string[] }> {
  const template = await db.assessmentTemplatePackage.findFirst({ where: { nama: `BA_COLUMNS_STAGE_${tahap}` }, orderBy: { id: 'desc' } });
  const config = template?.config as TemplateConfig | undefined;
  if (tahap === 1) return config ?? { columns: defaultColumns };

  const source = await loadTemplateConfig(db, 1);
  const inheritedColumnKeys = source.columns.map((column) => column.key);
  return {
    reportHeader: config?.reportHeader ?? source.reportHeader,
    questionTitle: source.questionTitle ?? config?.questionTitle,
    columns: [...source.columns, ...(config?.columns ?? []).filter((column) => !inheritedColumnKeys.includes(column.key))],
    inheritedColumnKeys,
  };
}

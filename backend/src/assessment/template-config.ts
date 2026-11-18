import type { PrismaService } from '../prisma/prisma.service';
import type { TemplateColumnDto, ReportHeaderDto } from './dto/template-columns.dto';

type TemplateConfig = { columns: TemplateColumnDto[]; questionTitle?: string; reportHeader?: ReportHeaderDto };
const defaultColumns: TemplateColumnDto[] = [
  { key: 'jawaban_boolean', title: 'Hasil', type: 'checkbox', required: false, owner: 'BOTH' },
  { key: 'catatan_string', title: 'Catatan', type: 'textarea', required: false, owner: 'BOTH' },
  { key: 'link', title: 'Tautan', type: 'url', required: false, owner: 'BOTH' },
];

export async function loadTemplateConfig(db: Pick<PrismaService, 'assessmentTemplatePackage'>, tahap: number): Promise<TemplateConfig & { inheritedColumnKeys?: string[] }> {
  const template = await db.assessmentTemplatePackage.findFirst({ where: { nama: `BA_COLUMNS_STAGE_${tahap}` }, orderBy: { id: 'desc' } });
  const config = template?.config as TemplateConfig | undefined;
  const normalizedConfig: TemplateConfig = config ? {
    ...config,
    columns: (config.columns ?? defaultColumns).map((column) => ({ ...column, owner: column.owner ?? 'BOTH' as const })),
  } : { columns: defaultColumns };
  if (tahap === 1) return normalizedConfig;

  const source = await loadTemplateConfig(db, 1);
  const inheritedColumnKeys = source.columns.map((column) => column.key);
  return {
    reportHeader: normalizedConfig.reportHeader ?? source.reportHeader,
    questionTitle: source.questionTitle ?? config?.questionTitle,
    columns: [...source.columns, ...(normalizedConfig.columns ?? []).filter((column) => !inheritedColumnKeys.includes(column.key))],
    inheritedColumnKeys,
  };
}

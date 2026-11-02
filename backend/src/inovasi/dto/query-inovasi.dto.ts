import {
  IsOptional,
  IsString,
  IsInt,
  IsEnum,
  IsBoolean,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StatusInovasi } from '@prisma/client';

export class QueryInovasiDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2])
  tahap?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  limit?: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  satker_id?: number;

  @IsOptional()
  @IsEnum(StatusInovasi)
  status?: StatusInovasi;

  @IsOptional()
  @IsString()
  start_date?: string;

  @IsOptional()
  @IsString()
  end_date?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  assignedToMe?: boolean;

  @IsOptional()
  @IsIn(['SEDANG_DIREVIEW', 'MENUNGGU_TTD', 'LOLOS', 'TIDAK_LOLOS', 'PERBAIKAN'])
  hasil?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort_order?: 'asc' | 'desc' = 'desc';
}

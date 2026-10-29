import {
  IsOptional,
  IsString,
  IsInt,
  IsEnum,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { StatusInovasi } from '@prisma/client';

export class QueryInovasiDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  legacyOnly?: boolean;

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
  @Min(1)
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
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  assignedToMe?: boolean;
}

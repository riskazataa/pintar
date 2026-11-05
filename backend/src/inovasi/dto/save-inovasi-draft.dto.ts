import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class DraftAssessmentAnswerDto {
  @IsOptional()
  @IsInt()
  question_id?: number;

  @IsOptional()
  @IsBoolean()
  jawaban_boolean?: boolean;

  @IsOptional()
  @IsString()
  catatan_string?: string;

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsObject()
  custom_values?: Record<string, string | number | boolean>;
}

export class SaveInovasiDraftDto {
  @IsOptional()
  @IsString()
  judul?: string;

  @IsOptional()
  @IsString()
  deskripsi_inovasi?: string;

  @IsOptional()
  @IsInt()
  tahun?: number;

  @IsOptional()
  @IsString()
  jenis_inovasi?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  jenis_inovasi_pilihan?: string[];

  @IsOptional()
  @IsString()
  jenis_inovasi_lainnya?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  kriteria_inovasi?: string[];

  @IsOptional()
  @IsString()
  link_data_dukung?: string;

  @IsOptional()
  @IsString()
  pic_nama?: string;

  @IsOptional()
  @IsString()
  pic_telp?: string;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  pic_penanggung_jawab?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftAssessmentAnswerDto)
  assessment_answers?: DraftAssessmentAnswerDto[];
}

import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsArray,
  IsOptional,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

class AssessmentAnswerDto {
  @IsInt()
  @IsNotEmpty()
  question_id: number;

  @IsBoolean()
  @IsNotEmpty()
  jawaban_boolean: boolean;

  @IsString()
  @IsOptional()
  catatan_string?: string;

  @IsString()
  @IsOptional()
  link?: string;
}

export class CreateInovasiDto {
  @IsInt()
  @IsOptional()
  template_package_id?: number;

  @IsString()
  @IsNotEmpty()
  judul: string;

  @IsInt()
  @Min(2020)
  tahun: number;

  @IsString()
  @IsNotEmpty()
  jenis_inovasi: string;

  @IsString()
  @IsOptional()
  jenis_inovasi_lainnya?: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  kriteria_inovasi: string[];

  @IsString()
  @IsNotEmpty()
  link_data_dukung: string;

  @IsString()
  @IsNotEmpty()
  pic_nama: string;

  @IsString()
  @IsNotEmpty()
  pic_telp: string;

  @IsArray()
  @IsOptional()
  @Type(() => AssessmentAnswerDto)
  assessment_answers?: AssessmentAnswerDto[];
}

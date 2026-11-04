import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsArray,
  IsOptional,
  IsBoolean,
  IsObject,
  Matches,
  ArrayMaxSize,
  Min,
  ValidateNested,
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

  @IsObject()
  @IsOptional()
  custom_values?: Record<string, string | number | boolean>;
}

class PenanggungJawabDto {
  @IsString()
  @IsNotEmpty()
  nama: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(?:08\d{8,11}|\+628\d{7,10})$/)
  no_whatsapp: string;
}

export class CreateInovasiDto {
  @IsString()
  @IsNotEmpty()
  judul: string;

  @IsString()
  @IsNotEmpty()
  deskripsi_inovasi: string;

  @IsInt()
  @Min(2020)
  tahun: number;

  @IsString()
  @IsNotEmpty()
  jenis_inovasi: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  jenis_inovasi_pilihan?: string[];

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
  @ArrayMaxSize(2)
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PenanggungJawabDto)
  pic_penanggung_jawab?: PenanggungJawabDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AssessmentAnswerDto)
  assessment_answers?: AssessmentAnswerDto[];
}

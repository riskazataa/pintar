import {
  IsString,
  IsBoolean,
  IsOptional,
  IsInt,
  IsIn,
  IsArray,
  IsString as IsStringEach,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQuestionDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2])
  tahap?: number;

  @IsOptional()
  @IsBoolean()
  is_header?: boolean;

  @IsOptional()
  @IsString()
  question_title_override?: string;

  @IsOptional()
  @IsArray()
  @IsStringEach({ each: true })
  column_titles?: string[];

  @IsOptional()
  @IsBoolean()
  satker_locked?: boolean;

  @IsString()
  pertanyaan: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  parent_id?: number;
}

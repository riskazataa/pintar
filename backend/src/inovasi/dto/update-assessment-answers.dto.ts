import {
  IsInt,
  IsNotEmpty,
  IsBoolean,
  IsString,
  IsOptional,
  IsArray,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AssessmentAnswerItemDto {
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

export class UpdateAssessmentAnswersDto {
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AssessmentAnswerItemDto)
  assessment_answers: AssessmentAnswerItemDto[];
}

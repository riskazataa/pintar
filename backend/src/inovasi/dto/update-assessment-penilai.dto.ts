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

class AssessmentAnswerUpdateDto {
  @IsOptional() @IsObject()
  custom_values?: Record<string, string | number | boolean>;

  @IsOptional() @IsString()
  link?: string;
  @IsInt()
  @IsNotEmpty()
  question_id: number;

  @IsBoolean()
  @IsNotEmpty()
  jawaban_boolean: boolean;

  @IsString()
  @IsOptional()
  catatan_string?: string;
}

export class UpdateAssessmentPenilaiDto {
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AssessmentAnswerUpdateDto)
  answers: AssessmentAnswerUpdateDto[];
}

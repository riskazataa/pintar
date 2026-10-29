import {
  IsInt,
  IsNotEmpty,
  IsBoolean,
  IsString,
  IsOptional,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

class AssessmentAnswerUpdateDto {
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
  @Type(() => AssessmentAnswerUpdateDto)
  answers: AssessmentAnswerUpdateDto[];
}

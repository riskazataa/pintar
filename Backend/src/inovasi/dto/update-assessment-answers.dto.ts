import {
  IsInt,
  IsNotEmpty,
  IsBoolean,
  IsString,
  IsOptional,
  IsArray,
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
}

export class UpdateAssessmentAnswersDto {
  @IsArray()
  @IsNotEmpty()
  @Type(() => AssessmentAnswerItemDto)
  assessment_answers: AssessmentAnswerItemDto[];
}

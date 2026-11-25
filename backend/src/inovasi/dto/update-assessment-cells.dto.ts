import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AssessmentCellUpdateDto {
  @IsInt()
  @Min(1)
  question_id: number;

  @IsString()
  @IsNotEmpty()
  column_key: string;

  @IsDefined()
  value: string | number | boolean;
}

export class UpdateAssessmentCellsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AssessmentCellUpdateDto)
  cells: AssessmentCellUpdateDto[];
}

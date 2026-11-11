import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BulkAssignPenilaiDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsInt({ each: true })
  inovasi_ids: number[];

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  penilai_ids: number[];

  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2])
  tahap = 1;
}

import { IsArray, IsBoolean, IsIn, IsString, IsOptional, MaxLength, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class TemplateColumnDto {
  @IsString() @Matches(/^[a-z][a-z0-9_]{0,63}$/) key: string;
  @IsString() @MaxLength(120) title: string;
  @IsIn(['readonly', 'text', 'textarea', 'number', 'score', 'select', 'radio', 'checkbox', 'date', 'url']) type: string;
  @IsBoolean() required: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(120, { each: true }) options?: string[];
  @IsOptional() @IsString() @MaxLength(500) defaultValue?: string;
}
export class TemplateColumnsDto {
  @IsOptional() @IsString() @MaxLength(120)
  questionTitle?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TemplateColumnDto)
  columns: TemplateColumnDto[];
}

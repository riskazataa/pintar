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
export class ReportHeaderDto {
  @IsOptional() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(200) dateText?: string;
  @IsOptional() @IsString() @MaxLength(1400000)
  @Matches(/^(data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+)?$/)
  logo?: string;
}
export class TemplateColumnsDto {
  @IsOptional() @ValidateNested() @Type(() => ReportHeaderDto)
  reportHeader?: ReportHeaderDto;
  @IsOptional() @IsString() @MaxLength(120)
  questionTitle?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TemplateColumnDto)
  columns: TemplateColumnDto[];
}

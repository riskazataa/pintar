import { IsString, IsOptional } from 'class-validator';

export class UpdateSatkerDto {
  @IsString()
  @IsOptional()
  nama_satker?: string;
}

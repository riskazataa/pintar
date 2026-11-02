import { IsNumber, IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class SignInovasiDto {
  @IsOptional()
  @IsIn(['LOLOS', 'TIDAK_LOLOS'])
  keputusan?: string;
  @IsNumber()
  @IsNotEmpty()
  usulan_inovasi_id: number;

  @IsNumber()
  @IsNotEmpty()
  user_id: number;

  @IsString()
  @IsNotEmpty()
  jabatan: string;

  @IsString()
  @IsNotEmpty()
  nip: string;

  @IsString()
  @IsNotEmpty()
  signature_data: string;
}

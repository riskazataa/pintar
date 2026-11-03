import { IsNumber, IsString, IsNotEmpty, IsOptional, IsIn, Matches } from 'class-validator';

export class SignInovasiDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nama?: string;
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
  @Matches(/^\d+$/, { message: 'NIP hanya boleh berisi angka' })
  nip: string;

  @IsString()
  @IsNotEmpty()
  signature_data: string;
}

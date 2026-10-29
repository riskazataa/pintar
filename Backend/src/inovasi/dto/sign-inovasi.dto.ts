import { IsNumber, IsString, IsNotEmpty } from 'class-validator';

export class SignInovasiDto {
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

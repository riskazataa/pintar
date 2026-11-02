import { IsString, IsNotEmpty } from 'class-validator';

export class SendBackPerbaikanDto {
  @IsString()
  @IsNotEmpty()
  catatan_perbaikan: string;
}

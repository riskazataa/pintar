import { IsString, IsNotEmpty } from 'class-validator';

export class CreateSatkerDto {
  @IsString()
  @IsNotEmpty()
  nama_satker: string;
}

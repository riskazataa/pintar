import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  Matches,
  MaxLength,
} from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(?:08\d{8,11}|\+628\d{7,10})$/, { message: 'Nomor HP harus diawali 08 atau +628 dan maksimal 13 digit angka' })
  @MaxLength(14, { message: 'Nomor HP maksimal 13 digit angka' })
  no_hp: string;

  @IsString()
  @IsNotEmpty()
  nama_lengkap: string;

  @IsEnum(Role)
  @IsNotEmpty()
  role: Role;

  @IsOptional()
  satker_id?: number;
}

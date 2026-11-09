import { Transform } from 'class-transformer';
import { IsEmail, IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class ResetPasswordDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  userId: number;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  token: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;
}

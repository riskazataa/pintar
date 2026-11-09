import { IsBoolean } from 'class-validator';

export class SetSubmissionLockDto {
  @IsBoolean()
  locked!: boolean;
}

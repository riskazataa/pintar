import { PartialType } from '@nestjs/mapped-types';
import { CreateInovasiDto } from './create-inovasi.dto';

export class UpdateInovasiDto extends PartialType(CreateInovasiDto) {}

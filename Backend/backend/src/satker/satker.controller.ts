import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { SatkerService } from './satker.service';
import { CreateSatkerDto } from './dto/create-satker.dto';
import { UpdateSatkerDto } from './dto/update-satker.dto';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';

@Controller('satker')
export class SatkerController {
  constructor(private readonly satkerService: SatkerService) {}

  @Get()
  async findAll() {
    return this.satkerService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.satkerService.findOne(id);
  }

  @Post()
  @UseGuards(SuperAdminGuard)
  async create(@Body() dto: CreateSatkerDto) {
    return this.satkerService.create(dto);
  }

  @Patch(':id')
  @UseGuards(SuperAdminGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSatkerDto,
  ) {
    return this.satkerService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(SuperAdminGuard)
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.satkerService.remove(id);
  }
}

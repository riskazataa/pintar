import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import { InovasiService } from './inovasi.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateInovasiDto } from './dto/create-inovasi.dto';
import { UpdateInovasiDto } from './dto/update-inovasi.dto';
import { QueryInovasiDto } from './dto/query-inovasi.dto';
import { UpdateAssessmentPenilaiDto } from './dto/update-assessment-penilai.dto';
import { UpdateAssessmentAnswersDto } from './dto/update-assessment-answers.dto';
import { SignInovasiDto } from './dto/sign-inovasi.dto';

@Controller('inovasi')
export class InovasiController {
  constructor(private readonly inovasiService: InovasiService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: QueryInovasiDto, @Req() req: any) {
    return this.inovasiService.findAll(query, req.user);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async getStats(@Req() req: any) {
    return this.inovasiService.getStats(req.user);
  }

  @Get('hasil-evaluasi')
  @UseGuards(JwtAuthGuard)
  async findHasilEvaluasi() {
    return this.inovasiService.findHasilEvaluasi();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.inovasiService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateInovasiDto, @Req() req: any) {
    return this.inovasiService.create(dto, req.user);
  }

  @Patch(':id/assign')
  @UseGuards(JwtAuthGuard)
  async assignPenilai(
    @Param('id', ParseIntPipe) id: number,
    @Body('penilai_ids') penilaiIds: number[], // Mengambil properti penilai_ids dari req.body
  ) {
    return this.inovasiService.assignPenilai(id, penilaiIds);
  }

  @Get(':id/penilai')
  @UseGuards(JwtAuthGuard)
  async getPenilai(@Param('id', ParseIntPipe) id: number) {
    return this.inovasiService.getPenilaiList(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateInovasiDto: UpdateInovasiDto,
    @Request() req,
  ) {
    return this.inovasiService.update(id, updateInovasiDto, req.user);
  }

  @Patch(':id/assessment-penilai')
  @UseGuards(JwtAuthGuard)
  async updateAssessmentByPenilai(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssessmentPenilaiDto,
    @Req() req: any,
  ) {
    return this.inovasiService.updateAssessmentByPenilai(id, dto, req.user);
  }

  @Patch(':id/assessment')
  @UseGuards(JwtAuthGuard)
  async updateAssessmentAnswers(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssessmentAnswersDto,
    @Req() req: any,
  ) {
    return this.inovasiService.updateAssessmentAnswers(id, dto, req.user);
  }

  @Patch(':id/perbaikan')
  @UseGuards(JwtAuthGuard)
  async sendBackForPerbaikan(
    @Param('id', ParseIntPipe) id: number,
    @Body('catatan_perbaikan') catatan_perbaikan: string,
    @Req() req: any,
  ) {
    return this.inovasiService.sendBackForPerbaikan(
      id,
      catatan_perbaikan,
      req.user,
    );
  }

  @Patch(':id/sign')
  @UseGuards(JwtAuthGuard)
  async sign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SignInovasiDto,
    @Req() req: any,
  ) {
    return this.inovasiService.sign(id, dto, req.user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.inovasiService.remove(id, req.user);
  }
}

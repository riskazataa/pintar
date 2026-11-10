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
  Res,
  Header,
  DefaultValuePipe,
} from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { Response } from 'express';
import { InovasiService } from './inovasi.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateInovasiDto } from './dto/create-inovasi.dto';
import { UpdateInovasiDto } from './dto/update-inovasi.dto';
import { QueryInovasiDto } from './dto/query-inovasi.dto';
import { UpdateAssessmentPenilaiDto } from './dto/update-assessment-penilai.dto';
import { UpdateAssessmentAnswersDto } from './dto/update-assessment-answers.dto';
import { SignInovasiDto } from './dto/sign-inovasi.dto';
import { SaveInovasiDraftDto } from './dto/save-inovasi-draft.dto';

@Controller('inovasi')
export class InovasiController {
  constructor(private readonly inovasiService: InovasiService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: QueryInovasiDto, @Req() req: any) {
    return this.inovasiService.findAll(query, req.user);
  }

  @Get('summary/satker')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'REVIEWER')
  async getSatkerSubmissionSummary(
    @Req() req: any,
    @Query('tahun', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) tahun: number,
    @Query('tahap', new DefaultValuePipe(1), ParseIntPipe) tahap: number,
  ) {
    return this.inovasiService.getSatkerSubmissionSummary(req.user, tahun, tahap);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async getStats(
    @Req() req: any,
    @Query('tahun', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) tahun: number,
  ) {
    return this.inovasiService.getStats(req.user, tahun);
  }

  @Get('hasil-evaluasi')
  @UseGuards(JwtAuthGuard)
  async findHasilEvaluasi() {
    return this.inovasiService.findHasilEvaluasi();
  }

  @Get(':id/pdf')
  @UseGuards(JwtAuthGuard)
  @Header('Content-Type', 'application/pdf')
  async generatePdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
    @Query('tahap', new DefaultValuePipe(1), ParseIntPipe) tahap: number,
  ) {
    const { buffer, filename } = await this.inovasiService.generatePdf(id, tahap);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('tahap', new DefaultValuePipe(1), ParseIntPipe) tahap: number,
    @Req() req: any,
    @Query('view') view?: 'self-assessment' | 'evaluation',
  ) {
    return this.inovasiService.findOne(id, tahap, req.user, view);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateInovasiDto, @Req() req: any) {
    return this.inovasiService.create(dto, req.user);
  }

  @Post('draft')
  @UseGuards(JwtAuthGuard)
  async createDraft(@Body() dto: SaveInovasiDraftDto, @Req() req: any) {
    return this.inovasiService.createDraft(dto, req.user);
  }

  @Patch(':id/draft')
  @UseGuards(JwtAuthGuard)
  async updateDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveInovasiDraftDto,
    @Req() req: any,
  ) {
    return this.inovasiService.updateDraft(id, dto, req.user);
  }

  @Patch(':id/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'REVIEWER')
  async assignPenilai(
    @Param('id', ParseIntPipe) id: number,
    @Query('tahap', new DefaultValuePipe(1), ParseIntPipe) tahap: number,
    @Body('penilai_ids') penilaiIds: number[], // Mengambil properti penilai_ids dari req.body
  ) {
    return this.inovasiService.assignPenilai(id, penilaiIds, tahap);
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
    @Query('tahap', new DefaultValuePipe(1), ParseIntPipe) tahap: number,
  ) {
    return this.inovasiService.updateAssessmentByPenilai(id, dto, req.user, tahap);
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
    @Query('tahap', new DefaultValuePipe(1), ParseIntPipe) tahap: number,
  ) {
    return this.inovasiService.sign(id, dto, req.user, tahap);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.inovasiService.remove(id, req.user);
  }
}

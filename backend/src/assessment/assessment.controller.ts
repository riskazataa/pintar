import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  DefaultValuePipe,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { AssessmentService } from './assessment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { TemplateColumnsDto } from './dto/template-columns.dto';

@Controller('assessment')
export class AssessmentController {
  constructor(private readonly assessmentService: AssessmentService) {}

  @Get('columns')
  getColumns(@Query('tahap', new DefaultValuePipe(1), ParseIntPipe) tahap: number) {
    return this.assessmentService.getColumns(tahap);
  }

  @Put('columns')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'REVIEWER')
  saveColumns(@Query('tahap', new DefaultValuePipe(1), ParseIntPipe) tahap: number, @Body() dto: TemplateColumnsDto) {
    return this.assessmentService.saveColumns(tahap, dto);
  }

  @Get('questions')
  async findActiveQuestions(@Query('tahap', new DefaultValuePipe(1), ParseIntPipe) tahap: number) {
    return this.assessmentService.findActiveQuestions(tahap);
  }

  @Post('questions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'REVIEWER')
  async createQuestion(@Body() dto: CreateQuestionDto) {
    return this.assessmentService.createQuestion(dto);
  }

  @Post('questions/bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'REVIEWER')
  async createQuestions(@Body('rows') rows: (CreateQuestionDto & { section_header_id?: number | null })[]) {
    return this.assessmentService.createQuestions(rows);
  }

  @Put('questions/order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'REVIEWER')
  async reorderQuestions(@Body() body: { tahap: number; parent_id: number | null; ids: number[] }) {
    return this.assessmentService.reorderQuestions(Number(body.tahap), body.parent_id == null ? null : Number(body.parent_id), body.ids);
  }

  @Put('questions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'REVIEWER')
  async updateQuestion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.assessmentService.updateQuestion(id, dto);
  }

  @Delete('questions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'REVIEWER')
  async removeQuestion(@Param('id', ParseIntPipe) id: number) {
    return this.assessmentService.removeQuestion(id);
  }

  @Delete('questions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'REVIEWER')
  async removeQuestions(@Body('ids') ids: number[]) {
    return this.assessmentService.removeQuestions(ids.map(Number));
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkflowService } from './workflow.service';

@Controller('assessment-workflow')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly service: WorkflowService) {}
  @Get('templates/active') active() {
    return this.service.activePackage();
  }
  @Get('templates') packages(@Req() req: any) {
    return this.service.packages(req.user);
  }
  @Post('templates') create(
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.service.createPackage(body, req.user);
  }
  @Post('templates/:id/publish') publish(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.service.publish(id, req.user);
  }
  @Get('inovasi/:id') detail(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.service.get(id, req.user);
  }
  @Post('inovasi/:id/stages/:stage/:action') mutate(
    @Param('id', ParseIntPipe) id: number,
    @Param('stage', ParseIntPipe) stage: number,
    @Param('action') action: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.service.mutate(id, stage, action, body, req.user);
  }
}

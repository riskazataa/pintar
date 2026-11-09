import {
  Controller,
  Get,
  Param,
  Patch,
  Delete,
  ParseIntPipe,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AdminService } from './admin.service';
import { RegistrationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { SetSubmissionLockDto } from './dto/set-submission-lock.dto';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly authService: AuthService,
    private readonly adminService: AdminService,
  ) {}

  @Get('submission-lock')
  @UseGuards(JwtAuthGuard)
  async getSubmissionLock() {
    return this.adminService.getSubmissionLock();
  }

  @Patch('submission-lock')
  @UseGuards(SuperAdminGuard)
  async setSubmissionLock(@Body() dto: SetSubmissionLockDto) {
    return this.adminService.setSubmissionLock(dto.locked);
  }

  @Patch('verify-user/:id')
  async verifyUser(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: RegistrationStatus,
  ) {
    return this.authService.verifyUserRegistration(id, status);
  }

  @Get('users')
  async getUserByStatus(@Query('status') status: string) {
    // Menerjemahkan bahasa frontend ke bahasa Database (Prisma Enum)
    let dbStatus: RegistrationStatus = 'PENDING';

    if (status === 'ACTIVE') dbStatus = 'APPROVED';
    else if (status === 'WAITING') dbStatus = 'PENDING';
    else if (status === 'REJECTED') dbStatus = 'REJECTED';

    return this.adminService.getUserByStatus(dbStatus);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteUser(id);
  }

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }
}

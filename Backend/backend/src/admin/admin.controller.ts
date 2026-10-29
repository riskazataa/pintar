import {
  Controller,
  Get,
  Param,
  Patch,
  Delete,
  ParseIntPipe,
  Body,
  Query,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AdminService } from './admin.service';
import { RegistrationStatus } from '@prisma/client';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly authService: AuthService,
    private readonly adminService: AdminService,
  ) {}

  @Patch('verify-user/:id')
  async verifyUser(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: RegistrationStatus,
  ) {
    return this.authService.verifyUserRegistration(id, status);
  }

  @Get('users')
  async getUserByStatus(@Query('status') status: string) {
    // Menerjemahkan bahasa Frontend ke bahasa Database (Prisma Enum)
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

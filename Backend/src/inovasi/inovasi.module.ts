import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { InovasiController } from './inovasi.controller';
import { InovasiService } from './inovasi.service';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async () => ({
        secret: process.env.JWT_SECRET,
      }),
    }),
  ],
  controllers: [InovasiController, WorkflowController],
  providers: [InovasiService, WorkflowService, JwtAuthGuard],
  exports: [InovasiService],
})
export class InovasiModule {}

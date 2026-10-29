import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';
import { AdminModule } from './admin/admin.module';
import { SatkerModule } from './satker/satker.module';
import { InovasiModule } from './inovasi/inovasi.module';
import { AssessmentModule } from './assessment/assessment.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    EmailModule,
    AdminModule,
    SatkerModule,
    InovasiModule,
    AssessmentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

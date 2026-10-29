import { Module } from '@nestjs/common';
import { SatkerController } from './satker.controller';
import { SatkerService } from './satker.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
  ],
  controllers: [SatkerController],
  providers: [SatkerService],
  exports: [SatkerService],
})
export class SatkerModule {}

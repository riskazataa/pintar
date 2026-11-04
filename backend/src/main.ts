import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '2mb' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const configuredFrontendOrigin = new URL(
    process.env.FRONTEND_URL || 'http://localhost:5173',
  ).origin;
  const isDevelopment = process.env.NODE_ENV !== 'production';

  app.enableCors({
    origin: (origin, callback) => {
      const isLocalDevelopmentOrigin =
        isDevelopment &&
        Boolean(origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin));

      callback(
        null,
        !origin || origin === configuredFrontendOrigin || isLocalDevelopmentOrigin,
      );
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

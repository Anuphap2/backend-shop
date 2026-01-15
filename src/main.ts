import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // เปิดใช้ ValidationPipe
  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // ตัด field แปลกปลอมทิ้งอัตโนมัติ
      forbidNonWhitelisted: true, // (Optional) แจ้ง Error ถ้ามี field แปลกปลอม
      transform: true, // แปลง payload ให้ตรงกับ DTO ที่กำหนด
      transformOptions: { enableImplicitConversion: true }, // แปลงชนิดข้อมูลอัตโนมัติ เช่น string เป็น number
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

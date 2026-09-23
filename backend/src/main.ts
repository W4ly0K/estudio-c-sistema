import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 1. Habilitamos CORS primero para que React pueda conectarse
  app.enableCors();
  
  // 2. Bloqueamos datos no definidos en los DTOs
  app.useGlobalPipes(new ValidationPipe({ 
    whitelist: true, 
    forbidNonWhitelisted: true 
  }));
  
  await app.listen(3000);
}
bootstrap();
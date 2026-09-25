import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors(); // O las opciones de cors que ya tengas

  // LA MAGIA ESTÁ AQUÍ: transform en true convierte los textos ISO a Dates reales
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true, 
    }),
  );

  await app.listen(3000);
}
bootstrap();
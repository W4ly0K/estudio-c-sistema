import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { crearValidationPipe } from './common/pipes/crear-validation-pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors(); // O las opciones de cors que ya tengas

  // Configuración centralizada (whitelist + forbidNonWhitelisted + transform)
  app.useGlobalPipes(crearValidationPipe());

  await app.listen(3000);
}
bootstrap();
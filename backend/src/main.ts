import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { crearValidationPipe } from './common/pipes/crear-validation-pipe';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors(); // O las opciones de cors que ya tengas

  // Configuración centralizada (whitelist + forbidNonWhitelisted + transform)
  app.useGlobalPipes(crearValidationPipe());

  await app.listen(3000);
}
// Fail-closed al arrancar: si la app no puede iniciar (base de datos caída,
// puerto ocupado, configuración inválida), se registra el motivo y el proceso
// termina con código 1 para que el orquestador lo detecte y lo reinicie.
bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').error(
    'El servidor no pudo arrancar',
    error instanceof Error ? error.stack : String(error),
  );
  process.exit(1);
});
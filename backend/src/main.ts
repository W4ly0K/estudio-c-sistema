import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { aplicarCors, VARIABLE_ORIGENES_CORS } from './common/cors/configurar-cors';
import { crearValidationPipe } from './common/pipes/crear-validation-pipe';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  
  // Fase 6.2 · DS2: lista blanca de orígenes. Si CORS_ORIGENES falta o es inválida,
  // lanza y el catch de abajo termina el proceso (fail-fast, como JWT_SECRET).
  aplicarCors(app, process.env[VARIABLE_ORIGENES_CORS]);

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
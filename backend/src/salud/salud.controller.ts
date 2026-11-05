import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

/** Respuesta de la sonda: solo indica que el proceso atiende peticiones HTTP. */
export interface EstadoSalud {
  readonly estado: 'ok';
}

/**
 * Sonda de liveness para el balanceador del despliegue en AWS.
 *
 * - Pública: el health check del balanceador no lleva JWT. @Public() va en el MÉTODO,
 *   no en la clase, para que un endpoint futuro de este controlador no nazca público.
 * - Sin base de datos: cada sonda ocuparía una conexión del pooler de Supabase, y una
 *   caída breve de la BD haría que el balanceador recicle tareas sanas. La conexión ya
 *   se verifica al arrancar (PrismaService.onModuleInit y el fail-closed de main.ts).
 * - Sin datos internos (versión, hash, entorno): quien sondea no obtiene información.
 */
@Controller('salud')
export class SaludController {
  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  comprobar(): EstadoSalud {
    return { estado: 'ok' };
  }
}

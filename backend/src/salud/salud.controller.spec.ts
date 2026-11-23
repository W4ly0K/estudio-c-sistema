import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { SaludController } from './salud.controller';

const reflector = new Reflector();

/**
 * Handler real, como lo entrega Nest con getHandler(): Reflector solo usa su identidad.
 * Se lee desde el descriptor de la propiedad para no referenciar el método sin su
 * instancia (regla unbound-method del lint).
 */
function handlerDe(metodo: keyof SaludController) {
  const valor: unknown = Object.getOwnPropertyDescriptor(SaludController.prototype, metodo)?.value;
  if (typeof valor !== 'function') {
    throw new Error(`SaludController no define el método ${metodo}`);
  }
  return valor;
}

describe('SaludController', () => {
  let controller: SaludController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SaludController],
    }).compile();

    controller = module.get<SaludController>(SaludController);
  });

  it('responde { estado: "ok" } sin dependencias inyectadas', () => {
    expect(controller.comprobar()).toEqual({ estado: 'ok' });
  });

  it('el método es público (@Public)', () => {
    expect(reflector.get<boolean | undefined>(IS_PUBLIC_KEY, handlerDe('comprobar'))).toBe(true);
  });

  it('la clase NO es pública: un endpoint nuevo aquí seguiría exigiendo JWT', () => {
    expect(reflector.get<boolean | undefined>(IS_PUBLIC_KEY, SaludController)).toBeUndefined();
  });

  it('no declara @Roles: es una sonda de infraestructura, no una acción de negocio', () => {
    expect(
      reflector.getAllAndOverride<unknown>(ROLES_KEY, [handlerDe('comprobar'), SaludController]),
    ).toBeUndefined();
  });
});

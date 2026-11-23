import { UnauthorizedException } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';

interface UsuarioSeleccionado {
  id_usuario: string;
  correo: string;
  rol: RolUsuario;
}

describe('JwtStrategy', () => {
  const findUnique = jest.fn<Promise<UsuarioSeleccionado | null>, [unknown]>();
  const prismaMock = { usuario: { findUnique } };
  const crearEstrategia = (): JwtStrategy => new JwtStrategy(prismaMock as unknown as PrismaService);

  const payloadStaff: JwtPayload = {
    sub: 'uuid-1',
    correo: 'docente@unicesmag.edu.co',
    rol: RolUsuario.STAFF,
  };

  let secretoOriginal: string | undefined;

  beforeAll(() => {
    secretoOriginal = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'secreto-de-prueba';
  });

  afterAll(() => {
    // Restaurar sin contaminar otras suites (asignar undefined dejaría el string "undefined")
    if (secretoOriginal === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = secretoOriginal;
    }
  });

  beforeEach(() => {
    findUnique.mockReset();
  });

  it('usa el rol de la BD, no el del token: una degradación aplica de inmediato (Decisión A)', async () => {
    findUnique.mockResolvedValue({
      id_usuario: 'uuid-1',
      correo: 'docente@unicesmag.edu.co',
      rol: RolUsuario.SOLICITANTE,
    });

    await expect(crearEstrategia().validate(payloadStaff)).resolves.toEqual({
      id: 'uuid-1',
      correo: 'docente@unicesmag.edu.co',
      rol: RolUsuario.SOLICITANTE,
    });
  });

  it('consulta por el sub del token con un select mínimo (mínimo privilegio)', async () => {
    findUnique.mockResolvedValue({
      id_usuario: 'uuid-1',
      correo: 'docente@unicesmag.edu.co',
      rol: RolUsuario.STAFF,
    });

    await crearEstrategia().validate(payloadStaff);

    expect(findUnique).toHaveBeenCalledWith({
      where: { id_usuario: 'uuid-1' },
      select: { id_usuario: true, correo: true, rol: true },
    });
  });

  it('responde 401 si el usuario del token ya no existe', async () => {
    findUnique.mockResolvedValue(null);

    await expect(crearEstrategia().validate(payloadStaff)).rejects.toThrow(UnauthorizedException);
  });

  it('responde 401 con sub vacío SIN consultar la base de datos', async () => {
    await expect(crearEstrategia().validate({ ...payloadStaff, sub: '' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('falla al arrancar (fail-fast) si JWT_SECRET no está configurado', () => {
    delete process.env.JWT_SECRET;
    try {
      expect(crearEstrategia).toThrow('FATAL ERROR');
    } finally {
      process.env.JWT_SECRET = 'secreto-de-prueba';
    }
  });
});

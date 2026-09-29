import { Test, TestingModule } from '@nestjs/testing';
import { SolicitudesService } from './solicitudes.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SolicitudesService', () => {
  let service: SolicitudesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SolicitudesService, { provide: PrismaService, useValue: {} }],
    }).compile();

    service = module.get<SolicitudesService>(SolicitudesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

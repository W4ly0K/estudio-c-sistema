import { Test, TestingModule } from '@nestjs/testing';
import { RecursosService } from './recursos.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RecursosService', () => {
  let service: RecursosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecursosService, { provide: PrismaService, useValue: {} }],
    }).compile();

    service = module.get<RecursosService>(RecursosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

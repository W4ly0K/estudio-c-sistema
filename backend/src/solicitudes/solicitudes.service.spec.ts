import { Test, TestingModule } from '@nestjs/testing';
import { SolicitudesService } from './solicitudes.service';

describe('SolicitudesService', () => {
  let service: SolicitudesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SolicitudesService],
    }).compile();

    service = module.get<SolicitudesService>(SolicitudesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptReportHistoryController } from './receipt-report-history.controller';

describe('ReceiptReportHistoryController', () => {
  let controller: ReceiptReportHistoryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReceiptReportHistoryController],
    }).compile();

    controller = module.get<ReceiptReportHistoryController>(
      ReceiptReportHistoryController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

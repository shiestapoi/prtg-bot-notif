import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/public/receipt-reports')
export class ReceiptReportPublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  async getReportSnapshot(@Param('id') id: string) {
    const snapshot = await this.prisma.receiptReportSnapshot.findUnique({
      where: { id },
    });

    if (!snapshot) {
      throw new NotFoundException('Laporan tidak ditemukan atau link sudah kadaluarsa.');
    }

    return snapshot;
  }
}

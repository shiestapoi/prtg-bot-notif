import {
  Controller,
  Get,
  Param,
  NotFoundException,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import axios from 'axios';
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
      throw new NotFoundException(
        'Laporan tidak ditemukan atau link sudah kadaluarsa.',
      );
    }

    return snapshot;
  }

  @Get('chart/:snapshotId/:sensorId')
  async getChart(
    @Param('snapshotId') snapshotId: string,
    @Param('sensorId') sensorId: string,
    @Query('sdate') sdate: string,
    @Query('edate') edate: string,
    @Res() res: Response,
  ) {
    // Validate snapshot exists to prevent abuse
    const snapshot = await this.prisma.receiptReportSnapshot.findUnique({
      where: { id: snapshotId },
    });
    if (!snapshot) {
      throw new NotFoundException('Invalid snapshot id');
    }

    const settings = await this.prisma.prtgSetting.findFirst();
    if (!settings || !settings.loginUrl) {
      throw new NotFoundException('PRTG settings not configured');
    }

    const baseUrl = new URL(settings.loginUrl);

    // PRTG Historical Chart URL format:
    // /chart.png?id=...&avg=60&sdate=...&edate=...&width=1320&height=620&graphstyling=baseFontSize='12'%20showLegend='1'&graphid=-1

    const chartUrl = `${baseUrl.protocol}//${baseUrl.host}/chart.png?id=${sensorId}&avg=60&sdate=${sdate}&edate=${edate}&width=1320&height=620&graphstyling=baseFontSize%3D%2712%27%20showLegend%3D%271%27&graphid=-1&username=${encodeURIComponent(settings.loginUsername ?? '')}&passhash=${encodeURIComponent(settings.loginPassword ?? '')}`;

    try {
      const response = await axios.get(chartUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=31536000');
      res.status(response.status).send(response.data);
    } catch (error) {
      console.error(`Failed to fetch chart from PRTG: ${error}`);
      res.status(500).send('Chart not available');
    }
  }
}

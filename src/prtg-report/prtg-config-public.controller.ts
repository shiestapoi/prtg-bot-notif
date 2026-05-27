import { Body, Controller, Param, ParseIntPipe, Put } from '@nestjs/common';
import { PrtgReportService } from './prtg-report.service';

/**
 * Public endpoints for PRTG config operations that do NOT require authentication.
 * Similar to MonitoringHistoryController — no @UseGuards applied.
 */
@Controller('api/prtg')
export class PrtgConfigPublicController {
  constructor(private readonly prtgReportService: PrtgReportService) {}

  @Put('configs/:id/maintenance')
  async toggleMaintenance(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { maintenance: boolean; maintenanceLabel?: string | null },
  ) {
    return this.prtgReportService.updateConfig(id, {
      maintenance: body.maintenance,
      maintenanceLabel: body.maintenance ? (body.maintenanceLabel ?? 'Maintenance') : null,
    });
  }
}

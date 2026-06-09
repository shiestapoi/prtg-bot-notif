import {
  Controller,
  Post,
  Get,
  Param,
  ParseIntPipe,
  NotFoundException,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import * as express from 'express';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';
import sharp from 'sharp';
import { MonitoringSchedulerService } from '../scheduler/monitoring-scheduler.service';
import { AlertDispatcherService } from '../dispatcher/alert-dispatcher.service';
import { ScreenshotService } from '../dispatcher/screenshot.service';
import { MetricParserService } from '../parser/metric-parser.service';
// Cookie tidak dipakai lagi — auth sekarang menggunakan username/passhash query params
// import { CookieVaultService } from '../../cookie-vault/cookie-vault.service';
import { PrtgSettingService } from '../../prtg-setting/prtg-setting.service';
import { PrtgReportService } from '../../prtg-report/prtg-report.service';
import { MonitoringHistoryService } from '../service/monitoring-history.service';

/**
 * MonitoringController provides manual poll trigger functionality and chart proxy.
 * POST /api/monitoring/configs/:id/poll triggers an immediate poll for a specific
 * monitoring-enabled PrtgConfig.
 * GET /api/monitoring/chart/:sensorId proxies the PRTG chart image with auth.
 *
 * Validates:
 * - Config exists
 * - Config has monitoringEnabled = true (is monitoring-enabled)
 *
 * Requirements: 4.1
 */
@Controller('api/monitoring')
export class MonitoringController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerService: MonitoringSchedulerService,
    private readonly dispatcher: AlertDispatcherService,
    private readonly screenshotService: ScreenshotService,
    private readonly metricParser: MetricParserService,
    private readonly prtgReportService: PrtgReportService,
    // Cookie tidak dipakai lagi — auth sekarang menggunakan username/passhash query params
    // private readonly cookieVault: CookieVaultService,
    private readonly prtgSetting: PrtgSettingService,
    private readonly monitoringHistory: MonitoringHistoryService,
  ) {}

  /**
   * Manually triggers a poll for a specific monitoring-enabled PrtgConfig.
   * Returns 200 on success, 404 if config not found, 400 if not monitoring-enabled.
   */
  @Post('configs/:id/poll')
  @HttpCode(HttpStatus.OK)
  async triggerPoll(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string; configId: number }> {
    // Validate config exists
    const config = await this.prisma.prtgConfig.findUnique({
      where: { id },
    });

    if (!config) {
      throw new NotFoundException(`Config with ID ${id} not found`);
    }

    // Validate config is monitoring-enabled
    if (!config.monitoringEnabled) {
      throw new BadRequestException(
        `Config ${id} is not monitoring-enabled (monitoringEnabled is false)`,
      );
    }

    // Trigger the poll via the scheduler service
    await this.schedulerService.pollNow(id);

    return {
      message: `Poll triggered successfully for config "${config.title}"`,
      configId: id,
    };
  }

  /**
   * Manually triggers a historical data sync from PRTG for a specific config.
   */
  @Post('configs/:id/sync')
  @HttpCode(HttpStatus.OK)
  async syncConfig(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string; upsertedCount: number }> {
    const config = await this.prisma.prtgConfig.findUnique({
      where: { id },
    });

    if (!config || !config.monitoringEnabled) {
      throw new BadRequestException(
        `Config ${id} is not monitoring-enabled or does not exist`,
      );
    }

    // Default sync last 24 hours
    const now = new Date();
    const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const upsertedCount = await this.monitoringHistory.syncFromPrtg(
      id,
      startDate,
      now,
    );

    return {
      message: 'Sync completed',
      upsertedCount,
    };
  }

  /**
   * Manually triggers historical data sync for all active monitoring configs.
   */
  @Post('sync-all')
  @HttpCode(HttpStatus.OK)
  async syncAll(): Promise<{
    message: string;
    results: Record<number, number>;
  }> {
    const configs = await this.prisma.prtgConfig.findMany({
      where: { monitoringEnabled: true, enabled: true },
    });

    const now = new Date();
    const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const results: Record<number, number> = {};
    for (const config of configs) {
      try {
        const count = await this.monitoringHistory.syncFromPrtg(
          config.id,
          startDate,
          now,
        );
        results[config.id] = count;
      } catch (err) {
        results[config.id] = -1; // -1 indicates error
      }
    }

    return { message: 'Sync all completed', results };
  }

  /**
   * Force-sends a monitoring status notification for a specific config.
   * Uses the exact same logic as schedule dispatch: Playwright screenshot + template + send.
   * POST /api/monitoring/configs/:id/notify
   */
  @Post('configs/:id/notify')
  @HttpCode(HttpStatus.OK)
  async forceNotify(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string; configId: number; status: string }> {
    const config = await this.prisma.prtgConfig.findUnique({
      where: { id },
      include: { group: true },
    });

    if (!config) {
      throw new NotFoundException(`Config with ID ${id} not found`);
    }

    if (!config.monitoringEnabled) {
      throw new BadRequestException(`Config ${id} is not monitoring-enabled`);
    }

    // Use the same dispatch logic as schedule — captures Playwright screenshot + sends
    const result = await this.prtgReportService.dispatchConfig(id);

    return {
      message: `Notifikasi terkirim ke ${result.sentRecipients} recipient untuk "${config.title}" (${config.lastStatus})`,
      configId: id,
      status: config.lastStatus,
    };
  }

  /**
   * Test sample: fetches PRTG data + takes screenshot for a config.
   * Does NOT send to WhatsApp. Returns parsed metrics + screenshot base64.
   * POST /api/monitoring/configs/:id/test-sample
   */
  @Post('configs/:id/test-sample')
  @HttpCode(HttpStatus.OK)
  async testSample(@Param('id', ParseIntPipe) id: number): Promise<{
    configId: number;
    title: string;
    sensorId: number;
    metrics: Record<string, unknown> | null;
    screenshotBase64: string | null;
    error: string | null;
  }> {
    const config = await this.prisma.prtgConfig.findUnique({
      where: { id },
      include: { group: true },
    });

    if (!config) {
      throw new NotFoundException(`Config with ID ${id} not found`);
    }

    let metrics: Record<string, unknown> | null = null;
    let metricsError: string | null = null;

    // 1. Fetch PRTG API data (same as monitoring poll)
    try {
      const settings = await this.prtgSetting.getSettingRaw();
      const baseUrl = new URL(settings.loginUrl);

      const now = new Date();
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const formatDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}-${String(d.getSeconds()).padStart(2, '0')}`;

      const monitoringUrl = `${baseUrl.protocol}//${baseUrl.host}/api/historicdata.json?id=${config.sensorId}&avg=0&sdate=${formatDate(fiveMinAgo)}&edate=${formatDate(now)}&usecaption=1&username=${encodeURIComponent(settings.loginUsername ?? '')}&passhash=${encodeURIComponent(settings.loginPassword ?? '')}`;

      const response = await axios.get(monitoringUrl, {
        timeout: 15000,
        validateStatus: () => true,
      });

      if (response.status === 200 && response.data) {
        const rawText =
          typeof response.data === 'string'
            ? response.data
            : JSON.stringify(response.data);
        const parsed = this.metricParser.normalize(rawText, config.sensorId);
        metrics = {
          raw: response.data,
          parsed,
          monitoringUrl,
        };
      } else {
        metricsError = `PRTG API returned status ${response.status}`;
      }
    } catch (error) {
      metricsError = error instanceof Error ? error.message : String(error);
    }

    // 2. Take screenshot (with upscale via Playwright)
    let screenshotBase64: string | null = null;
    try {
      const currentTime = new Date();
      const sdateObj = new Date(currentTime.getTime() - 2 * 60 * 60 * 1000); // 2 hours before
      const edateObj = new Date(currentTime.getTime() + 5 * 60 * 1000); // 5 minutes after
      const formatDateUrl = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}-${String(d.getSeconds()).padStart(2, '0')}`;
      const screenshotUrl = `http://prtg.r1net.id/chart.png?id=${config.sensorId}&avg=60&sdate=${formatDateUrl(sdateObj)}&edate=${formatDateUrl(edateObj)}&width=800&height=400&graphstyling=baseFontSize%3D%2712%27%20showLegend%3D%271%27&graphid=-1`;
      const buffer = await this.screenshotService.capture(screenshotUrl);
      if (buffer) {
        screenshotBase64 = buffer.toString('base64');
      }
    } catch (error) {
      // Screenshot failure is non-blocking
      if (!metricsError) {
        metricsError = `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    return {
      configId: config.id,
      title: config.title,
      sensorId: config.sensorId,
      metrics,
      screenshotBase64,
      error: metricsError,
    };
  }

  /**
   * Proxies the PRTG chart image with authentication cookie.
   * The frontend can't access PRTG directly due to cross-domain cookie restrictions.
   * GET /api/monitoring/chart/:sensorId
   */
  @Get('chart/:sensorId')
  async getChart(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Res() res: express.Response,
  ): Promise<void> {
    const settings = await this.prtgSetting.getSettingRaw();
    const baseUrl = new URL(settings.loginUrl);
    const chartUrl = `${baseUrl.protocol}//${baseUrl.host}/chart.png?type=graph&graphid=0&graphtitle=%40%40notitle%40%40&width=1850&height=600&bgcolor=%23ffffff&graphstylefile=graphstyling.htm&animationandinteraction=1&datastylefile=graphdatastyling.htm&animationstylefile=graphanimationstyling.htm&graphstyling=baseFontSize%3D%2716%27%20showLegend%3D%270%27&tooltexts=1&datastyling=drawAnchors%3D%271%27%20anchorRadius%3D%272%27%20lineThickness%3D%273%27&refreshable=true&columns=datetime%2Cvalue_%2Ccoverage&_=1778313214275&myid=03298781&hide=NaN&id=${sensorId}&username=${encodeURIComponent(settings.loginUsername ?? '')}&passhash=${encodeURIComponent(settings.loginPassword ?? '')}`;

    try {
      const response = await axios.get(chartUrl, {
        // headers: { Cookie: cookie },
        responseType: 'arraybuffer',
        timeout: 15000,
        validateStatus: () => true,
      });

      if (response.status !== 200) {
        res.status(response.status).send('Chart not available');
        return;
      }

      // Automatically add a white background and sharpen the HD image
      const imageWithWhiteBg = await sharp(response.data)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .sharpen()
        .png({ quality: 100 })
        .toBuffer();

      res.set('Content-Type', 'image/png');
      res.set(
        'Cache-Control',
        'public, max-age=60, stale-while-revalidate=120',
      );
      res.send(imageWithWhiteBg);
    } catch (error) {
      res
        .status(502)
        .send(
          `Failed to fetch chart: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
  }
}

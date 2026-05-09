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
import { MonitoringSchedulerService } from '../scheduler/monitoring-scheduler.service';
import { AlertDispatcherService } from '../dispatcher/alert-dispatcher.service';
import { ScreenshotService } from '../dispatcher/screenshot.service';
import { MetricParserService } from '../parser/metric-parser.service';
import { CookieVaultService } from '../../cookie-vault/cookie-vault.service';
import { PrtgSettingService } from '../../prtg-setting/prtg-setting.service';
import { PrtgReportService } from '../../prtg-report/prtg-report.service';

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
    private readonly cookieVault: CookieVaultService,
    private readonly prtgSetting: PrtgSettingService,
  ) { }

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
      throw new BadRequestException(
        `Config ${id} is not monitoring-enabled`,
      );
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
  async testSample(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{
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
      const cookie = await this.cookieVault.getActiveCookie();

      const now = new Date();
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const formatDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}-${String(d.getSeconds()).padStart(2, '0')}`;

      const monitoringUrl = `${baseUrl.protocol}//${baseUrl.host}/api/historicdata.json?id=${config.sensorId}&avg=0&sdate=${formatDate(fiveMinAgo)}&edate=${formatDate(now)}&usecaption=1`;

      const response = await axios.get(monitoringUrl, {
        headers: { Cookie: cookie },
        timeout: 15000,
        validateStatus: () => true,
      });

      if (response.status === 200 && response.data) {
        const rawText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
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
      const screenshotUrl = `http://prtg.r1net.id/graphzoom.htm?id=${config.sensorId}&graphid=1&clgid=&dynamicgraph=1`;
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
    let cookie: string;
    try {
      cookie = await this.cookieVault.getActiveCookie();
    } catch {
      res.status(503).send('No active PRTG cookie available');
      return;
    }

    const settings = await this.prtgSetting.getSettingRaw();
    const baseUrl = new URL(settings.loginUrl);
    const chartUrl = `${baseUrl.protocol}//${baseUrl.host}/chart.png?type=graph&graphid=0&graphtitle=%40%40notitle%40%40&width=925&height=300&bgcolor=%23f3f2f2&graphstylefile=graphstyling.htm&animationandinteraction=1&datastylefile=graphdatastyling.htm&animationstylefile=graphanimationstyling.htm&graphstyling=baseFontSize%3D%2710%27%20showLegend%3D%270%27&tooltexts=1&datastyling=drawAnchors%3D%271%27%20anchorRadius%3D%271%27%20lineThickness%3D%272%27&refreshable=true&columns=datetime%2Cvalue_%2Ccoverage&_=1778313214275&myid=03298781&hide=NaN&id=${sensorId}`;
    // const chartUrl = `${baseUrl.protocol}//${baseUrl.host}/chart.png?type=graph&width=850&height=270&graphid=3&id=${sensorId}`;

    try {
      const response = await axios.get(chartUrl, {
        headers: { Cookie: cookie },
        responseType: 'arraybuffer',
        timeout: 15000,
        validateStatus: () => true,
      });

      if (response.status !== 200) {
        res.status(response.status).send('Chart not available');
        return;
      }

      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'no-cache, max-age=0');
      res.send(Buffer.from(response.data));
    } catch (error) {
      res
        .status(502)
        .send(
          `Failed to fetch chart: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
  }
}

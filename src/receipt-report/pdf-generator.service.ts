/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger } from '@nestjs/common';
import { BrowserPoolService } from '../monitoring/dispatcher/browser-pool.service';
import { BrowserContext } from 'playwright';

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);

  constructor(private readonly browserPool: BrowserPoolService) {}

  async generatePdf(snapshot: any): Promise<Buffer | null> {
    const html = this.buildHtml(snapshot);
    let context: BrowserContext | null = null;

    try {
      context = await this.browserPool.createContext();
      if (!context) throw new Error('Failed to create browser context');
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' });

      // Wait for chart images to load
      await page.waitForTimeout(2000);

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '24px', bottom: '24px', left: '24px', right: '24px' },
      });

      return pdfBuffer;
    } catch (error) {
      this.logger.error(
        `Failed to generate PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    } finally {
      if (context) {
        await context.close();
      }
    }
  }

  private buildHtml(snapshot: any): string {
    const reportData: any[] = Array.isArray(snapshot.reportData)
      ? snapshot.reportData
      : [];
    const groupName = snapshot.groupName || 'Semua Grup';
    const period = snapshot.period || 'DAILY';
    const periodLabel =
      period === 'DAILY'
        ? 'Harian'
        : period === 'WEEKLY'
          ? 'Mingguan'
          : 'Bulanan';

    const startDate = new Date(snapshot.startDate);
    const endDate = snapshot.endDate ? new Date(snapshot.endDate) : new Date();
    const dateOpts: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    const startStr = startDate.toLocaleDateString('id-ID', dateOpts);
    const endStr = endDate.toLocaleDateString('id-ID', dateOpts);
    const dateRange =
      period === 'DAILY' ? startStr : `${startStr} — ${endStr}`;

    const totalConfigs = reportData.length;
    const totalDown = reportData.reduce(
      (a: number, c: any) => a + (c.downCount || 0),
      0,
    );
    const totalLowTraffic = reportData.reduce(
      (a: number, c: any) => a + (c.lowTrafficCount || 0),
      0,
    );
    const totalIncidents = totalDown + totalLowTraffic;

    // Group by groupName
    const grouped: Record<string, any[]> = {};
    for (const config of reportData) {
      const gn = config.groupName || 'Unassigned';
      if (!grouped[gn]) grouped[gn] = [];
      grouped[gn].push(config);
    }

    let configsHtml = '';
    for (const [gn, configs] of Object.entries(grouped)) {
      configsHtml += `<div class="group-section">
        <div class="group-header">${gn}</div>`;

      for (const config of configs) {
        const incidents: any[] = config.incidents || [];

        // Build per-incident detail blocks (each with its own chart)
        let incidentBlocks = '';
        if (incidents.length > 0) {
          for (let idx = 0; idx < incidents.length; idx++) {
            const inc = incidents[idx];
            const t1 = new Date(inc.time);
            const t2 = inc.recoveryTime ? new Date(inc.recoveryTime) : null;
            const timeStr = t1.toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Asia/Jakarta',
            });
            const recovStr = t2
              ? t2.toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Asia/Jakarta',
                })
              : '—';
            let duration = '—';
            if (t2) {
              const diffMs = t2.getTime() - t1.getTime();
              const diffMin = Math.floor(diffMs / 60000);
              if (diffMin >= 60) {
                const h = Math.floor(diffMin / 60);
                const m = diffMin % 60;
                duration = `${h}j ${m}m`;
              } else {
                duration = `${diffMin}m`;
              }
            }

            const statusClass =
              inc.status === 'DOWN' ? 'status-down' : 'status-low';
            const statusLabel =
              inc.status === 'DOWN' ? 'DOWN' : 'LOW TRAFFIC';

            const inBefore =
              inc.inboundBefore != null
                ? (inc.inboundBefore / 1000 / 1000).toFixed(2)
                : '—';
            const inDuring =
              inc.inboundDuring != null
                ? (inc.inboundDuring / 1000 / 1000).toFixed(2)
                : '—';
            const outBefore =
              inc.outboundBefore != null
                ? (inc.outboundBefore / 1000 / 1000).toFixed(2)
                : '—';
            const outDuring =
              inc.outboundDuring != null
                ? (inc.outboundDuring / 1000 / 1000).toFixed(2)
                : '—';

            const chartHtml = inc.r2ImageUrl
              ? `<div class="chart-container">
                   <img src="${inc.r2ImageUrl}" alt="Traffic Chart" />
                 </div>`
              : '';

            incidentBlocks += `
              <div class="incident-block">
                <div class="incident-header">
                  <div class="incident-left">
                    <span class="badge ${statusClass}">${statusLabel}</span>
                    <span class="incident-time">${timeStr} WIB</span>
                    ${t2 ? `<span class="incident-recovery">→ Pulih ${recovStr} WIB</span>` : ''}
                    <span class="incident-duration">(${duration})</span>
                  </div>
                </div>
                <div class="traffic-grid">
                  <div class="traffic-item">
                    <div class="traffic-label">Traffic In ${inc.status === 'LOW_TRAFFIC' ? '(Avg)' : ''}</div>
                    <div class="traffic-values">
                      <span class="traffic-good">${inBefore}</span>
                      <span class="arrow">→</span>
                      <span class="traffic-bad">${inDuring}</span>
                      <span class="traffic-unit">Mbps</span>
                    </div>
                  </div>
                  <div class="traffic-item">
                    <div class="traffic-label">Traffic Out ${inc.status === 'LOW_TRAFFIC' ? '(Avg)' : ''}</div>
                    <div class="traffic-values">
                      <span class="traffic-good">${outBefore}</span>
                      <span class="arrow">→</span>
                      <span class="traffic-bad">${outDuring}</span>
                      <span class="traffic-unit">Mbps</span>
                    </div>
                  </div>
                </div>
                ${chartHtml}
              </div>`;
          }
        }

        configsHtml += `
          <div class="config-card">
            <div class="config-header">
              <div class="config-title">${config.title}</div>
              <div class="config-stats">
                ${config.downCount > 0 ? `<span class="stat-down">${config.downCount}× Down</span>` : ''}
                ${config.lowTrafficCount > 0 ? `<span class="stat-low">${config.lowTrafficCount}× Low Traffic</span>` : ''}
              </div>
            </div>
            ${
              incidents.length > 0
                ? incidentBlocks
                : `<p class="no-incident">Tidak ada insiden tercatat</p>`
            }
          </div>`;
      }
      configsHtml += '</div>';
    }

    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #1a1a2e;
      font-size: 10px;
      line-height: 1.5;
      background: #fff;
    }

    /* ── Cover / Header ── */
    .report-header {
      background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
      color: #fff;
      padding: 32px 28px 24px;
      border-radius: 0 0 12px 12px;
      margin-bottom: 20px;
    }
    .report-header .logo-line {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
      opacity: 0.7;
    }
    .report-header .logo-dot {
      width: 8px; height: 8px;
      background: #38bdf8;
      border-radius: 50%;
    }
    .report-header h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.3px;
      margin-bottom: 4px;
    }
    .report-header .subtitle {
      font-size: 12px;
      opacity: 0.8;
      font-weight: 400;
    }
    .report-header .meta-row {
      display: flex;
      gap: 24px;
      margin-top: 14px;
      font-size: 10px;
    }
    .report-header .meta-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .report-header .meta-label {
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
      opacity: 0.5;
    }
    .report-header .meta-value {
      font-weight: 600;
      font-size: 11px;
    }

    /* ── Summary Cards ── */
    .summary-grid {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }
    .summary-card {
      flex: 1;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 16px;
      text-align: center;
    }
    .summary-card .s-value {
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
    }
    .summary-card .s-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #64748b;
      margin-top: 2px;
    }
    .summary-card.danger .s-value { color: #dc2626; }
    .summary-card.warning .s-value { color: #ea580c; }

    /* ── Group Section ── */
    .group-section {
      margin-bottom: 16px;
      page-break-inside: avoid;
    }
    .group-header {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      padding: 8px 12px;
      background: #f1f5f9;
      border-left: 3px solid #3b82f6;
      border-radius: 4px;
      margin-bottom: 10px;
    }

    /* ── Config Card ── */
    .config-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 14px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .config-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    .config-title {
      font-size: 12px;
      font-weight: 600;
      color: #0f172a;
    }
    .config-stats {
      display: flex;
      gap: 8px;
    }
    .stat-down {
      font-size: 9px;
      font-weight: 600;
      color: #dc2626;
      background: #fef2f2;
      padding: 2px 8px;
      border-radius: 99px;
    }
    .stat-low {
      font-size: 9px;
      font-weight: 600;
      color: #ea580c;
      background: #fff7ed;
      padding: 2px 8px;
      border-radius: 99px;
    }

    /* ── Incident Block ── */
    .incident-block {
      padding: 12px 14px;
      border-bottom: 1px solid #f1f5f9;
    }
    .incident-block:last-child {
      border-bottom: none;
    }
    .incident-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .incident-left {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .incident-time {
      font-size: 11px;
      font-weight: 600;
      color: #0f172a;
      font-family: 'SF Mono', 'Fira Code', monospace;
    }
    .incident-recovery {
      font-size: 10px;
      color: #16a34a;
      font-weight: 500;
    }
    .incident-duration {
      font-size: 9px;
      color: #64748b;
    }

    /* ── Traffic Grid ── */
    .traffic-grid {
      display: flex;
      gap: 16px;
      margin-bottom: 8px;
    }
    .traffic-item {
      flex: 1;
    }
    .traffic-label {
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      margin-bottom: 2px;
    }
    .traffic-values {
      display: flex;
      align-items: baseline;
      gap: 2px;
    }
    .traffic-unit {
      font-size: 8px;
      color: #94a3b8;
      margin-left: 2px;
    }

    /* ── Status Badge ── */
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }
    .status-down {
      background: #dc2626;
      color: #fff;
    }
    .status-low {
      background: #ea580c;
      color: #fff;
    }

    /* ── Traffic Values ── */
    .traffic-good {
      color: #16a34a;
      font-weight: 600;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 10px;
    }
    .traffic-bad {
      color: #dc2626;
      font-weight: 600;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 10px;
    }
    .arrow {
      color: #94a3b8;
      margin: 0 3px;
      font-size: 9px;
    }

    /* ── Chart ── */
    .chart-container {
      padding: 4px 0 8px;
      background: #f8fafc;
      border-radius: 4px;
    }
    .chart-container img {
      width: 100%;
      height: auto;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }

    /* ── No Incident ── */
    .no-incident {
      padding: 14px;
      text-align: center;
      color: #16a34a;
      font-weight: 500;
      font-size: 10px;
      background: #f0fdf4;
    }

    /* ── Footer ── */
    .report-footer {
      margin-top: 20px;
      padding: 12px 0;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 8px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="report-header">
    <div class="logo-line">
      <span class="logo-dot"></span>
      NOC Monitoring Report
    </div>
    <h1>Laporan Bandwidth ${periodLabel}</h1>
    <p class="subtitle">${dateRange}</p>
    <div class="meta-row">
      <div class="meta-item">
        <span class="meta-label">Grup</span>
        <span class="meta-value">${groupName}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Periode</span>
        <span class="meta-value">${periodLabel}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Generated</span>
        <span class="meta-value">${new Date().toLocaleDateString('id-ID', dateOpts)}</span>
      </div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="s-value">${totalConfigs}</div>
      <div class="s-label">Total Sensor</div>
    </div>
    <div class="summary-card danger">
      <div class="s-value">${totalDown}</div>
      <div class="s-label">Total Down</div>
    </div>
    <div class="summary-card warning">
      <div class="s-value">${totalLowTraffic}</div>
      <div class="s-label">Total Low Traffic</div>
    </div>
    <div class="summary-card">
      <div class="s-value">${totalIncidents}</div>
      <div class="s-label">Total Insiden</div>
    </div>
  </div>

  ${configsHtml}

  <div class="report-footer">
    Generated by PRTG NOC Monitoring System &bull; ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
  </div>
</body>
</html>`;
  }
}

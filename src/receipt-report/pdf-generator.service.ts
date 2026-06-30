/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger } from '@nestjs/common';
import type { BrowserContext } from 'playwright';
import { BrowserPoolService } from '../monitoring/dispatcher/browser-pool.service';

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);

  constructor(private readonly browserPool: BrowserPoolService) {}

  /**
   * Generates a PDF buffer from the snapshot data.
   */
  async generatePdf(snapshot: any): Promise<Buffer | null> {
    const html = this.buildHtml(snapshot);
    let context: BrowserContext | null = null;

    try {
      context = await this.browserPool.createContext();
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' });

      // Ensure fonts and images are loaded
      await page.waitForTimeout(2000);

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
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
    const reportData = snapshot.reportData || {};
    const groupName = snapshot.groupName || 'All Groups';
    const period = snapshot.period || 'DAILY';
    const dateStr = new Date(snapshot.createdAt).toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let totalConfigs = 0;
    let totalIncidents = 0;
    let configsHtml = '';

    const sortedGroups = Object.keys(reportData).sort();

    for (const group of sortedGroups) {
      const groupConfigs = reportData[group];
      for (const config of groupConfigs) {
        totalConfigs++;
        totalIncidents += config.incidents?.length || 0;

        let incidentsHtml = '';
        if (config.incidents && config.incidents.length > 0) {
          incidentsHtml = `
            <table class="incident-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Waktu Kejadian</th>
                  <th>Waktu Pulih</th>
                  <th>Durasi (Menit)</th>
                </tr>
              </thead>
              <tbody>
                ${config.incidents
                  .map((inc: any) => {
                    const t1 = new Date(inc.time);
                    const t2 = inc.recoveryTime
                      ? new Date(inc.recoveryTime)
                      : null;
                    let duration = 'Belum Pulih';
                    if (t2) {
                      const diffMs = t2.getTime() - t1.getTime();
                      duration = Math.round(diffMs / 60000).toString();
                    }
                    return `
                    <tr>
                      <td><span class="status ${inc.status.toLowerCase()}">${inc.status}</span></td>
                      <td>${t1.toLocaleTimeString('id-ID')}</td>
                      <td>${t2 ? t2.toLocaleTimeString('id-ID') : '-'}</td>
                      <td>${duration}</td>
                    </tr>
                  `;
                  })
                  .join('')}
              </tbody>
            </table>
          `;
        } else {
          incidentsHtml = `<p class="no-incident">100% Uptime (Tidak ada gangguan)</p>`;
        }

        const imageHtml = config.r2ImageUrl
          ? `<img src="${config.r2ImageUrl}" alt="Traffic Graph" class="traffic-graph" />`
          : `<p class="no-graph">Grafik tidak tersedia</p>`;

        configsHtml += `
          <div class="config-card">
            <h3>${config.title}</h3>
            ${imageHtml}
            <h4>Detail Insiden</h4>
            ${incidentsHtml}
          </div>
        `;
      }
    }

    return `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #333;
            margin: 0;
            padding: 0;
          }
          .header {
            background-color: #004d99;
            color: #fff;
            padding: 20px;
            text-align: center;
          }
          .header h1 { margin: 0; font-size: 24px; }
          .header h2 { margin: 5px 0 0; font-size: 16px; font-weight: normal; opacity: 0.9; }
          .summary {
            display: flex;
            justify-content: space-around;
            background-color: #f4f6f9;
            padding: 15px;
            margin: 20px;
            border-radius: 8px;
            border: 1px solid #e0e4e8;
          }
          .summary-item {
            text-align: center;
          }
          .summary-item .label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
          }
          .summary-item .value {
            font-size: 24px;
            font-weight: bold;
            color: #004d99;
          }
          .content {
            padding: 0 20px;
          }
          .config-card {
            border: 1px solid #e0e4e8;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
            page-break-inside: avoid;
          }
          .config-card h3 {
            margin-top: 0;
            color: #004d99;
            border-bottom: 2px solid #f4f6f9;
            padding-bottom: 10px;
          }
          .config-card h4 {
            margin-bottom: 10px;
            color: #444;
          }
          .traffic-graph {
            width: 100%;
            height: auto;
            border-radius: 4px;
            margin-bottom: 15px;
          }
          .incident-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }
          .incident-table th, .incident-table td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }
          .incident-table th {
            background-color: #f4f6f9;
            color: #333;
          }
          .status {
            padding: 3px 8px;
            border-radius: 12px;
            font-weight: bold;
            font-size: 11px;
            text-transform: uppercase;
          }
          .status.down { background-color: #ffebee; color: #c62828; }
          .status.low_traffic { background-color: #fff8e1; color: #f57f17; }
          .status.normal { background-color: #e8f5e9; color: #2e7d32; }
          .no-incident {
            color: #2e7d32;
            font-weight: bold;
          }
          .no-graph {
            color: #888;
            font-style: italic;
          }
          .footer {
            text-align: center;
            font-size: 10px;
            color: #888;
            margin-top: 30px;
            padding-top: 10px;
            border-top: 1px solid #eee;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>R1NET NOC - Laporan Traffic & Insiden</h1>
          <h2>Laporan ${period} - Group: ${groupName} - ${dateStr}</h2>
        </div>
        
        <div class="summary">
          <div class="summary-item">
            <div class="label">Total Titik / Sensor</div>
            <div class="value">${totalConfigs}</div>
          </div>
          <div class="summary-item">
            <div class="label">Total Insiden</div>
            <div class="value">${totalIncidents}</div>
          </div>
        </div>

        <div class="content">
          ${configsHtml}
        </div>
        
        <div class="footer">
          Digenerate secara otomatis oleh sistem R1NET NOC pada ${new Date().toLocaleString('id-ID')}
        </div>
      </body>
      </html>
    `;
  }
}

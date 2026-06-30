import { Injectable, Logger } from '@nestjs/common';
import { BrowserPoolService } from '../storage/browser-pool.service';
import { BrowserContext } from 'playwright';

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);

  constructor(private readonly browserPool: BrowserPoolService) {}

  async generatePdf(snapshot: any): Promise<Buffer | null> {
    const port = process.env.PORT || 3000;
    const url = `http://127.0.0.1:${port}/report/${snapshot.id}?print=true`;
    let context: BrowserContext | null = null;

    try {
      context = await this.browserPool.createContext();
      const page = await context.newPage();
      
      // Navigate to the frontend URL and wait for network to be idle
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      
      // Wait an extra 3 seconds to ensure all React components (and images/charts) are fully rendered
      await page.waitForTimeout(3000);

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
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
}

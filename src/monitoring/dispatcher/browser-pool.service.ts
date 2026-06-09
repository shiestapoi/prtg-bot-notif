import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { chromium } from 'playwright';
import type { Browser, BrowserContext } from 'playwright';

/**
 * BrowserPoolService maintains a persistent Playwright browser instance
 * that is always ready for use. This avoids the overhead of launching
 * a new browser for every screenshot or login operation.
 *
 * The browser is launched once on module init and closed on module destroy.
 * If the browser crashes, it is automatically relaunched on next use.
 */
@Injectable()
export class BrowserPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BrowserPoolService.name);
  private browser: Browser | null = null;

  async onModuleInit(): Promise<void> {
    await this.ensureBrowser();
    this.logger.log('Playwright browser pool initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
    this.logger.log('Playwright browser pool closed');
  }

  /**
   * Returns the persistent browser instance, launching it if needed.
   */
  async getBrowser(): Promise<Browser> {
    return this.ensureBrowser();
  }

  /**
   * Creates a new browser context with PRTG-optimized settings.
   * Each context is isolated (separate cookies, storage).
   * Caller is responsible for closing the context when done.
   *
   * Cookie tidak dipakai lagi — auth sekarang menggunakan username/passhash query params.
   * Parameter cookie tetap ada untuk backward compatibility tapi tidak digunakan.
   */
  async createContext(_cookie?: string): Promise<BrowserContext> {
    const browser = await this.ensureBrowser();
    const headers: Record<string, string> = {
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    };
    // Cookie tidak dipakai lagi — auth via username/passhash query params
    // if (cookie) {
    //   headers.Cookie = cookie;
    // }

    return browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1366, height: 768 },
      deviceScaleFactor: 2,
      extraHTTPHeaders: headers,
    });
  }

  /**
   * Closes the browser instance.
   */
  async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore close errors
      }
      this.browser = null;
    }
  }

  /**
   * Ensures the browser is running. Relaunches if crashed or not started.
   */
  private async ensureBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    // Browser is null or disconnected — relaunch
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore
      }
    }

    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Prevent shared memory exhaustion in Docker/VPS
        '--disable-gpu', // Disable GPU hardware acceleration
        '--no-zygote', // Reduce memory footprint
        '--single-process', // Run in a single process to save RAM
      ],
    });

    // Auto-relaunch on disconnect
    this.browser.on('disconnected', () => {
      this.logger.warn('Browser disconnected, will relaunch on next use');
      this.browser = null;
    });

    return this.browser;
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger } from '@nestjs/common';
import type { BrowserContext } from 'playwright';
import axios from 'axios';
import sharp from 'sharp';
// Cookie tidak dipakai lagi â€” auth sekarang menggunakan username/passhash query params
// import { CookieVaultService } from '../../cookie-vault/cookie-vault.service';
import { PrtgSettingService } from '../../prtg-setting/prtg-setting.service';
import { BrowserPoolService } from './browser-pool.service';

@Injectable()
export class ScreenshotService {
  private readonly logger = new Logger(ScreenshotService.name);

  constructor(
    // Cookie tidak dipakai lagi â€” auth sekarang menggunakan username/passhash query params
    // private readonly cookieVault: CookieVaultService,
    private readonly prtgSetting: PrtgSettingService,
    private readonly browserPool: BrowserPoolService,
  ) {}

  /**
   * Captures a PNG screenshot of the given PRTG page URL.
   * Uses the persistent browser pool for fast execution.
   * Auth via username/passhash query params appended to the URL.
   * Returns the screenshot as a Buffer, or null if capture fails.
   * Screenshot failure must not block alert dispatch.
   */
  async capture(pageUrl: string): Promise<Buffer | null> {
    let context: BrowserContext | null = null;
    try {
      const settings = await this.prtgSetting.getSettingRaw();
      const authUrl = this.appendAuthParams(pageUrl, settings);

      // If URL is an image directly, use axios instead of playwright
      if (pageUrl.includes('.png') || pageUrl.includes('.jpg')) {
        const response = await axios.get(authUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
          validateStatus: () => true,
        });
        if (response.status === 200) {
          const imageWithWhiteBg = await sharp(response.data)
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            .sharpen()
            .png({ quality: 100 })
            .toBuffer();
          return imageWithWhiteBg;
        }
        this.logger.warn(
          `Failed to fetch image via axios. HTTP ${response.status}`,
        );
        return null;
      }

      // Cookie tidak dipakai lagi â€” context tanpa cookie
      context = await this.browserPool.createContext();

      const page = await context.newPage();
      await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1500);

      return await page.screenshot({ type: 'png', fullPage: false });
    } catch (error) {
      this.logger.warn(
        `Screenshot capture failed for ${pageUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    } finally {
      await context?.close();
    }
  }

  /**
   * Appends username/passhash query params to the given URL for PRTG auth.
   */
  private appendAuthParams(
    url: string,
    settings: { loginUsername: string | null; loginPassword: string | null },
  ): string {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}username=${encodeURIComponent(settings.loginUsername ?? '')}&passhash=${encodeURIComponent(settings.loginPassword ?? '')}`;
  }
}

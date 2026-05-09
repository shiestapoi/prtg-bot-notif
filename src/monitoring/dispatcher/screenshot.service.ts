import { Injectable, Logger } from '@nestjs/common';
import type { BrowserContext, Page } from 'playwright';
import { CookieVaultService } from '../../cookie-vault/cookie-vault.service';
import { PrtgSettingService } from '../../prtg-setting/prtg-setting.service';
import { BrowserPoolService } from './browser-pool.service';

const defaultPrtgLoginUrl = 'http://prtg.r1net.id/index.htm';
const prtgUsernameXPath =
  '/html/body/div/div[2]/div/table/tbody/tr[1]/td[1]/form/input[2]';
const prtgPasswordXPath =
  '/html/body/div/div[2]/div/table/tbody/tr[1]/td[1]/form/input[3]';

@Injectable()
export class ScreenshotService {
  private readonly logger = new Logger(ScreenshotService.name);

  constructor(
    private readonly cookieVault: CookieVaultService,
    private readonly prtgSetting: PrtgSettingService,
    private readonly browserPool: BrowserPoolService,
  ) {}

  /**
   * Captures a PNG screenshot of the given PRTG page URL.
   * Uses the persistent browser pool for fast execution.
   * Returns the screenshot as a Buffer, or null if capture fails.
   * Screenshot failure must not block alert dispatch.
   */
  async capture(pageUrl: string): Promise<Buffer | null> {
    let context: BrowserContext | null = null;
    try {
      const cookie = await this.cookieVault.getActiveCookie();
      context = await this.browserPool.createContext(cookie);

      const page = await context.newPage();
      await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1500);

      // Handle PRTG login page if cookie expired
      const settings = await this.prtgSetting.getSettingRaw();
      if (await this.isPrtgLoginPage(page, settings.loginUrl)) {
        await this.autoLogin(page, context, pageUrl, settings);
      }

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
   * Attempts auto-login on the PRTG login page using configured credentials.
   * After login, navigates back to the original page URL.
   */
  private async autoLogin(
    page: Page,
    context: BrowserContext,
    originalUrl: string,
    settings: { loginUrl: string; loginUsername: string | null; loginPassword: string | null },
  ): Promise<void> {
    if (!settings.loginUsername || !settings.loginPassword) {
      throw new Error('PRTG auto-login credentials are not configured.');
    }

    await page
      .locator(`xpath=${prtgUsernameXPath}`)
      .fill(settings.loginUsername, { timeout: 10000 });
    await page
      .locator(`xpath=${prtgPasswordXPath}`)
      .fill(settings.loginPassword, { timeout: 10000 });

    await Promise.all([
      page
        .waitForURL(
          (targetUrl) =>
            !this.isPrtgLoginUrl(targetUrl.toString(), settings.loginUrl),
          { timeout: 45000 },
        )
        .catch(() => undefined),
      page.keyboard.press('Enter'),
    ]);
    await page
      .waitForLoadState('networkidle', { timeout: 45000 })
      .catch(() => undefined);
    await page.waitForTimeout(1500);

    // Extract cookies from the browser context and update headers
    const cookies = await context.cookies(originalUrl);
    const cookieValue = cookies
      .filter((c) => c.name && c.value)
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');

    if (cookieValue) {
      await context.setExtraHTTPHeaders({
        Cookie: cookieValue,
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
      });
    }

    // Navigate back to the original URL after login
    await page.goto(originalUrl, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);
  }

  /**
   * Detects whether the current page is the PRTG login page.
   * Checks URL match and presence of login form fields.
   */
  private async isPrtgLoginPage(
    page: Page,
    configuredLoginUrl: string,
  ): Promise<boolean> {
    if (this.isPrtgLoginUrl(page.url(), configuredLoginUrl)) {
      return true;
    }

    const username = page.locator(`xpath=${prtgUsernameXPath}`);
    const password = page.locator(`xpath=${prtgPasswordXPath}`);
    const hasUsername =
      (await username.count()) > 0 && (await username.first().isVisible());
    const hasPassword =
      (await password.count()) > 0 && (await password.first().isVisible());

    if (hasUsername && hasPassword) {
      return true;
    }

    const loginForm = page
      .locator('form input[type="password"], input[name*="pass" i]')
      .first();
    return (await loginForm.count()) > 0 && (await loginForm.isVisible());
  }

  /**
   * Checks if a URL matches the configured PRTG login URL by hostname and pathname.
   */
  private isPrtgLoginUrl(
    value: string | undefined | null,
    configuredLoginUrl = defaultPrtgLoginUrl,
  ): boolean {
    if (!value) {
      return false;
    }

    try {
      const url = new URL(value);
      const loginUrl = new URL(configuredLoginUrl || defaultPrtgLoginUrl);
      return (
        url.hostname.toLowerCase() === loginUrl.hostname.toLowerCase() &&
        url.pathname.toLowerCase() === loginUrl.pathname.toLowerCase()
      );
    } catch {
      return value.toLowerCase().includes('prtg.r1net.id/index.htm');
    }
  }
}

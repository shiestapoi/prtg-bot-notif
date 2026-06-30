import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private s3Client: S3Client | null = null;
  private isConfigured = false;
  private bucketName = '';
  private publicBaseUrl = '';

  constructor() {
    this.initClient();
  }

  private initClient() {
    const provider = process.env.UPLOAD_STORAGE_PROVIDER;
    if (provider !== 'r2') {
      return;
    }

    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    this.bucketName = process.env.R2_BUCKET || '';
    this.publicBaseUrl =
      process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, '') || '';

    if (!accountId || !accessKeyId || !secretAccessKey || !this.bucketName) {
      this.logger.warn(
        'R2 credentials are not fully configured. Upload will be disabled.',
      );
      return;
    }

    try {
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.isConfigured = true;
      this.logger.log('R2 Storage Service initialized successfully.');
    } catch (e) {
      this.logger.error(`Failed to initialize R2 S3 Client: ${e}`);
    }
  }

  /**
   * Uploads an image buffer to Cloudflare R2
   * @param buffer Image buffer
   * @param path Target path (e.g., reports/image/DAILY/group/2026-06-30/123.png)
   * @param contentType MIME type (default image/png)
   * @returns Public URL of the uploaded image or null if failed
   */
  async uploadImage(
    buffer: Buffer,
    path: string,
    contentType = 'image/png',
  ): Promise<string | null> {
    if (!this.isConfigured || !this.s3Client) {
      this.logger.warn(
        `Storage provider is not configured. Skipping upload for ${path}`,
      );
      return null;
    }

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: path,
        Body: buffer,
        ContentType: contentType,
      });

      await this.s3Client.send(command);
      return `${this.publicBaseUrl}/${path}`;
    } catch (e) {
      this.logger.error(`Failed to upload image to R2 (${path}): ${e}`);
      return null;
    }
  }

  /**
   * Uploads a PDF buffer to Cloudflare R2
   * @param buffer PDF buffer
   * @param path Target path (e.g., reports/pdf/DAILY/group/2026-06-30/abc.pdf)
   * @returns Public URL of the uploaded PDF or null if failed
   */
  async uploadPdf(buffer: Buffer, path: string): Promise<string | null> {
    if (!this.isConfigured || !this.s3Client) {
      this.logger.warn(
        `Storage provider is not configured. Skipping upload for ${path}`,
      );
      return null;
    }

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: path,
        Body: buffer,
        ContentType: 'application/pdf',
      });

      await this.s3Client.send(command);
      return `${this.publicBaseUrl}/${path}`;
    } catch (e) {
      this.logger.error(`Failed to upload PDF to R2 (${path}): ${e}`);
      return null;
    }
  }
}

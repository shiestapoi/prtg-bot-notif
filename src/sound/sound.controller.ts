/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';

interface MulterFile {
  originalname: string;
  filename: string;
  size: number;
  mimetype: string;
}

const SOUNDS_DIR = path.join(process.cwd(), 'frontend', 'public', 'sounds');

// Pastikan folder exists
if (!fs.existsSync(SOUNDS_DIR)) {
  fs.mkdirSync(SOUNDS_DIR, { recursive: true });
}

@Controller('api/sounds')
export class SoundController {
  @Get()
  listSounds() {
    try {
      if (!fs.existsSync(SOUNDS_DIR)) {
        return [];
      }
      const files = fs.readdirSync(SOUNDS_DIR);
      const audioFiles = files.filter(
        (f) => f.endsWith('.wav') || f.endsWith('.mp3'),
      );
      return audioFiles.map((file) => {
        const stats = fs.statSync(path.join(SOUNDS_DIR, file));
        return {
          name: file,
          size: stats.size,
          createdAt: stats.birthtime,
          url: `/sounds/${file}`,
        };
      });
    } catch (error) {
      console.error('Failed to list sounds:', error);
      throw new BadRequestException('Gagal memuat daftar suara');
    }
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: SOUNDS_DIR,
        filename: (req: any, file: MulterFile, cb: any) => {
          // Bersihkan nama file dari karakter aneh
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = path.extname(file.originalname).toLowerCase();
          const baseName = path
            .basename(file.originalname, ext)
            .replace(/[^a-zA-Z0-9_-]/g, '_');
          cb(null, `${baseName}-${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req: any, file: MulterFile, cb: any) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.wav' || ext === '.mp3') {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Hanya format .wav dan .mp3 yang diizinkan',
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB max
      },
    }),
  )
  uploadSound(@UploadedFile() file: MulterFile) {
    if (!file) {
      throw new BadRequestException(
        'File tidak ditemukan atau format tidak didukung',
      );
    }
    return {
      message: 'File berhasil diunggah',
      filename: file.filename,
      size: file.size,
      url: `/sounds/${file.filename}`,
    };
  }

  @Delete(':filename')
  @HttpCode(HttpStatus.OK)
  deleteSound(@Param('filename') filename: string) {
    const safeFilename = path.basename(filename);
    const filePath = path.join(SOUNDS_DIR, safeFilename);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File suara tidak ditemukan');
    }

    try {
      fs.unlinkSync(filePath);
      return { message: `File ${safeFilename} berhasil dihapus` };
    } catch (error) {
      console.error('Failed to delete sound:', error);
      throw new BadRequestException('Gagal menghapus file suara');
    }
  }
}

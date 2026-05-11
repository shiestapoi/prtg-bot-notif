import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCookieDto } from './dto/create-cookie.dto';
import { UpdateCookieDto } from './dto/update-cookie.dto';

function normalizeCurlCommand(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\s*\^\s*\n\s*/g, ' ')
    .replace(/\^\r?\n/g, ' ')
    .replace(/\^/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeInput(value: string | undefined | null) {
  return value?.trim() ?? '';
}

function readCurlOption(command: string, flags: string[]) {
  for (const flag of flags) {
    const pattern = new RegExp(
      `(?:^|\\s)${flag.replace('-', '\\-')}\\s+(?:"([^"]*)"|'([^']*)'|([^\\s]+))`,
      'i',
    );
    const match = command.match(pattern);
    if (match) {
      return normalizeInput(match[1] ?? match[2] ?? match[3]);
    }
  }

  return '';
}

function parsePrtgCurlCommand(value: string | undefined | null) {
  const rawCommand = normalizeInput(value);
  if (!rawCommand) {
    return null;
  }

  const command = normalizeCurlCommand(rawCommand);
  const urlMatch = command.match(
    /\bcurl(?:\.exe)?\s+(?:"([^"]+)"|'([^']+)'|(\S+))/i,
  );
  const requestUrl = normalizeInput(
    urlMatch?.[1] ?? urlMatch?.[2] ?? urlMatch?.[3],
  );
  const cookie = readCurlOption(command, ['-b', '--cookie']);

  return {
    requestUrl,
    cookie,
  };
}

function normalizeCookieValue(value: string | undefined | null) {
  const input = normalizeInput(value);
  if (!input) {
    return '';
  }

  const parsedCurl = parsePrtgCurlCommand(input);
  if (parsedCurl?.cookie) {
    return parsedCurl.cookie;
  }

  const command = normalizeCurlCommand(input);
  const cookie = readCurlOption(command, ['-b', '--cookie']);
  return cookie || command;
}

/**
 * DEPRECATED: Cookie tidak dipakai lagi untuk auth ke PRTG.
 * Auth sekarang menggunakan username/passhash query params.
 * Module ini tetap ada karena schema Prisma tidak diubah (PrtgCookie table masih ada).
 * Endpoint API cookie-vault masih bisa diakses tapi tidak berpengaruh ke auth PRTG.
 */
@Injectable()
export class CookieVaultService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the value of the currently active cookie.
   * Throws an error if no active cookie exists.
   */
  async getActiveCookie(): Promise<string> {
    const cookie = await this.prisma.prtgCookie.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!cookie) {
      throw new NotFoundException(
        'No active PRTG cookie available. Please add or activate a cookie.',
      );
    }

    return cookie.value;
  }

  /**
   * Returns all stored cookies.
   */
  async findAll() {
    const cookies = await this.prisma.prtgCookie.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return cookies.map((cookie) => ({
      id: cookie.id,
      label: cookie.label,
      value: cookie.value,
      isActive: cookie.isActive,
      createdAt: cookie.createdAt.toISOString(),
      updatedAt: cookie.updatedAt.toISOString(),
    }));
  }

  /**
   * Creates a new cookie. If isActive is true, deactivates all other cookies first.
   */
  async create(dto: CreateCookieDto) {
    const value = normalizeCookieValue(dto.value);
    if (!value) {
      throw new BadRequestException('cookie value is required.');
    }

    const isActive = dto.isActive ?? true;

    if (isActive) {
      await this.prisma.prtgCookie.updateMany({ data: { isActive: false } });
    }

    const created = await this.prisma.prtgCookie.create({
      data: {
        label: dto.label?.trim() || null,
        value,
        isActive,
      },
    });

    return {
      id: created.id,
      label: created.label,
      value: created.value,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  /**
   * Updates an existing cookie. If isActive is set to true, deactivates all other cookies first.
   */
  async update(id: number, dto: UpdateCookieDto) {
    const cookie = await this.prisma.prtgCookie.findUnique({ where: { id } });
    if (!cookie) {
      throw new NotFoundException('PRTG cookie not found.');
    }

    const normalizedValue = dto.value
      ? normalizeCookieValue(dto.value)
      : cookie.value;
    const isActive = dto.isActive ?? cookie.isActive;

    if (isActive && !cookie.isActive) {
      await this.prisma.prtgCookie.updateMany({ data: { isActive: false } });
    }

    const updated = await this.prisma.prtgCookie.update({
      where: { id },
      data: {
        label: dto.label?.trim() ?? cookie.label,
        value: normalizedValue,
        isActive,
      },
    });

    return {
      id: updated.id,
      label: updated.label,
      value: updated.value,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Deletes a cookie by ID.
   */
  async remove(id: number) {
    const cookie = await this.prisma.prtgCookie.findUnique({ where: { id } });
    if (!cookie) {
      throw new NotFoundException('PRTG cookie not found.');
    }

    await this.prisma.prtgCookie.delete({ where: { id } });
    return { id };
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CookieVaultService } from './cookie-vault.service';
import { CreateCookieDto } from './dto/create-cookie.dto';
import { UpdateCookieDto } from './dto/update-cookie.dto';

/**
 * DEPRECATED: Cookie tidak dipakai lagi untuk auth ke PRTG.
 * Auth sekarang menggunakan username/passhash query params.
 * Endpoint ini tetap ada untuk backward compatibility tapi tidak berpengaruh ke auth PRTG.
 */
@Controller('api/cookie-vault')
export class CookieVaultController {
  constructor(private readonly cookieVaultService: CookieVaultService) {}

  @Get()
  findAll() {
    return this.cookieVaultService.findAll();
  }

  @Get('active')
  async getActive() {
    const value = await this.cookieVaultService.getActiveCookie();
    return { value };
  }

  @Post()
  create(@Body() dto: CreateCookieDto) {
    return this.cookieVaultService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCookieDto) {
    return this.cookieVaultService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.cookieVaultService.remove(id);
  }
}

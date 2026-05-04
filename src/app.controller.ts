import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'node:path';

@Controller()
export class AppController {
  @Get(['/', '/whatsapp', '/prtg', '/receipts'])
  serveApp(@Res() res: Response) {
    res.sendFile(join(process.cwd(), 'public', 'index.html'));
  }
}

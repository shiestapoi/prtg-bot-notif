import { Module } from '@nestjs/common';
import { CookieVaultController } from './cookie-vault.controller';
import { CookieVaultService } from './cookie-vault.service';

@Module({
  controllers: [CookieVaultController],
  providers: [CookieVaultService],
  exports: [CookieVaultService],
})
export class CookieVaultModule {}

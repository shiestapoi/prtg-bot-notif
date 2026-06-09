import { Module } from '@nestjs/common';
import { SoundController } from './sound.controller';

@Module({
  controllers: [SoundController],
})
export class SoundModule {}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { MonitoringRecipientService } from '../service/monitoring-recipient.service';

@Controller('api/monitoring/recipients')
export class MonitoringRecipientController {
  constructor(private readonly recipientService: MonitoringRecipientService) {}

  @Get()
  findAll() {
    return this.recipientService.findAll();
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.recipientService.create({
      label: body.label as string | undefined,
      phoneNumber: body.phoneNumber as string | undefined,
      targetType: body.targetType as string | undefined,
      enabled: body.enabled as boolean | undefined,
      groupId: body.groupId as number | undefined,
    });
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.recipientService.update(id, {
      label: body.label as string | undefined,
      phoneNumber: body.phoneNumber as string | undefined,
      targetType: body.targetType as string | undefined,
      enabled: body.enabled as boolean | undefined,
      groupId: body.groupId as number | null | undefined,
    });
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.recipientService.remove(id);
  }
}

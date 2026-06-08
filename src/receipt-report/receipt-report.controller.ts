import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
} from '@nestjs/common';
import { ReceiptScheduleService } from './receipt-schedule.service';
import { ReceiptSchedulerService } from './receipt-scheduler.service';
import { Prisma } from '@prisma/client';

@Controller('api/receipt-schedules')
export class ReceiptReportController {
  constructor(
    private readonly receiptScheduleService: ReceiptScheduleService,
    private readonly receiptSchedulerService: ReceiptSchedulerService,
  ) {}

  @Post()
  async create(@Body() createDto: Prisma.ReceiptScheduleUncheckedCreateInput) {
    const result = await this.receiptScheduleService.create(createDto);
    await this.receiptSchedulerService.syncSchedules();
    return result;
  }

  @Get()
  findAll() {
    return this.receiptScheduleService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.receiptScheduleService.findOne(+id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDto: Prisma.ReceiptScheduleUncheckedUpdateInput,
  ) {
    const result = await this.receiptScheduleService.update(+id, updateDto);
    await this.receiptSchedulerService.syncSchedules();
    return result;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.receiptScheduleService.remove(+id);
    await this.receiptSchedulerService.syncSchedules();
    return { success: true };
  }

  @Post(':id/dispatch')
  dispatch(@Param('id') id: string) {
    return this.receiptSchedulerService.dispatchManual(+id);
  }
}

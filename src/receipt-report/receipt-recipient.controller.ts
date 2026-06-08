import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
} from '@nestjs/common';
import { ReceiptRecipientService } from './receipt-recipient.service';
import { Prisma } from '@prisma/client';

@Controller('api/receipt-recipients')
export class ReceiptRecipientController {
  constructor(
    private readonly receiptRecipientService: ReceiptRecipientService,
  ) {}

  @Post()
  create(@Body() createDto: Prisma.ReceiptRecipientUncheckedCreateInput) {
    return this.receiptRecipientService.create(createDto);
  }

  @Get()
  findAll() {
    return this.receiptRecipientService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.receiptRecipientService.findOne(+id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: Prisma.ReceiptRecipientUncheckedUpdateInput,
  ) {
    return this.receiptRecipientService.update(+id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.receiptRecipientService.remove(+id);
  }
}

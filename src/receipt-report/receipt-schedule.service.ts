import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ReceiptScheduleDto } from './receipt-report.types';

@Injectable()
export class ReceiptScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.ReceiptScheduleUncheckedCreateInput): Promise<ReceiptScheduleDto> {
    return this.prisma.receiptSchedule.create({
      data,
      include: { group: true },
    });
  }

  async findAll(): Promise<ReceiptScheduleDto[]> {
    return this.prisma.receiptSchedule.findMany({
      include: { group: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number): Promise<ReceiptScheduleDto> {
    const schedule = await this.prisma.receiptSchedule.findUnique({
      where: { id },
      include: { group: true },
    });
    if (!schedule) throw new NotFoundException(`Receipt schedule with ID ${id} not found`);
    return schedule;
  }

  async update(
    id: number,
    data: Prisma.ReceiptScheduleUncheckedUpdateInput,
  ): Promise<ReceiptScheduleDto> {
    await this.findOne(id); // Check existence
    return this.prisma.receiptSchedule.update({
      where: { id },
      data,
      include: { group: true },
    });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.prisma.receiptSchedule.delete({
      where: { id },
    });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReceiptRecipientService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.ReceiptRecipientUncheckedCreateInput) {
    return this.prisma.receiptRecipient.create({ data });
  }

  async findAll() {
    return this.prisma.receiptRecipient.findMany({
      include: { group: true },
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: number) {
    const recipient = await this.prisma.receiptRecipient.findUnique({
      where: { id },
      include: { group: true },
    });
    if (!recipient)
      throw new NotFoundException(`ReceiptRecipient ${id} not found`);
    return recipient;
  }

  async update(id: number, data: Prisma.ReceiptRecipientUncheckedUpdateInput) {
    return this.prisma.receiptRecipient.update({
      where: { id },
      data,
    });
  }

  async remove(id: number) {
    return this.prisma.receiptRecipient.delete({
      where: { id },
    });
  }
}

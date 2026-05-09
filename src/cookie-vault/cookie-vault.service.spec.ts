import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CookieVaultService } from './cookie-vault.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CookieVaultService', () => {
  let service: CookieVaultService;
  let prisma: {
    prtgCookie: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      prtgCookie: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CookieVaultService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CookieVaultService>(CookieVaultService);
  });

  describe('getActiveCookie', () => {
    it('should return the active cookie value', async () => {
      prisma.prtgCookie.findFirst.mockResolvedValue({
        id: 1,
        value: 'session=abc123',
        isActive: true,
        updatedAt: new Date(),
      });

      const result = await service.getActiveCookie();
      expect(result).toBe('session=abc123');
      expect(prisma.prtgCookie.findFirst).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('should throw NotFoundException when no active cookie exists', async () => {
      prisma.prtgCookie.findFirst.mockResolvedValue(null);

      await expect(service.getActiveCookie()).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all cookies', async () => {
      const now = new Date();
      prisma.prtgCookie.findMany.mockResolvedValue([
        {
          id: 1,
          label: 'Cookie A',
          value: 'val1',
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 2,
          label: null,
          value: 'val2',
          isActive: false,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const result = await service.findAll();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[0].label).toBe('Cookie A');
      expect(result[0].isActive).toBe(true);
      expect(result[1].isActive).toBe(false);
    });
  });

  describe('create', () => {
    it('should create a cookie and deactivate others when isActive is true', async () => {
      const now = new Date();
      prisma.prtgCookie.updateMany.mockResolvedValue({ count: 1 });
      prisma.prtgCookie.create.mockResolvedValue({
        id: 3,
        label: 'New Cookie',
        value: 'newval',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.create({
        label: 'New Cookie',
        value: 'newval',
        isActive: true,
      });

      expect(prisma.prtgCookie.updateMany).toHaveBeenCalledWith({
        data: { isActive: false },
      });
      expect(result.id).toBe(3);
      expect(result.isActive).toBe(true);
    });

    it('should throw BadRequestException when value is empty', async () => {
      await expect(
        service.create({ value: '', isActive: true }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should not deactivate others when isActive is false', async () => {
      const now = new Date();
      prisma.prtgCookie.create.mockResolvedValue({
        id: 4,
        label: null,
        value: 'inactive-val',
        isActive: false,
        createdAt: now,
        updatedAt: now,
      });

      await service.create({ value: 'inactive-val', isActive: false });
      expect(prisma.prtgCookie.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a cookie', async () => {
      const now = new Date();
      prisma.prtgCookie.findUnique.mockResolvedValue({
        id: 1,
        label: 'Old',
        value: 'oldval',
        isActive: false,
        createdAt: now,
        updatedAt: now,
      });
      prisma.prtgCookie.updateMany.mockResolvedValue({ count: 1 });
      prisma.prtgCookie.update.mockResolvedValue({
        id: 1,
        label: 'Updated',
        value: 'oldval',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.update(1, {
        label: 'Updated',
        isActive: true,
      });

      expect(result.label).toBe('Updated');
      expect(result.isActive).toBe(true);
      expect(prisma.prtgCookie.updateMany).toHaveBeenCalled();
    });

    it('should throw NotFoundException when cookie does not exist', async () => {
      prisma.prtgCookie.findUnique.mockResolvedValue(null);

      await expect(service.update(999, { label: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a cookie', async () => {
      prisma.prtgCookie.findUnique.mockResolvedValue({ id: 1 });
      prisma.prtgCookie.delete.mockResolvedValue({ id: 1 });

      const result = await service.remove(1);
      expect(result).toEqual({ id: 1 });
    });

    it('should throw NotFoundException when cookie does not exist', async () => {
      prisma.prtgCookie.findUnique.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});

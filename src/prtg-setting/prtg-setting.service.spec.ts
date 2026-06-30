/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { PrtgSettingService } from './prtg-setting.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PrtgSettingService', () => {
  let service: PrtgSettingService;
  let prisma: {
    prtgSetting: {
      upsert: jest.Mock;
      update: jest.Mock;
    };
  };

  const now = new Date();
  const defaultSetting = {
    id: 1,
    loginUrl: 'http://prtg.r1net.id/index.htm',
    loginUsername: null,
    loginPassword: null,
    messageTemplate: '{title}\nGroup: {groupname}',
    alertMessageTemplate:
      'âš ï¸ {status} â€” {title}\nGroup: {groupName}\nWaktu: {time}\nAlasan: {reason}',
    recoveryMessageTemplate:
      'âœ… Pulih â€” {title}\nGroup: {groupName}\nWaktu: {time}',
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(async () => {
    prisma = {
      prtgSetting: {
        upsert: jest.fn().mockResolvedValue(defaultSetting),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrtgSettingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PrtgSettingService>(PrtgSettingService);
  });

  describe('getSetting', () => {
    it('should return the current settings', async () => {
      const result = await service.getSetting();

      expect(result.loginUrl).toBe('http://prtg.r1net.id/index.htm');
      expect(result.loginUsername).toBeNull();
      expect(result.hasLoginPassword).toBe(false);
      expect(result.messageTemplate).toBe('{title}\nGroup: {groupname}');
      expect(result.alertMessageTemplate).toBe(
        'âš ï¸ {status} â€” {title}\nGroup: {groupName}\nWaktu: {time}\nAlasan: {reason}',
      );
      expect(result.recoveryMessageTemplate).toBe(
        'âœ… Pulih â€” {title}\nGroup: {groupName}\nWaktu: {time}',
      );
      expect(result.createdAt).toBe(now.toISOString());
      expect(result.updatedAt).toBe(now.toISOString());
    });

    it('should indicate hasLoginPassword when password is set', async () => {
      prisma.prtgSetting.upsert.mockResolvedValue({
        ...defaultSetting,
        loginPassword: 'secret123',
      });

      const result = await service.getSetting();
      expect(result.hasLoginPassword).toBe(true);
    });

    it('should ensure settings exist via upsert', async () => {
      await service.getSetting();

      expect(prisma.prtgSetting.upsert).toHaveBeenCalledWith({
        where: { id: 1 },
        update: {},
        create: expect.objectContaining({
          id: 1,
          loginUrl: 'http://prtg.r1net.id/index.htm',
        }),
      });
    });
  });

  describe('updateSetting', () => {
    it('should update loginUrl', async () => {
      const updatedSetting = {
        ...defaultSetting,
        loginUrl: 'https://new-prtg.example.com/index.htm',
        updatedAt: new Date(),
      };
      prisma.prtgSetting.update.mockResolvedValue(updatedSetting);

      const result = await service.updateSetting({
        loginUrl: 'https://new-prtg.example.com/index.htm',
      });

      expect(result.loginUrl).toBe('https://new-prtg.example.com/index.htm');
      expect(prisma.prtgSetting.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          loginUrl: 'https://new-prtg.example.com/index.htm',
        }),
      });
    });

    it('should update loginUsername', async () => {
      const updatedSetting = {
        ...defaultSetting,
        loginUsername: 'admin',
        updatedAt: new Date(),
      };
      prisma.prtgSetting.update.mockResolvedValue(updatedSetting);

      const result = await service.updateSetting({
        loginUsername: 'admin',
      });

      expect(result.loginUsername).toBe('admin');
    });

    it('should update loginPassword', async () => {
      const updatedSetting = {
        ...defaultSetting,
        loginPassword: 'newpass',
        updatedAt: new Date(),
      };
      prisma.prtgSetting.update.mockResolvedValue(updatedSetting);

      const result = await service.updateSetting({
        loginPassword: 'newpass',
      });

      expect(result.hasLoginPassword).toBe(true);
      expect(prisma.prtgSetting.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          loginPassword: 'newpass',
        }),
      });
    });

    it('should store passhash in loginPassword using the new settings contract', async () => {
      const updatedSetting = {
        ...defaultSetting,
        loginPassword: '1234567890',
        updatedAt: new Date(),
      };
      prisma.prtgSetting.update.mockResolvedValue(updatedSetting);

      const result = await service.updateSetting({
        loginPassword: '1234567890',
      });

      expect(result.hasLoginPassword).toBe(true);
      expect(prisma.prtgSetting.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          loginUrl: defaultSetting.loginUrl,
          loginUsername: null,
          loginPassword: '1234567890',
          messageTemplate: defaultSetting.messageTemplate,
          alertMessageTemplate: defaultSetting.alertMessageTemplate,
          recoveryMessageTemplate: defaultSetting.recoveryMessageTemplate,
        }),
      });
    });

    it('should clear loginPassword when set to empty string', async () => {
      prisma.prtgSetting.upsert.mockResolvedValue({
        ...defaultSetting,
        loginPassword: 'existing',
      });
      const updatedSetting = {
        ...defaultSetting,
        loginPassword: null,
        updatedAt: new Date(),
      };
      prisma.prtgSetting.update.mockResolvedValue(updatedSetting);

      const result = await service.updateSetting({
        loginPassword: '',
      });

      expect(result.hasLoginPassword).toBe(false);
      expect(prisma.prtgSetting.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          loginPassword: null,
        }),
      });
    });

    it('should preserve loginPassword when not provided in dto', async () => {
      prisma.prtgSetting.upsert.mockResolvedValue({
        ...defaultSetting,
        loginPassword: 'existing',
      });
      const updatedSetting = {
        ...defaultSetting,
        loginPassword: 'existing',
        loginUrl: 'http://new-url.com',
        updatedAt: new Date(),
      };
      prisma.prtgSetting.update.mockResolvedValue(updatedSetting);

      await service.updateSetting({
        loginUrl: 'http://new-url.com',
      });

      expect(prisma.prtgSetting.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          loginPassword: 'existing',
        }),
      });
    });

    it('should update message templates', async () => {
      const updatedSetting = {
        ...defaultSetting,
        messageTemplate: 'New: {title}',
        alertMessageTemplate: 'Alert: {title} - {status}',
        recoveryMessageTemplate: 'Recovery: {title}',
        updatedAt: new Date(),
      };
      prisma.prtgSetting.update.mockResolvedValue(updatedSetting);

      const result = await service.updateSetting({
        messageTemplate: 'New: {title}',
        alertMessageTemplate: 'Alert: {title} - {status}',
        recoveryMessageTemplate: 'Recovery: {title}',
      });

      expect(result.messageTemplate).toBe('New: {title}');
      expect(result.alertMessageTemplate).toBe('Alert: {title} - {status}');
      expect(result.recoveryMessageTemplate).toBe('Recovery: {title}');
    });

    it('should keep current templates when not provided', async () => {
      const updatedSetting = {
        ...defaultSetting,
        messageTemplate: 'Shared: {title}',
        updatedAt: new Date(),
      };
      prisma.prtgSetting.update.mockResolvedValue(updatedSetting);

      await service.updateSetting({
        messageTemplate: 'Shared: {title}',
      });

      expect(prisma.prtgSetting.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          messageTemplate: 'Shared: {title}',
          alertMessageTemplate: defaultSetting.alertMessageTemplate,
          recoveryMessageTemplate: defaultSetting.recoveryMessageTemplate,
        }),
      });
    });
  });

  describe('getSettingRaw', () => {
    it('should return the raw setting including password', async () => {
      prisma.prtgSetting.upsert.mockResolvedValue({
        ...defaultSetting,
        loginPassword: 'secret',
      });

      const result = await service.getSettingRaw();
      expect(result.loginPassword).toBe('secret');
    });
  });
});

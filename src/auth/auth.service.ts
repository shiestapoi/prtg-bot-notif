import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AuthAccountUpdateResponse,
  AuthLoginResponse,
  AuthUser,
} from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(username: string, password: string): Promise<AuthLoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const token = this.signToken({ id: user.id, username: user.username });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
      },
    };
  }

  async getCurrentUser(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    return user;
  }

  async updateAccount(payload: {
    userId: string;
    currentPassword: string;
    username?: string;
    newPassword?: string;
  }): Promise<AuthAccountUpdateResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
    });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    const matches = await bcrypt.compare(
      payload.currentPassword,
      user.passwordHash,
    );
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const username = payload.username?.trim() || user.username;
    const newPassword = payload.newPassword?.trim() || '';

    if (username.length < 3) {
      throw new BadRequestException('username must be at least 3 characters.');
    }

    if (newPassword && newPassword.length < 6) {
      throw new BadRequestException(
        'new password must be at least 6 characters.',
      );
    }

    if (username.toLowerCase() !== user.username.toLowerCase()) {
      const existing = await this.prisma.user.findFirst({
        where: {
          id: { not: user.id },
          username: { equals: username, mode: 'insensitive' },
        },
        select: { id: true },
      });

      if (existing) {
        throw new BadRequestException('username is already used.');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        username,
        ...(newPassword
          ? { passwordHash: await bcrypt.hash(newPassword, 12) }
          : {}),
      },
      select: { id: true, username: true },
    });

    return {
      token: this.signToken(updated),
      user: updated,
    };
  }

  private signToken(user: AuthUser) {
    return this.jwtService.sign({
      sub: user.id,
      username: user.username,
    });
  }
}

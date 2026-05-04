import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import type {
  AuthAccountUpdateResponse,
  AuthLoginResponse,
  AuthUser,
} from './auth.types';

interface LoginBody {
  username?: string;
  password?: string;
}

interface UpdateAccountBody {
  username?: string;
  currentPassword?: string;
  newPassword?: string;
}

type AuthenticatedRequest = {
  user?: { sub?: string };
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginBody): Promise<AuthLoginResponse> {
    const username = body.username?.trim();
    const password = body.password?.trim();

    if (!username || !password) {
      throw new BadRequestException('username and password are required.');
    }

    return this.authService.login(username, password);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() request: AuthenticatedRequest): Promise<AuthUser> {
    const userId = request.user?.sub;
    if (!userId) {
      throw new BadRequestException('missing authenticated user.');
    }

    return this.authService.getCurrentUser(userId);
  }

  @Put('me')
  @UseGuards(AuthGuard)
  async updateAccount(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateAccountBody,
  ): Promise<AuthAccountUpdateResponse> {
    const userId = request.user?.sub;
    const currentPassword = body.currentPassword?.trim();
    const username = body.username?.trim();
    const newPassword = body.newPassword?.trim();

    if (!userId) {
      throw new BadRequestException('missing authenticated user.');
    }

    if (!currentPassword) {
      throw new BadRequestException('currentPassword is required.');
    }

    if (!username && !newPassword) {
      throw new BadRequestException('username or newPassword is required.');
    }

    return this.authService.updateAccount({
      userId,
      currentPassword,
      username,
      newPassword,
    });
  }
}

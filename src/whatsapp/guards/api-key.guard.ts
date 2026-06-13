import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Check header or query param
    const apiKey = request.headers['x-api-key'] || request.query['api_key'];

    // Default to 'akucintasagiri' if process.env.API_KEY is not defined
    const expectedKey = process.env.API_KEY || 'akucintasagiri';

    if (apiKey === expectedKey) {
      return true;
    }

    throw new UnauthorizedException('Invalid API Key. Harap sertakan header x-api-key atau query ?api_key=...');
  }
}

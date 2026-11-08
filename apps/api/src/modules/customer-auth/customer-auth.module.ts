import { Module } from '@nestjs/common';

import { ChainVerifyAdaptersModule } from '../adapters/adapters.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { CustomerAuthController } from './customer-auth.controller.js';
import { CustomerAuthService } from './customer-auth.service.js';

@Module({
  imports: [DatabaseModule, ChainVerifyAdaptersModule],
  controllers: [CustomerAuthController],
  providers: [CustomerAuthService],
  exports: [CustomerAuthService],
})
export class CustomerAuthModule {}

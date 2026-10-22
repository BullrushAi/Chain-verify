import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { UserDashboardController } from './user-dashboard.controller.js';
import { UserDashboardService } from './user-dashboard.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [UserDashboardController],
  providers: [UserDashboardService],
  exports: [UserDashboardService],
})
export class UserDashboardModule {}


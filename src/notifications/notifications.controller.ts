import { Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../common/types/auth-user";
import { NotificationsService } from "./notifications.service";
@ApiTags("Notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get() list(
    @CurrentUser() user: AuthUser,
    @Query("unreadOnly") unread?: string,
  ) {
    return this.service.list(user.id, unread === "true");
  }
  @Patch(":id/read") read(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.markRead(id, user.id);
  }
  @Patch("read-all") readAll(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user.id);
  }
}

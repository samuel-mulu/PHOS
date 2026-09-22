import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../common/types/auth-user";
import { AuthService } from "./auth.service";
import { LoginDto, RefreshDto } from "./dto/auth.dto";
@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
    this.setRefreshCookie(res, result.refreshToken);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    };
  }
  @Public() @HttpCode(200) @Post("refresh") async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.refresh(dto.refreshToken, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
    this.setRefreshCookie(res, result.refreshToken);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    };
  }
  @Post("logout") @HttpCode(204) async logout(
    @CurrentUser() user: AuthUser,
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(user.id, dto.refreshToken);
    res.clearCookie("phos_refresh");
  }
  private setRefreshCookie(res: Response, token: string) {
    res.cookie("phos_refresh", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
      path: "/api/v1/auth",
      maxAge: 7 * 86_400_000,
    });
  }
}

import { Body, Controller, Post, Get } from '@nestjs/common'; // <-- Tambahkan Get di sini
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // ─── TAMBAHAN UNTUK MENGAMBIL DATA TIM PENILAI ───
  @Get('tim-penilai')
  async getTimPenilai() {
    return this.authService.getTimPenilai();
  }
}

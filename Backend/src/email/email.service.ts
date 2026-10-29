import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { RegistrationStatus } from '@prisma/client';

@Injectable()
export class EmailService {
  private readonly resend: Resend;

  constructor(private readonly configService: ConfigService) {
    this.resend = new Resend(this.configService.get<string>('RESEND_API_KEY'));
  }

  async sendRegistrationNotification(
    emailTujuan: string,
    statusRegistrasi: RegistrationStatus,
    namaLengkap: string,
  ) {
    if (statusRegistrasi === 'APPROVED') {
      await this.resend.emails.send({
        from: 'onboarding@resend.dev',
        to: emailTujuan,
        subject:
          'Pemberitahuan Persetujuan Akun - Sistem Informasi Penilaian Inovasi Ditjen P2',
        html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #2563eb; padding: 20px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0;">Pendaftaran Disetujui</h2>
      </div>
      <div style="padding: 30px; color: #374151; line-height: 1.6;">
        <p>Yth. <strong>${namaLengkap}</strong>,</p>
        <p>Selamat! Pendaftaran akun Anda pada <strong>Sistem Informasi Berita Acara Inovasi - Ditjen P2 Kementerian Kesehatan RI</strong> telah disetujui oleh Administrator.</p>
        
        <p>Berikut adalah detail informasi akun Anda:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
          <ul style="list-style-type: none; padding: 0; margin: 0;">
            <li style="margin-bottom: 8px;"><strong>Email:</strong> ${emailTujuan}</li>
            <li><strong>Status:</strong> <span style="color: #059669; font-weight: bold;">Aktif</span></li>
          </ul>
        </div>

        <p>Anda sekarang sudah memiliki akses penuh dan dapat mulai menggunakan sistem.</p>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="http://localhost:5173/login" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Masuk ke Sistem</a>
        </div>
      </div>
      <div style="background-color: #f9fafb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0;">Email ini dikirim secara otomatis oleh sistem. Mohon untuk tidak membalas email ini.</p>
      </div>
    </div>
  `,
      });
    } else if (statusRegistrasi === 'REJECTED') {
      await this.resend.emails.send({
        from: 'onboarding@resend.dev',
        to: emailTujuan,
        subject: 'Pendaftaran Akun Ditolak',
        html: `<p>Yth. ${namaLengkap},</p><p>Mohon maaf, pendaftaran akun Anda ditolak. Silakan hubungi administrator untuk informasi lebih lanjut.</p>`,
      });
    }
  }
}

import { defineConfig } from '@prisma/config';
import { config } from 'dotenv';

// Memaksa sistem untuk membaca file .env
config();

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
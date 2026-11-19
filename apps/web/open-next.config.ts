import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Semua halaman di app ini dinamis (per user), jadi cache incremental tidak dipakai.
export default defineCloudflareConfig({});

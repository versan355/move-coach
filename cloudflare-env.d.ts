declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_TEACHER_CHAT_ID?: string;
    TELEGRAM_TEACHER_USER_ID?: string;
    TELEGRAM_WEBHOOK_SECRET?: string;
    TELEGRAM_BOT_USERNAME?: string;
  }
}

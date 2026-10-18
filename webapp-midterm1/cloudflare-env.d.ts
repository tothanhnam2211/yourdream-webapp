declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    YOURDREAM_PILOT_OPERATOR_SUBJECT_ID?: string;
    YOURDREAM_SITE_ID?: string;
  }
}

declare module "*?raw" {
  const content: string;
  export default content;
}

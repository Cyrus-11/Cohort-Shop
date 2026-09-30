import "server-only";
import { z } from "zod";

const supabaseServerEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
});

const appEnvSchema = z.object({
  APP_URL: z.url(),
});

const paystackEnvSchema = z.object({
  PAYSTACK_SECRET_KEY: z.string().min(1),
  PAYSTACK_MODE: z.enum(["test", "live"]),
});

const mailgunEnvSchema = z.object({
  MAILGUN_API_KEY: z.string().min(1),
  MAILGUN_DOMAIN: z.string().min(1),
  MAILGUN_FROM: z.string().min(1),
  MAILGUN_API_URL: z.url(),
});

export type SupabaseServerEnv = z.infer<typeof supabaseServerEnvSchema>;
export type AppEnv = z.infer<typeof appEnvSchema>;
export type PaystackEnv = z.infer<typeof paystackEnvSchema>;
export type MailgunEnv = z.infer<typeof mailgunEnvSchema>;
export type ServerEnv = SupabaseServerEnv & AppEnv & PaystackEnv & MailgunEnv;

export function getSupabaseServerEnv(): SupabaseServerEnv {
  return supabaseServerEnvSchema.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
}

export function getAppEnv(): AppEnv {
  return appEnvSchema.parse({
    APP_URL: process.env.APP_URL,
  });
}

export function getPaystackEnv(): PaystackEnv {
  return paystackEnvSchema.parse({
    PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
    PAYSTACK_MODE: process.env.PAYSTACK_MODE,
  });
}

export function getMailgunEnv(): MailgunEnv {
  return mailgunEnvSchema.parse({
    MAILGUN_API_KEY: process.env.MAILGUN_API_KEY,
    MAILGUN_DOMAIN: process.env.MAILGUN_DOMAIN,
    MAILGUN_FROM: process.env.MAILGUN_FROM,
    MAILGUN_API_URL: process.env.MAILGUN_API_URL,
  });
}

// Use a provider-specific getter in individual services so unrelated setup
// cannot prevent Supabase, payments, or email from working independently.
export function getServerEnv(): ServerEnv {
  return {
    ...getSupabaseServerEnv(),
    ...getAppEnv(),
    ...getPaystackEnv(),
    ...getMailgunEnv(),
  };
}

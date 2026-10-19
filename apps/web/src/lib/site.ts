// Public-site settings shared by pages, metadata, robots and sitemap

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
);

export const CONTACT_EMAIL = 'hello@vargly.in';

/** Length of the free trial every new institute gets (apps/api coaching.service: trialDays) */
export const TRIAL_DAYS = 90;

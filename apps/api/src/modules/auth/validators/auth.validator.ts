import { z } from 'zod';
import { loginIdentifierToEmail } from '../../../common/security/student-login.js';

export const loginSchema = z
  .object({
    // An email, or a Student ID (which is turned into the account's email)
    email: z
      .string()
      .trim()
      .transform(loginIdentifierToEmail)
      .pipe(z.string().email('Please enter a valid email address or Student ID')),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
    coachingCode: z.string().optional(),
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: z.string().email('Please enter a valid email address').trim().toLowerCase(),
    coachingCode: z.string().trim().toLowerCase().optional(),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10, 'Invalid or expired password reset token'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8, 'New password must be at least 8 characters long').max(128),
  })
  .strict();

export const verifyEmailSchema = z
  .object({
    token: z.string().min(10, 'Invalid verification token'),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

import { randomInt } from 'node:crypto';

/**
 * A student has no email of their own to sign in with, so the account is keyed on a Student ID
 * (RIYA-4821) written into the email column as a name at a domain that cannot receive mail. The
 * institute code picks the institute, as for every login, so IDs only need to be unique inside one.
 */
export const STUDENT_LOGIN_DOMAIN = 'students.vargly.local';

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** What a person types in the sign-in box (an email, or a Student ID) as the account's email */
export function loginIdentifierToEmail(value: string): string {
  const text = value.trim().toLowerCase();
  if (text.includes('@')) return text;
  // Anything that is not a plausible Student ID is left as it is, so the email check rejects it
  return ID_PATTERN.test(text) ? `${text}@${STUDENT_LOGIN_DOMAIN}` : text;
}

export function isStudentLoginEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${STUDENT_LOGIN_DOMAIN}`);
}

/** The Student ID an account's email stands for: "riya-4821@students..." gives "RIYA-4821" */
export function studentIdFromEmail(email: string): string {
  return email.split('@')[0]!.toUpperCase();
}

export function emailForStudentId(studentId: string): string {
  return `${studentId.toLowerCase()}@${STUDENT_LOGIN_DOMAIN}`;
}

/** A short, readable ID from the first name: letters only (a Hindi name falls back to STU) plus four digits */
export function generateStudentId(firstName: string): string {
  const letters = firstName
    .normalize('NFKD')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .slice(0, 8);
  return `${letters || 'STU'}-${String(randomInt(1000, 10000))}`;
}

// No 0/O, 1/l/I: the password is read off a printed card
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** A temporary password the student replaces at first sign-in: 10 characters, with letters and digits */
export function generateTemporaryPassword(): string {
  for (;;) {
    let password = '';
    for (let i = 0; i < 10; i += 1) password += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
    if (/[A-Za-z]/.test(password) && /\d/.test(password)) return password;
  }
}

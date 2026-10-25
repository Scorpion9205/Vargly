import { describe, expect, it } from 'vitest';
import { homeFor, isStudent, isStudentIdInput, looksLikeLoginId, studentLoginId } from './roles';

const student = { roles: ['STUDENT'] };
const owner = { roles: ['OWNER'] };

describe('where each person lands', () => {
  it('sends students to their panel and everyone else to the app', () => {
    expect(homeFor(student)).toBe('/student');
    expect(homeFor(owner)).toBe('/app');
  });

  it('honours the page they came from only inside their own area', () => {
    expect(homeFor(student, '/student/homework')).toBe('/student/homework');
    expect(homeFor(student, '/app/students')).toBe('/student');
    expect(homeFor(owner, '/app/fees')).toBe('/app/fees');
    expect(homeFor(owner, '/student/homework')).toBe('/app');
    expect(homeFor(student, 'https://evil.example')).toBe('/student');
  });

  it('knows a student', () => {
    expect(isStudent(student)).toBe(true);
    expect(isStudent(owner)).toBe(false);
    expect(isStudent(null)).toBe(false);
  });
});

describe('the sign-in box', () => {
  it('accepts an email or a Student ID, and nothing else', () => {
    expect(looksLikeLoginId('asha@example.com')).toBe(true);
    expect(looksLikeLoginId('RIYA-4821')).toBe(true);
    expect(looksLikeLoginId('riya4821')).toBe(true);
    expect(looksLikeLoginId('riya 4821')).toBe(false);
    expect(looksLikeLoginId('asha@')).toBe(false);
    expect(looksLikeLoginId('<script>')).toBe(false);
  });

  it('tells a Student ID from an email', () => {
    expect(isStudentIdInput('RIYA-4821')).toBe(true);
    expect(isStudentIdInput('asha@example.com')).toBe(false);
  });

  it('reads the Student ID out of the account email', () => {
    expect(studentLoginId({ email: 'riya-4821@students.vargly.local' })).toBe('RIYA-4821');
  });
});

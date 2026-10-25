import { describe, expect, it } from 'vitest';
import { groupOverdueByStudent } from '../../modules/fees/fee-overdue-reminder.service.js';
import { receiptRows, renderReceiptPdf, rupeesText } from '../../modules/fees/fee-receipt-pdf.js';
import { isValidReceiptSignature, receiptLink } from '../../modules/fees/receipt-link.js';

const ID = '3f2c1b9e-8a44-4d3e-9d55-0a1b2c3d4e5f';

describe('receipt link', () => {
  it('is signed for one payment and opens nothing else', () => {
    const link = receiptLink(ID);
    const [, id, signature] = link.match(/\/fees\/receipt\/([^/]+)\/([^/]+)$/)!;
    expect(id).toBe(ID);
    expect(isValidReceiptSignature(ID, signature!)).toBe(true);
    expect(isValidReceiptSignature('3f2c1b9e-8a44-4d3e-9d55-ffffffffffff', signature!)).toBe(false);
    expect(isValidReceiptSignature(ID, signature!.slice(0, -1) + (signature!.endsWith('A') ? 'B' : 'A'))).toBe(false);
    expect(isValidReceiptSignature(ID, 'short')).toBe(false);
  });
});

describe('receipt PDF', () => {
  const input = {
    instituteName: 'Sharma Classes',
    receiptNumber: 'RCT/2026-27/0007',
    paidAt: new Date('2026-10-18T06:00:00Z'),
    studentName: 'Riya Verma',
    rollNumber: '12',
    academicYear: '2026-27',
    installmentNo: 3,
    amount: 1500,
    paymentMethod: 'UPI',
    installmentBalance: 500,
  };

  it('writes the rupee amounts in the Indian way', () => {
    expect(rupeesText(1500)).toBe('₹1,500');
    expect(rupeesText(125000.5)).toBe('₹1,25,000.5');
  });

  it('lists what the parent paid and what is left', () => {
    const rows = Object.fromEntries(receiptRows(input));
    expect(rows['Amount paid']).toBe('₹1,500');
    expect(rows['Balance on this instalment']).toBe('₹500');
    expect(rows['Student']).toBe('Riya Verma (Roll 12)');
    expect(rows['Paid by']).toBe('UPI');
    expect(rows['Date']).toBe('18 October 2026');
  });

  it('makes a real PDF, also for a Hindi name', async () => {
    const pdf = await renderReceiptPdf({ ...input, studentName: 'रिया वर्मा' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1500);
  });
});

describe('overdue reminders', () => {
  const row = (id: string, student: string, due: string, amount: number, paid = 0) => ({
    id,
    dueDate: new Date(`${due}T00:00:00Z`),
    amount,
    paidAmount: paid,
    feePlan: { studentId: student },
  });

  it('makes one reminder per student, for everything they owe, keyed to the oldest instalment', () => {
    const reminders = groupOverdueByStudent(
      [row('i2', 's1', '2026-10-05', 1000, 400), row('i1', 's1', '2026-09-05', 1000), row('i3', 's2', '2026-10-15', 700)],
      '2026-10-20',
    );
    expect(reminders).toEqual([
      { studentId: 's1', installmentId: 'i1', dueDate: new Date('2026-09-05T00:00:00Z'), amount: 1600, daysOverdue: 45 },
      { studentId: 's2', installmentId: 'i3', dueDate: new Date('2026-10-15T00:00:00Z'), amount: 700, daysOverdue: 5 },
    ]);
  });
});

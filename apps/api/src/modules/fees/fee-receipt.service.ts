import { getPrismaClient, ExtendedPrismaClient } from '../../database/prisma/tenant-prisma.extension.js';
import { RequestContextService } from '../../common/services/request-context.service.js';
import { money, toRupees } from '../../common/money/money.js';
import { renderReceiptPdf, ReceiptPdfInput } from './fee-receipt-pdf.js';
import { isValidReceiptSignature } from './receipt-link.js';

/** The receipt a parent opens from the link in WhatsApp: no login, only the signed link */
export class FeeReceiptService {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  private get db(): any {
    return this.prisma as any;
  }

  /** The receipt as a PDF, or null when the link is not genuine or the payment is gone */
  public async renderForLink(
    transactionId: string,
    signature: string,
  ): Promise<{ pdf: Buffer; fileName: string } | null> {
    if (!isValidReceiptSignature(transactionId, signature)) return null;

    const input = await RequestContextService.runAsSystem('fees:receipt-link', async (): Promise<ReceiptPdfInput | null> => {
      const transaction = await this.db.feeTransaction.findFirst({
        where: { id: transactionId, deletedAt: null },
        include: { installment: { include: { feePlan: { include: { student: true } } } } },
      });
      if (!transaction) return null;
      const installment = transaction.installment;
      const student = installment.feePlan.student;
      const coaching = await this.db.coaching.findUnique({
        where: { id: transaction.coachingId },
        select: { name: true, address: true, city: true, phone: true },
      });
      return {
        instituteName: coaching?.name ?? 'Vargly',
        instituteAddress: [coaching?.address, coaching?.city].filter(Boolean).join(', ') || null,
        institutePhone: coaching?.phone ?? null,
        receiptNumber: transaction.receiptNumber,
        paidAt: transaction.paidAt,
        studentName: [student.firstName, student.lastName].filter(Boolean).join(' '),
        rollNumber: student.rollNumber,
        academicYear: installment.feePlan.academicYear,
        installmentNo: installment.installmentNo,
        amount: toRupees(money(transaction.amount)),
        paymentMethod: transaction.paymentMethod,
        installmentBalance: toRupees(money(installment.amount).minus(money(installment.paidAmount))),
        remarks: transaction.remarks,
      };
    });
    if (!input) return null;

    const safe = input.receiptNumber.replace(/[^A-Za-z0-9._-]+/g, '_');
    return { pdf: await renderReceiptPdf(input), fileName: `Receipt_${safe}.pdf` };
  }
}

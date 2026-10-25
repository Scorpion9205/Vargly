import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { createRouter } from '../../common/http/async-router.js';
import { authenticateMiddleware } from '../../common/middleware/auth.middleware.js';
import { requireActiveSubscription } from '../../common/decorators/require-feature.decorator.js';
import { requirePermission } from '../../common/decorators/require-permission.decorator.js';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { RequestContextService } from '../../common/services/request-context.service.js';
import { getPrismaClient, ExtendedPrismaClient } from '../../database/prisma/tenant-prisma.extension.js';
import { todayInIndia } from '../reports/report.dates.js';
import { CERTIFICATE_TYPES, renderCertificatePdf } from './certificate-pdf.js';

export const certificateQuerySchema = z.object({
  studentId: z.string().uuid(),
  type: z.enum(CERTIFICATE_TYPES),
  reason: z.string().trim().max(300).optional(),
  issuedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  signedBy: z.string().trim().max(100).optional(),
});
export type CertificateQuery = z.infer<typeof certificateQuerySchema>;

/** A certificate for one student, made when asked for: nothing is stored */
export class CertificateService {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  public async render(query: CertificateQuery, coachingId: string): Promise<{ pdf: Buffer; fileName: string }> {
    const db = this.prisma as any;
    const [student, coaching] = await Promise.all([
      db.student.findFirst({ where: { id: query.studentId, coachingId, deletedAt: null }, select: { firstName: true, lastName: true } }),
      db.coaching.findFirst({ where: { id: coachingId }, select: { name: true } }),
    ]);
    if (!student) throw new AppError('STUDENT_NOT_FOUND', 'Student not found', StatusCodes.NOT_FOUND);

    const studentName = [student.firstName, student.lastName].filter(Boolean).join(' ');
    const pdf = await renderCertificatePdf({
      type: query.type,
      instituteName: coaching?.name ?? 'Vargly',
      studentName,
      reason: query.reason,
      issuedOn: query.issuedOn ?? todayInIndia(),
      signedBy: query.signedBy,
    });
    const safe = studentName.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 60) || 'student';
    return { pdf, fileName: `Certificate_${query.type.toLowerCase()}_${safe}.pdf` };
  }
}

export class CertificateModule {
  public static init(): { router: Router; service: CertificateService } {
    const service = new CertificateService();
    const router = createRouter();
    router.use(authenticateMiddleware, requireActiveSubscription(), requirePermission('certificates:manage'));

    router.get('/pdf', async (req, res) => {
      const { pdf, fileName } = await service.render(
        certificateQuerySchema.parse(req.query),
        RequestContextService.getRequiredCoachingId(),
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^\x20-\x7e]+/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(StatusCodes.OK).send(pdf);
    });

    return { router, service };
  }
}

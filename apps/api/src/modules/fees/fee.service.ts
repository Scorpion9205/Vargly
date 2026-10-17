import { StatusCodes } from 'http-status-codes';
import { IFeeRepository } from './fee.repository.js';
import { IEventBus } from '../../events/event-bus.interface.js';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import {
  CreateFeePlanDto,
  FeeInstallmentResponseDto,
  FeePlanResponseDto,
  FeeTransactionResponseDto,
  RecordFeePaymentDto,
  WaiveInstallmentDto,
} from './dto/fee.dto.js';
import { FeeMapper } from './fee.mapper.js';
import {
  createFeePaidEvent,
  createFeePlanCreatedEvent,
  createFeeWaivedEvent,
} from './fee.events.js';
import { DiscountType, FeeInstallmentStatus } from '@vargly/types';
import { logger } from '../../common/logger/logger.service.js';
import { money, toRupees } from '../../common/money/money.js';

export class FeeService {
  public constructor(
    private readonly feeRepository: IFeeRepository,
    private readonly eventBus: IEventBus,
  ) {}

  public async createFeePlan(
    dto: CreateFeePlanDto,
    coachingId: string,
    userId?: string,
    correlationId: string = crypto.randomUUID(),
  ): Promise<FeePlanResponseDto> {
    // 1. Calculate discount and final amount in exact decimals, rounded to the paisa
    const total = money(dto.totalAmount);
    let final = total;
    if (dto.discountType && dto.discountValue && dto.discountValue > 0) {
      const discount =
        dto.discountType === DiscountType.PERCENTAGE
          ? total.times(dto.discountValue).dividedBy(100)
          : money(dto.discountValue);
      final = total.minus(discount);
      if (final.isNegative()) final = money(0);
    }
    final = final.toDecimalPlaces(2);
    const finalAmount = final.toNumber();

    // 2. Installments must add up to the final amount exactly (to the paisa)
    const installmentTotal = dto.installments.reduce((acc, inst) => acc.plus(inst.amount), money(0));
    if (!installmentTotal.equals(final)) {
      throw new AppError(
        'INVALID_INSTALLMENT_SUM',
        `Sum of installments (${installmentTotal.toFixed(2)}) must equal final amount (${final.toFixed(2)})`,
        StatusCodes.BAD_REQUEST,
      );
    }

    // 3. Persist via repository
    const plan = await this.feeRepository.createFeePlan({
      coachingId,
      studentId: dto.studentId,
      totalAmount: dto.totalAmount,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      finalAmount,
      academicYear: dto.academicYear,
      createdBy: userId,
      installments: dto.installments.map((inst) => ({
        installmentNo: inst.installmentNo,
        amount: inst.amount,
        dueDate: new Date(inst.dueDate),
      })),
    });

    const responseDto = FeeMapper.toPlanDto(plan);

    await this.eventBus.publish(
      createFeePlanCreatedEvent(
        {
          feePlanId: responseDto.id,
          coachingId,
          studentId: responseDto.studentId,
          finalAmount: responseDto.finalAmount,
          installmentsCount: dto.installments.length,
        },
        correlationId,
        userId,
      ),
    );

    return responseDto;
  }

  public async recordPayment(
    dto: RecordFeePaymentDto,
    coachingId: string,
    userId?: string,
    correlationId: string = crypto.randomUUID(),
  ): Promise<FeeTransactionResponseDto & { duplicate?: boolean }> {
    // Balance, status and duplicate checks run inside the repository's locked transaction;
    // checking here first would race with concurrent payments.
    const result = await this.feeRepository.recordPaymentTransaction({
      coachingId,
      installmentId: dto.installmentId,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      transactionRef: dto.transactionRef,
      remarks: dto.remarks,
      createdBy: userId,
    });

    if (result.kind === 'duplicate') {
      logger.info(`[FeeService] Payment ${dto.transactionRef} already recorded; ignoring repeat`);
      return { ...FeeMapper.toTransactionDto(result.transaction), duplicate: true };
    }

    const { transaction, installment: updatedInstallment, plan, remainingBalance } = result;
    await this.eventBus.publish(
      createFeePaidEvent(
        {
          transactionId: transaction.id,
          coachingId,
          studentId: plan.studentId,
          installmentId: dto.installmentId,
          amount: toRupees(transaction.amount),
          paymentMethod: dto.paymentMethod,
          receiptNumber: transaction.receiptNumber,
          remainingBalance: toRupees(remainingBalance),
          isFullyPaid: updatedInstallment.status === FeeInstallmentStatus.PAID,
        },
        correlationId,
        userId,
      ),
    );

    return FeeMapper.toTransactionDto(transaction);
  }

  public async waiveInstallment(
    installmentId: string,
    dto: WaiveInstallmentDto,
    coachingId: string,
    userId?: string,
    correlationId: string = crypto.randomUUID(),
  ): Promise<FeeInstallmentResponseDto> {
    const installment = await this.feeRepository.findInstallmentById(installmentId);
    if (!installment || installment.coachingId !== coachingId) {
      throw new AppError('INSTALLMENT_NOT_FOUND', 'Fee installment not found', StatusCodes.NOT_FOUND);
    }

    if (installment.status === FeeInstallmentStatus.PAID) {
      throw new AppError('CANNOT_WAIVE_PAID', 'Cannot waive an already paid installment', StatusCodes.BAD_REQUEST);
    }

    const waived = await this.feeRepository.waiveInstallment(installmentId, dto.remarks);
    if (!waived) {
      throw new AppError(
        'INSTALLMENT_NOT_WAIVABLE',
        'The installment was paid or waived in the meantime',
        StatusCodes.CONFLICT,
      );
    }
    const responseDto = FeeMapper.toInstallmentDto(waived);

    await this.eventBus.publish(
      createFeeWaivedEvent(
        {
          installmentId,
          coachingId,
          studentId: waived.feePlan.studentId,
          waivedAmount: responseDto.balanceAmount,
        },
        correlationId,
        userId,
      ),
    );

    return responseDto;
  }

  public async getStudentFeePlans(studentId: string): Promise<FeePlanResponseDto[]> {
    const plans = await this.feeRepository.findPlansByStudent(studentId);
    return plans.map(FeeMapper.toPlanDto);
  }

  public async getPlanById(id: string): Promise<FeePlanResponseDto> {
    const plan = await this.feeRepository.findPlanById(id);
    if (!plan) {
      throw new AppError('PLAN_NOT_FOUND', 'Fee plan not found', StatusCodes.NOT_FOUND);
    }
    return FeeMapper.toPlanDto(plan);
  }

  public async getDefaulters(coachingId: string): Promise<any[]> {
    const installments = await this.feeRepository.findPendingInstallments(new Date());
    const filtered = installments.filter((i: any) => i.coachingId === coachingId);
    return filtered.map((inst: any) => {
      const balance = toRupees(money(inst.amount).minus(money(inst.paidAmount)));
      const parent = (inst.feePlan?.student?.studentParents ?? []).find(
        (link: any) => link.parent && !link.parent.deletedAt,
      )?.parent;
      return {
        installmentId: inst.id,
        installmentNo: inst.installmentNo,
        amount: Number(inst.amount),
        paidAmount: Number(inst.paidAmount || 0),
        pendingAmount: balance,
        dueDate: inst.dueDate,
        status: inst.status,
        student: inst.feePlan?.student
          ? {
              id: inst.feePlan.student.id,
              name: `${inst.feePlan.student.firstName} ${inst.feePlan.student.lastName}`,
              phone: inst.feePlan.student.phone,
              email: inst.feePlan.student.email,
            }
          : undefined,
        parent: parent ? { name: parent.name, phone: parent.phone } : null,
      };
    });
  }
}

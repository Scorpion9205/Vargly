import { StatusCodes } from 'http-status-codes';
import { ICoachingRepository } from './coaching.repository.js';
import { IPasswordService } from '../../common/security/password.service.js';
import { IEventBus } from '../../events/event-bus.interface.js';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { CoachingMapper } from './coaching.mapper.js';
import { CoachingResponseDto, RegisterCoachingDto } from './dto/coaching.dto.js';
import { createCoachingCreatedEvent } from './coaching.events.js';
import { generateCoachingCode, withSuffix } from './coaching-code.js';

export class CoachingService {
  public constructor(
    private readonly coachingRepository: ICoachingRepository,
    private readonly passwordService: IPasswordService,
    private readonly eventBus: IEventBus,
  ) {}

  public async registerCoaching(
    dto: RegisterCoachingDto,
    correlationId: string = crypto.randomUUID(),
  ): Promise<CoachingResponseDto> {
    // 1. The institute code is made here from the name, unique across Vargly
    const coachingCode = await generateCoachingCode(dto.coachingName, async (code) =>
      Boolean(await this.coachingRepository.findByCode(code)),
    );

    // 2. Hash owner password with Argon2id
    const ownerPasswordHash = await this.passwordService.hash(dto.ownerPassword);

    // 3. Atomically provision Coaching, Owner User, 90-day full-feature trial, and AI wallet
    const provision = (code: string) =>
      this.coachingRepository.createWithProvisioning({
        coachingName: dto.coachingName,
        coachingCode: code,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        timezone: dto.timezone || 'Asia/Kolkata',
        currency: dto.currency || 'INR',
        ownerName: dto.ownerName,
        ownerEmail: dto.ownerEmail,
        ownerPhone: dto.ownerPhone,
        ownerPasswordHash,
        trialDays: 90, // 3 months free, then the plan price applies
        initialCredits: 500, // 500 AI credits trial allotment
      });
    let created;
    try {
      created = await provision(coachingCode);
    } catch (err) {
      // Another institute took the same code a moment ago: take a suffixed one instead
      if ((err as { code?: string }).code !== 'P2002') throw err;
      created = await provision(withSuffix(coachingCode.slice(0, 40)));
    }
    const { coaching, ownerUser } = created;

    const responseDto = CoachingMapper.toResponseDto(coaching);

    // 4. Emit Domain Event
    await this.eventBus.publish(
      createCoachingCreatedEvent(
        {
          coachingId: coaching.id,
          coachingCode: coaching.code,
          coachingName: coaching.name,
          ownerId: ownerUser.id,
          ownerEmail: ownerUser.email,
          trialEndsAt: responseDto.subscription.trialEndsAt,
        },
        correlationId,
      ),
    );

    return responseDto;
  }

  public async getCoachingById(id: string): Promise<CoachingResponseDto> {
    const coaching = await this.coachingRepository.findById(id);
    if (!coaching) {
      throw new AppError(
        'NOT_FOUND',
        'Coaching institute profile not found',
        StatusCodes.NOT_FOUND,
      );
    }
    return CoachingMapper.toResponseDto(coaching);
  }

  public async updateCoaching(
    id: string,
    changes: Record<string, unknown>,
  ): Promise<CoachingResponseDto> {
    await this.getCoachingById(id);
    const updated = await this.coachingRepository.update(id, changes);
    return CoachingMapper.toResponseDto(updated);
  }
}

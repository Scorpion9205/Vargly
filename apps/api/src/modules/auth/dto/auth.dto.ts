import { RoleType } from '@vargly/types';

export interface LoginDto {
  readonly email: string;
  readonly password: string;
  readonly coachingCode?: string; // Optional if user is logging into a specific coaching
}

export interface RefreshDto {
  readonly refreshToken: string;
}

export interface AuthTokensDto {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number; // in seconds
}

export interface AuthUserDto {
  readonly id: string;
  readonly coachingId?: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly roles: RoleType[];
  readonly permissions: string[];
  /** A temporary password is in use: the person must choose their own before anything else */
  readonly mustChangePassword?: boolean;
}

export interface AuthResponseDto {
  readonly user: AuthUserDto;
  readonly tokens: AuthTokensDto;
}

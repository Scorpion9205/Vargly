import { RoleType } from '@vargly/types';
import { AuthUserDto } from './dto/auth.dto.js';

export interface UserAggregate {
  id: string;
  coachingId: string | null;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  isActive: boolean;
  mustChangePassword?: boolean;
  /** Set for a student's login: the student record it belongs to */
  studentProfile?: { isActive: boolean; deletedAt: Date | null } | null;
  userRoles: Array<{
    role: {
      code: string;
      rolePermissions: Array<{
        permission: {
          code: string;
        };
      }>;
    };
  }>;
}

export class AuthMapper {
  public static toUserDto(user: UserAggregate): AuthUserDto {
    const roles: RoleType[] = user.userRoles.map((ur) => ur.role.code as RoleType);

    const permissionSet = new Set<string>();
    for (const ur of user.userRoles) {
      for (const rp of ur.role.rolePermissions) {
        permissionSet.add(rp.permission.code);
      }
    }

    return {
      id: user.id,
      coachingId: user.coachingId ?? undefined,
      name: user.name,
      email: user.email,
      phone: user.phone,
      roles,
      permissions: Array.from(permissionSet),
      ...(user.mustChangePassword ? { mustChangePassword: true } : {}),
    };
  }
}

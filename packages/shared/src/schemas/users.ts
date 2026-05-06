import { z } from 'zod';

export const listUsersQuerySchema = z.object({
  businessId: z.string().min(1).optional(),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1),
  role: z.enum(['super_admin', 'admin', 'manager', 'supervisor', 'cashier', 'waiter', 'kitchen']),
  branchIds: z.array(z.string()).optional(),
  businessId: z.string().min(1).optional(),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    role: z
      .enum(['super_admin', 'admin', 'manager', 'supervisor', 'cashier', 'waiter', 'kitchen'])
      .optional(),
    branchIds: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const userIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((v) => /[a-z]/i.test(v) && /\d/.test(v), 'Password must contain letters and numbers');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(2).max(80),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  newPassword: passwordSchema,
});

export const playerIdSchema = z
  .string()
  .trim()
  .min(3, 'Player ID is too short')
  .max(32, 'Player ID is too long')
  .regex(/^[A-Za-z0-9_-]+$/, 'Player ID contains invalid characters');

export const serverIdSchema = z.string().trim().max(32).optional().default('');

export const checkoutSchema = z.object({
  productId: z.string().min(1).max(64),
  playerId: playerIdSchema,
  serverId: serverIdSchema,
  promoCode: z.string().trim().toUpperCase().max(32).optional(),
  savePlayer: z.boolean().optional().default(false),
});

export const validatePlayerSchema = z.object({
  playerId: playerIdSchema,
  serverId: serverIdSchema,
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{6,20}$/, 'Invalid phone number')
    .optional()
    .or(z.literal('')),
  marketingOptIn: z.boolean().optional(),
});

export const savedPlayerSchema = z.object({
  gameId: z.string().min(1).max(64),
  playerId: playerIdSchema,
  serverId: serverIdSchema,
  label: z.string().trim().max(40).optional(),
});

export const ticketCreateSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(5).max(5000),
  orderId: z.string().max(64).optional(),
});

export const ticketReplySchema = z.object({
  message: z.string().trim().min(1).max(5000),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;

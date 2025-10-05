import { z } from 'zod';

// The contents of your decoded JWT.
export const authDataSchema = z.object({
	sub: z.string().nullable(),
});

export type AuthData = z.infer<typeof authDataSchema>;

import { syncedQuery, escapeLike } from '@rocicorp/zero';
import z from 'zod';
import { builder } from './schema';

export const queries = {
	users: syncedQuery('user', z.tuple([]), () => builder.user),
	profiles: syncedQuery('profile', z.tuple([]), () => builder.profile),
	posts: syncedQuery('post', z.tuple([]), () => builder.post),
};

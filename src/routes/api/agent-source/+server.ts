import { text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import agentScript from '../../../agent/index.js?raw';

export const GET: RequestHandler = async () => {
    return text(agentScript);
};

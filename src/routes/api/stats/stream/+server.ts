import type { RequestHandler } from './$types';
import { statsEmitter, type PeerStats } from '$lib/server/monitor';

export const GET: RequestHandler = async () => {
    let listener: (stats: Record<number, PeerStats>) => void;

    // Create SSE Stream
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();

            // Send initial connection message
            controller.enqueue(encoder.encode('event: connected\ndata: true\n\n'));

            listener = (stats) => {
                try {
                    const data = JSON.stringify(stats);
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch (e) {
                    // Controller might be closed
                    statsEmitter.off('stats', listener);
                }
            };

            statsEmitter.on('stats', listener);
        },
        cancel() {
            if (listener) statsEmitter.off('stats', listener);
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
};

// Déclarations minimales du module « ws » (seules les parties utilisées par le serveur).
declare module 'ws' {
  import type { IncomingMessage, Server } from 'node:http';
  export class WebSocket {
    readonly readyState: number;
    readonly OPEN: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    on(event: 'message', cb: (data: { toString(): string }) => void): this;
    on(event: 'close' | 'error', cb: () => void): this;
  }
  export class WebSocketServer {
    constructor(opts: { server: Server; path?: string; maxPayload?: number });
    on(event: 'connection', cb: (ws: WebSocket, req: IncomingMessage) => void): this;
    close(): void;
  }
}

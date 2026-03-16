declare module 'node:crypto' {
  export function createHash(algorithm: string): {
    update(value: string): { digest(encoding: string): string };
    digest(encoding: string): string;
  };
}

declare module 'node:fs/promises' {
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function readFile(path: string, encoding: string): Promise<string>;
  export function writeFile(path: string, data: string, encoding: string): Promise<void>;
}

declare module 'node:os' {
  export function cpus(): Array<unknown>;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
}

declare module 'node:worker_threads' {
  export class Worker {
    constructor(filename: string);
    once(event: 'message', listener: (value: any) => void): this;
    once(event: 'error', listener: (error: Error) => void): this;
    postMessage(value: any): void;
    terminate(): Promise<number>;
  }

  export const parentPort:
    | {
        on(event: 'message', listener: (value: any) => void): void;
        postMessage(value: any): void;
      }
    | null;
}

declare const console: {
  error(value: unknown): void;
  log(value: unknown): void;
  warn(...value: unknown[]): void;
};

declare const process: {
  argv: string[];
  cwd(): string;
  exitCode?: number;
};

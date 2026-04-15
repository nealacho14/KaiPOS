import type pino from 'pino';
import type { TokenPayload } from '@kaipos/shared/types';

export type AppEnv = {
  Variables: {
    logger: pino.Logger;
    user?: TokenPayload;
  };
};

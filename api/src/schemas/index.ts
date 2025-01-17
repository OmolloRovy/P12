import { z } from 'zod';
import util from 'util';
import config from '../config';
import redact from '../util/redact.util';
import Log from '../util/logger.util';

const { log } = new Log('schema validation');

const validateSizeFor768 = (value: {
  width: number;
  height: number;
  engine_id: string;
}): boolean => {
  const width = value.width;
  const height = value.height;
  const engine_id = value.engine_id;
  const size = width * height;

  return !(engine_id.includes('768') && (size < 589824 || size > 1048576));
};

const validateSizeForOtherEngines = (value: {
  width: number;
  height: number;
  engine_id: string;
}): boolean => {
  const width = value.width;
  const height = value.height;
  const engine_id = value.engine_id;
  const size = width * height;

  return !(engine_id.includes('768') === false && (size < 262144 || size > 1048576));
};

const schema = z.object({
  telemetry: z.boolean(),
  logs: z.object({
    level: z.enum(['silent', 'error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']),
  }),
  time: z.object({
    timezone: z.string(),
    format: z.string().nullish(),
  }),
  image: z.object({
    interval: z.number().min(10),
    order: z.enum(['random', 'recent']),
  }),
  transcript: z.object({
    cron: z.string(),
    minutes: z.number(),
    minimum: z.number().min(1),
  }),
  openai: z.object({
    key: z.string(),
    summary: z.object({
      model: z.string(),
      prompt: z.string(),
      random: z.string(),
    }),
    image: z.union([
      z.object({
        size: z.enum(['1024x1024', '512x512', '256x256']),
        style: z.array(z.string()).min(1),
      }),
      z.literal(false),
    ]),
  }),
  stabilityai: z
    .object({
      key: z.string(),
      image: z.union([
        z
          .object({
            engine_id: z.string(),
            width: z.number(),
            height: z.number(),
            timeout: z.number(),
            cfg_scale: z.number().min(0).max(35),
            samples: z.number().min(1).max(10),
            steps: z.number().min(10).max(50),
            style: z
              .array(
                z.enum([
                  '3d-model',
                  'analog-film',
                  'anime',
                  'cinematic',
                  'comic-book',
                  'digital-art',
                  'enhance',
                  'fantasy-art',
                  'isometric',
                  'line-art',
                  'low-poly',
                  'modeling-compound',
                  'neon-punk',
                  'origami',
                  'photographic',
                  'pixel-art',
                  'tile-texture',
                ])
              )
              .min(1),
          })
          .refine(
            (value) => value.width % 64 === 0 && value.height % 64 === 0,
            'Width and height must be multiples of 64'
          )
          .refine(
            validateSizeFor768,
            'Size must be between 589,824 (768x768) and 1,048,576 (1024x1024) for engine_id containing 768'
          )
          .refine(
            validateSizeForOtherEngines,
            'Size must be between 262,144 (512x512) and 1,048,576 (1024x1024) for other engine_ids'
          ),
        z.literal(false),
      ]),
    })
    .nullish(),
  system: z.object({
    port: z.number(),
    storage: z.object({
      path: z.string(),
    }),
  }),
});

export default (returnErrors: boolean = false) => {
  const configuration = config.lowercase();
  const errors: [string?] = [];
  const validate = schema.safeParse(configuration);

  if (!returnErrors)
    log.verbose(util.inspect(redact(configuration), { depth: null, colors: false }));

  if (!validate.success) {
    if (!returnErrors) log.error(`${validate.error.issues.length} validation error(s)`);
    validate.error.issues.forEach((error) => {
      const path = error.path.join('.');
      const message = `${path}: ${error.message.toLowerCase()}`;
      if (returnErrors) errors.push(message);
      else log.error(message);
    });
  }

  return errors;
};

import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables FIRST
dotenv.config();

// ============================================================
// ENVIRONMENT SCHEMA (Zod Validation)
// ============================================================

const envSchema = z.object({
    // App
    NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    PORT: z.string().transform(Number).default('4005'),
    SERVICE_NAME: z.string().default('media-service'),

    // MongoDB
    MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

    // JWT
    JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),

    // AWS
    AWS_ACCESS_KEY_ID: z.string().min(1, 'AWS_ACCESS_KEY_ID is required'),
    AWS_SECRET_ACCESS_KEY: z.string().min(1, 'AWS_SECRET_ACCESS_KEY is required'),
    AWS_REGION: z.string().default('ap-south-1'),
    AWS_S3_BUCKET: z.string().min(1, 'AWS_S3_BUCKET is required'),

    // CDN (optional)
    CDN_BASE_URL: z.string().optional().default(''),

    // Upload config
    PRESIGN_EXPIRY_SECONDS: z.string().transform(Number).default('600'),

    // File size limits (bytes)
    MAX_IMAGE_SIZE_BYTES: z.string().transform(Number).default('10485760'),      // 10 MB
    MAX_VIDEO_SIZE_BYTES: z.string().transform(Number).default('104857600'),     // 100 MB
    MAX_DOCUMENT_SIZE_BYTES: z.string().transform(Number).default('20971520'),   // 20 MB

    // CORS
    CORS_ORIGINS: z.string().default('*'),
});

// ============================================================
// VALIDATE AND PARSE
// ============================================================

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
    console.error('❌ [env] Invalid environment configuration:');
    parseResult.error.errors.forEach((err) => {
        console.error(`   - ${err.path.join('.')}: ${err.message}`);
    });
    console.error('\n💡 Hint: Copy .env.example to .env and fill in required values.\n');
    process.exit(1);
}

// ============================================================
// TYPED CONFIG OBJECT
// ============================================================

const parsedEnv = parseResult.data;

export const env = {
    // App
    nodeEnv: parsedEnv.NODE_ENV,
    port: parsedEnv.PORT,
    serviceName: parsedEnv.SERVICE_NAME,
    isDevelopment: parsedEnv.NODE_ENV === 'development',
    isProduction: parsedEnv.NODE_ENV === 'production',

    // MongoDB
    mongoUri: parsedEnv.MONGO_URI,

    // JWT
    jwtSecret: parsedEnv.JWT_SECRET,

    // AWS
    aws: {
        accessKeyId: parsedEnv.AWS_ACCESS_KEY_ID,
        secretAccessKey: parsedEnv.AWS_SECRET_ACCESS_KEY,
        region: parsedEnv.AWS_REGION,
        bucket: parsedEnv.AWS_S3_BUCKET,
    },

    // CDN
    cdnBaseUrl: parsedEnv.CDN_BASE_URL,

    // Upload
    presignExpirySeconds: parsedEnv.PRESIGN_EXPIRY_SECONDS,

    // File size limits
    fileSizeLimits: {
        image: parsedEnv.MAX_IMAGE_SIZE_BYTES,
        video: parsedEnv.MAX_VIDEO_SIZE_BYTES,
        document: parsedEnv.MAX_DOCUMENT_SIZE_BYTES,
    },

    // CORS
    corsOrigins: parsedEnv.CORS_ORIGINS === '*'
        ? '*'
        : parsedEnv.CORS_ORIGINS.split(',').map(s => s.trim()),
} as const;

// ============================================================
// TYPE EXPORT
// ============================================================

export type Env = typeof env;

// ============================================================
// STARTUP LOG
// ============================================================

console.log(`✅ [env] Configuration loaded successfully`);
console.log(`   Environment: ${env.nodeEnv}`);
console.log(`   S3 Bucket: ${env.aws.bucket}`);
console.log(`   Pre-sign Expiry: ${env.presignExpirySeconds}s`);

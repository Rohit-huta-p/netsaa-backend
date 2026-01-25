# Configuration & Setup

> **Document Index:** [06] Configuration  
> **Previous:** [05-caching-strategy.md](./05-caching-strategy.md) | **Next:** [07-deployment.md](./07-deployment.md)

---

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [Service Configuration](#service-configuration)
3. [Atlas Search Indexes](#atlas-search-indexes)
4. [Database Connection](#database-connection)
5. [Redis Configuration](#redis-configuration)
6. [Performance Tuning](#performance-tuning)

---

## Environment Setup

### Environment Variables

**Location:** `.env` file in service root

```env
# Server Configuration
PORT=5003
NODE_ENV=development

# MongoDB Atlas
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/netsa?retryWrites=true&w=majority

# Redis Cache (Optional)
REDIS_URL=redis://localhost:6379

# Service Metadata
SERVICE_NAME=search-service
SERVICE_VERSION=1.0.0
```

### Required Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | HTTP server port |
| `NODE_ENV` | No | `development` | Environment (development/production) |
| `MONGO_URI` | **Yes** | - | MongoDB Atlas connection string |
| `REDIS_URL` | No | - | Redis connection string (optional) |

### Environment Validation

**Location:** `src/config/env.ts`

```typescript
import dotenv from 'dotenv';
dotenv.config();

interface EnvConfig {
  PORT: number;
  MONGO_URI: string;
  REDIS_URL: string;
  NODE_ENV: string;
}

const getEnv = (): EnvConfig => {
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const MONGO_URI = process.env.MONGO_URI;
  const REDIS_URL = process.env.REDIS_URL;
  const NODE_ENV = process.env.NODE_ENV || 'development';
  
  // Validate required variables
  if (!MONGO_URI) {
    throw new Error('FATAL: MONGO_URI is not defined.');
  }
  
  if (!REDIS_URL) {
    console.warn('WARNING: REDIS_URL is not defined. Caching may fail.');
  }
  
  return {
    PORT,
    MONGO_URI,
    REDIS_URL: REDIS_URL || '',
    NODE_ENV,
  };
};

export const env = getEnv();
```

---

## Service Configuration

### Search Configuration

**Location:** `src/config/search.ts`

```typescript
export const SEARCH_CONFIG = {
  // Pagination
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 50,
  
  // Timeouts & Latency Targets (SLOs)
  TIMEOUT_MS: 5000,
  SLO_SEARCH_P95_MS: 250,      // Target P95 latency for search
  SLO_PREVIEW_P95_MS: 200,     // Target P95 latency for preview
  
  // Caching
  CACHE_TTL_SECONDS: 300,      // 5 minutes (300 seconds)
  
  // Indexing
  INDEX_FRESHNESS_TARGET_SECONDS: 5,
};
```

### Ranking Weights

**Location:** `src/ranking/weights.ts`

```typescript
export const PEOPLE_WEIGHTS = {
  NAME_MATCH: 3.0,
  ARTIST_TYPE_MATCH: 2.0,
  SPECIALITY_MATCH: 2.0,
  RATING_BOOST: 1.5,
  FEATURED_BOOST: 5.0,
};

export const GIGS_WEIGHTS = {
  TITLE_MATCH: 3.0,
  ARTIST_TYPE_MATCH: 2.0,
  CITY_MATCH: 1.5,
  FEATURED_BOOST: 5.0,
  URGENT_BOOST: 5.0,
};

export const EVENTS_WEIGHTS = {
  TITLE_MATCH: 3.0,
  EVENT_TYPE_MATCH: 2.0,
  UPCOMING_BOOST: 2.0,
};
```

**Tuning Recommendations:**
- Increase weights for more important signals
- Test changes with representative queries
- Monitor average scores and result quality

### Search Contract Validation

**Location:** `src/config/search.contract.ts`

```typescript
export const SEARCH_CONTRACT = {
  // Index names (must match Atlas configuration)
  PEOPLE_INDEX: 'people_search_index',
  GIGS_INDEX: 'gigs_search_index',
  EVENTS_INDEX: 'events_search_index',
  
  // Collection names
  PEOPLE_COLLECTION: 'users',
  GIGS_COLLECTION: 'gigs',
  EVENTS_COLLECTION: 'events',
};
```

---

## Atlas Search Indexes

### Creating Indexes via Atlas UI

**Step-by-step:**

1. **Login to MongoDB Atlas** → https://cloud.mongodb.com
2. **Navigate to your cluster** → Click "Search"
3. **Click "Create Search Index"**
4. **Choose "JSON Editor"**
5. **Select collection** (e.g., `users`, `gigs`, `events`)
6. **Paste index definition** (see below)
7. **Name the index** (e.g., `people_search_index`)
8. **Click "Create Index"**
9. **Wait for build** (~1-5 minutes)

### Index Definitions

#### People Search Index

**Collection:** `users`  
**Index Name:** `people_search_index`

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "displayName": {
        "type": "autocomplete",
        "tokenization": "edgeGram",
        "minGrams": 2,
        "maxGrams": 15,
        "foldDiacritics": true
      },
      "artistType": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "skills": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "experience": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "location": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "instagramHandle": {
        "type": "string",
        "analyzer": "lucene.keyword"
      },
      "role": {
        "type": "string",
        "analyzer": "lucene.keyword"
      },
      "blocked": {
        "type": "boolean"
      },
      "cached": {
        "type": "document",
        "fields": {
          "primaryCity": {
            "type": "string",
            "analyzer": "lucene.keyword"
          },
          "averageRating": {
            "type": "number"
          },
          "featured": {
            "type": "boolean"
          }
        }
      }
    }
  }
}
```

#### Gigs Search Index

**Collection:** `gigs`  
**Index Name:** `gigs_search_index`

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "title": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "artistType": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "city": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "isUrgent": {
        "type": "boolean"
      },
      "isFeatured": {
        "type": "boolean"
      },
      "status": {
        "type": "string",
        "analyzer": "lucene.keyword"
      },
      "expiresAt": {
        "type": "date"
      }
    }
  }
}
```

#### Events Search Index

**Collection:** `events`  
**Index Name:** `events_search_index`

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "title": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "eventType": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "city": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "startDate": {
        "type": "date"
      },
      "status": {
        "type": "string",
        "analyzer": "lucene.keyword"
      }
    }
  }
}
```

### Index Field Types Explained

| Type | Use Case | Example |
|------|----------|---------|
| **`autocomplete`** | Prefix matching (as-you-type) | "Pri" → "Priyanka" |
| **`string` (standard)** | Full-text search with stemming | "dancing" → "dance" |
| **`string` (keyword)** | Exact matching | `role: "artist"` |
| **`number`** | Numeric range/boost | `rating >= 4` |
| **`boolean`** | True/false filters | `blocked: false` |
| **`date`** | Date ranges/temporal scoring | `expiresAt > now` |

---

## Database Connection

### MongoDB Configuration

**Location:** `src/config/mongo.ts`

```typescript
import mongoose from 'mongoose';
import { env } from './env';

export const connectMongo = async (): Promise<void> => {
  try {
    await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,  // 5s timeout
      socketTimeoutMS: 45000,           // 45s socket timeout
    });
    
    console.log('[MongoDB] Connected successfully');
    
    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] Connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Disconnected');
    });
    
  } catch (error) {
    console.error('[MongoDB] Failed to connect:', error);
    throw error;
  }
};

export const disconnectMongo = async (): Promise<void> => {
  await mongoose.disconnect();
  console.log('[MongoDB] Disconnected');
};
```

### Connection Pooling

Mongoose automatically manages connection pooling. Default settings:

```typescript
// Default pool configuration (handled by Mongoose)
{
  maxPoolSize: 10,        // Max connections
  minPoolSize: 2,         // Min connections
  maxIdleTimeMS: 60000,   // 60s idle timeout
}
```

**For high-traffic production:**
```typescript
await mongoose.connect(env.MONGO_URI, {
  maxPoolSize: 50,   // Increase for more concurrent requests
  minPoolSize: 5,
});
```

---

## Redis Configuration

### Redis Connection

**Location:** `src/config/redis.ts`

```typescript
import Redis from 'ioredis';
import { env } from './env';

let redisClient: Redis | null = null;

export const connectRedis = async (): Promise<void> => {
  if (!env.REDIS_URL) {
    console.warn('[Redis] REDIS_URL not configured. Caching disabled.');
    return;
  }
  
  try {
    redisClient = new Redis(env.REDIS_URL, {
      // Retry on connection failure
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,  // Fail fast if disconnected
    });
    
    redisClient.on('connect', () => {
      console.log('[Redis] Connected successfully');
    });
    
    redisClient.on('error', (err) => {
      console.error('[Redis] Connection error:', err);
    });
    
  } catch (error) {
    console.error('[Redis] Failed to connect:', error);
  }
};

export const getRedisClient = (): Redis | null => redisClient;

export const disconnectRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('[Redis] Disconnected');
  }
};
```

### Redis for Local Development

**Option 1: Docker**
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

**Option 2: Homebrew (macOS)**
```bash
brew install redis
brew services start redis
```

**Option 3: Skip Redis** (cache will be disabled)
```env
# Don't set REDIS_URL in .env
# Service will run without caching
```

---

## Performance Tuning

### Atlas Search Index Tuning

#### 1. **Dynamic Mapping**

**Current:** `"dynamic": false`

**Why?** Forces explicit field definitions, faster indexing.

**Alternative:** `"dynamic": true` (indexes all fields, slower but flexible)

#### 2. **Autocomplete Token Ranges**

```json
{
  "minGrams": 2,
  "maxGrams": 15
}
```

**Trade-offs:**
- **Lower minGrams** (e.g., 1): Match single characters, larger index
- **Higher minGrams** (e.g., 3): Faster, smaller index, miss short prefixes
- **Lower maxGrams** (e.g., 10): Smaller index, truncate long names
- **Higher maxGrams** (e.g., 20): Larger index, match longer names

**Recommendation:** `minGrams: 2, maxGrams: 15` (balanced)

#### 3. **Analyzers**

| Analyzer | Use Case | Behavior |
|----------|----------|----------|
| `lucene.standard` | Full-text | Lowercase, tokenize, stem |
| `lucene.keyword` | Exact match | No tokenization |
| `lucene.whitespace` | Space-separated tokens | No stemming |

### Service Performance Settings

#### Pagination Limits

```typescript
// src/config/search.ts
export const SEARCH_CONFIG = {
  DEFAULT_PAGE_SIZE: 10,    // Default results per page
  MAX_PAGE_SIZE: 50,        // Prevent heavy queries
};
```

**Enforce in controller:**
```typescript
const pageSize = Math.min(
  parseInt(req.query.pageSize as string) || SEARCH_CONFIG.DEFAULT_PAGE_SIZE,
  SEARCH_CONFIG.MAX_PAGE_SIZE
);
```

#### Timeout Configuration

```typescript
// MongoDB query timeout
await collection.aggregate(pipeline).maxTimeMS(5000);

// HTTP request timeout (in app.ts or gateway)
app.use(timeout('6s'));
```

### Caching Optimization

**TTL based on volatility:**
```typescript
export const CACHE_TTL = {
  SEARCH_RESULTS: 300,      // 5 min (default)
  PREVIEW: 120,             // 2 min (higher turnover)
  FEATURED: 600,            // 10 min (stable data)
};
```

### Connection Pooling

**MongoDB:**
```typescript
maxPoolSize: 50,  // For production with high traffic
minPoolSize: 5,
```

**Redis:**
```typescript
new Redis(url, {
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
});
```

---

## Health Checks

### Service Health Endpoint

```typescript
app.get('/search/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'search-service',
    timestamp: new Date().toISOString()
  });
});
```

### Dependency Health Checks

Add detailed health check:

```typescript
app.get('/search/health/detailed', async (req, res) => {
  const health = {
    service: 'search-service',
    status: 'ok',
    checks: {
      mongodb: 'unknown',
      redis: 'unknown'
    }
  };
  
  // Check MongoDB
  try {
    await mongoose.connection.db.admin().ping();
    health.checks.mongodb = 'healthy';
  } catch (e) {
    health.checks.mongodb = 'unhealthy';
    health.status = 'degraded';
  }
  
  // Check Redis
  try {
    const redis = getRedisClient();
    if (redis) {
      await redis.ping();
      health.checks.redis = 'healthy';
    } else {
      health.checks.redis = 'not_configured';
    }
  } catch (e) {
    health.checks.redis = 'unhealthy';
  }
  
  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

---

**Document Index:** [06] Configuration  
**Previous:** [05-caching-strategy.md](./05-caching-strategy.md) | **Next:** [07-deployment.md](./07-deployment.md)

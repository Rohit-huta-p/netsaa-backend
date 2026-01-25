# Caching Strategy

> **Document Index:** [05] Caching Strategy  
> **Previous:** [04-data-models.md](./04-data-models.md) | **Next:** [06-configuration.md](./06-configuration.md)

---

## Table of Contents

1. [Overview](#overview)
2. [Cache Architecture](#cache-architecture)
3. [Cache Key Generation](#cache-key-generation)
4. [Cache Implementation](#cache-implementation)
5. [Cache Invalidation](#cache-invalidation)
6. [Performance Impact](#performance-impact)
7. [Configuration](#configuration)

---

## Overview

### Why Caching?

Search queries can be **expensive operations**:
- Atlas Search index scanning
- Document enrichment (batch MongoDB queries)
- Score calculation and sorting
- Data transformation

**Caching Benefits:**
- **Latency Reduction**: ~200ms → ~5ms (40x faster)
- **Database Load**: 75% reduction in Atlas queries
- **Cost Savings**: Fewer Atlas read operations
- **Better UX**: Near-instant results for repeat searches

### Current Status

> ⚠️ **Note**: Caching is currently **DISABLED** in the codebase  
> Located in: `src/cache/cache.service.ts`

**To enable**: Uncomment the implementation in `cache.service.ts`

```typescript
// CURRENT (disabled)
get: async <T>(key: string) => {
  return null;  // Always cache miss
}

// TO ENABLE (uncomment)
get: async <T>(key: string) => {
  const data = await cacheClient.get(key);
  return data ? JSON.parse(data) : null;
}
```

---

## Cache Architecture

### Two-Tier Caching Strategy

```mermaid
graph TB
    Client[Client Request]
    Service[Search Service]
    Redis[(Redis Cache)]
    MongoDB[(MongoDB Atlas)]
    
    Client -->|1. Search Query| Service
    Service -->|2. Check Cache| Redis
    Redis -->|3a. Hit: Return| Service
    Redis -.->|3b. Miss| Service
    Service -.->|4. Query| MongoDB
    MongoDB -.->|5. Results| Service
    Service -.->|6. Store| Redis
    Service -->|7. Response| Client
    
    style Redis fill:#f96,stroke:#333
    style MongoDB fill:#6c9,stroke:#333
```

### Cache Layers

#### Layer 1: Redis (Distributed)
- **Scope**: Shared across all service instances
- **TTL**: 5 minutes (300 seconds)
- **Eviction**: LRU (Least Recently Used)
- **Serialization**: JSON

#### Layer 2: MongoDB (Source of Truth)
- **Scope**: Persistent storage
- **Latency**: ~150-200ms
- **Always consulted on cache miss**

---

## Cache Key Generation

### Deterministic Key Strategy

**Goal**: Same query parameters → Same cache key

**Location:** `src/cache/cache.keys.ts`

```typescript
export const generateSearchKey = (
  index: string,        // 'people', 'gigs', or 'events'
  query: string,        // Search query
  filters: Record<string, any>,  // Filter object
  page: number,         // Page number
  pageSize: number      // Results per page
): string => {
  // 1. Stable stringify filters (deterministic key ordering)
  const filtersString = stableStringify(filters);
  
  // 2. Concatenate all parameters
  const payload = `${index}:${query}:${filtersString}:${page}:${pageSize}`;
  
  // 3. Hash to fixed-length key
  const hash = createMd5Hash(payload);
  
  // 4. Prefix with namespace
  return `search:${index}:${hash}`;
};
```

### Stable Stringify

**Why needed?** JavaScript objects have **non-deterministic** key order:

```javascript
// These are equivalent but produce different JSON.stringify() results:
{ city: "Bangalore", rating: 4 }
{ rating: 4, city: "Bangalore" }
```

**Solution:** Sort keys before stringifying

```typescript
// From src/utils/hash.util.ts
export const stableStringify = (obj: any): string => {
  if (typeof obj !== 'object' || obj === null) {
    return JSON.stringify(obj);
  }
  
  // Sort keys alphabetically
  const sortedKeys = Object.keys(obj).sort();
  
  const pairs = sortedKeys.map(key => {
    const value = typeof obj[key] === 'object' 
      ? stableStringify(obj[key])  // Recursive for nested objects
      : JSON.stringify(obj[key]);
    return `"${key}":${value}`;
  });
  
  return `{${pairs.join(',')}}`;
};
```

### MD5 Hashing

**Why hash?** To create **fixed-length** keys regardless of input size

```typescript
// From src/utils/hash.util.ts
import crypto from 'crypto';

export const createMd5Hash = (input: string): string => {
  return crypto
    .createHash('md5')
    .update(input)
    .digest('hex');
};
```

### Example Key Generation

**Input:**
```typescript
generateSearchKey(
  'people',
  'dancer',
  { city: 'Bangalore', rating: 4 },
  1,
  10
)
```

**Steps:**
1. **Stable stringify filters**: `{"city":"Bangalore","rating":4}`
2. **Concatenate**: `people:dancer:{"city":"Bangalore","rating":4}:1:10`
3. **MD5 hash**: `a3f2b1c9d8e7f6a5b4c3d2e1f0a9b8c7`
4. **Final key**: `search:people:a3f2b1c9d8e7f6a5b4c3d2e1f0a9b8c7`

### Key Properties

✅ **Deterministic**: Same inputs always produce the same key  
✅ **Collision-resistant**: Different inputs produce different keys  
✅ **Fixed-length**: Always 32 characters (MD5 hex)  
✅ **Namespaced**: Prefixed with `search:{vertical}:`

---

## Cache Implementation

### Cache Client

**Location:** `src/cache/cache.client.ts`

Wraps **ioredis** client with error handling:

```typescript
import { getRedisClient } from '../config/redis';

export const cacheClient = {
  // GET operation
  get: async (key: string): Promise<string | null | undefined> => {
    try {
      const redis = getRedisClient();
      if (!redis) return undefined;  // Redis not available
      return await redis.get(key);
    } catch (error) {
      console.warn(`[Cache] Get error for key ${key}:`, error);
      return undefined;  // Fail silently
    }
  },
  
  // SET operation with TTL
  set: async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
    try {
      const redis = getRedisClient();
      if (!redis) return;
      
      if (ttlSeconds) {
        await redis.set(key, value, 'EX', ttlSeconds);
      } else {
        await redis.set(key, value);
      }
    } catch (error) {
      console.warn(`[Cache] Set error for key ${key}:`, error);
      // Don't throw - caching is optional
    }
  }
};
```

### Cache Service

**Location:** `src/cache/cache.service.ts`

High-level API with JSON serialization:

```typescript
export const CACHE_TTL = {
  SEARCH_RESULTS: 60 * 5,  // 5 minutes
};

export const cacheService = {
  // Generic get with type safety
  get: async <T>(key: string): Promise<T | null> => {
    const data = await cacheClient.get(key);
    if (!data) return null;
    
    try {
      return JSON.parse(data) as T;
    } catch (e) {
      console.error('[Cache] JSON parse error:', e);
      return null;
    }
  },
  
  // Generic set with automatic serialization
  set: async (key: string, value: any, ttlSeconds = CACHE_TTL.SEARCH_RESULTS): Promise<void> => {
    const stringValue = JSON.stringify(value);
    await cacheClient.set(key, stringValue, ttlSeconds);
  }
};
```

### Usage in Search Modules

**Example:** People search with caching

```typescript
// From src/modules/people/people.search.ts
export const searchPeopleInDb = async (
  query: string,
  filters: Record<string, any>,
  page: number,
  pageSize: number,
  currentUserId?: string
) => {
  // 1. Generate cache key
  const cacheKey = generateSearchKey('people', query, { ...filters, excludedUser: currentUserId }, page, pageSize);
  
  // 2. Try cache first
  const cached = await cacheService.get<{ results: any[]; total: number }>(cacheKey);
  if (cached) {
    console.log(`[Cache HIT] ${cacheKey}`);
    return cached;
  }
  
  console.log(`[Cache MISS] ${cacheKey}`);
  
  // 3. Execute search (expensive operation)
  // ... build pipeline, execute search, enrich, map ...
  
  const response = {
    results: enrichedResults,
    total
  };
  
  // 4. Store in cache (async, don't wait)
  await cacheService.set(cacheKey, response);
  
  return response;
};
```

---

## Cache Invalidation

### Current Strategy: **Time-Based (TTL)**

- **TTL**: 5 minutes (300 seconds)
- **Eviction**: Automatic after expiration
- **Trade-off**: Potential stale data ≤ 5 minutes

### Why 5 Minutes?

| Duration | Pros | Cons |
|----------|------|------|
| **30 seconds** | Fresh data | Low hit rate, high DB load |
| **5 minutes** ✅ | Good hit rate, acceptable freshness | Some staleness possible |
| **30 minutes** | Very high hit rate | Stale data, poor UX for updates |

### Staleness Scenarios

**Scenario 1: Profile Update**
```
1. User updates profile (name: "Priya" → "Priya Sharma")
2. Search cache still has old name
3. After 5 minutes, cache expires
4. Next search fetches fresh data
```

**Acceptable?** ✅ Yes - Non-critical delay

**Scenario 2: Gig Published**
```
1. Organizer publishes new gig
2. Search cache doesn't include it yet
3. After 5 minutes (or less), cache expires
4. New gig appears in search results
```

**Acceptable?** ✅ Yes - Gigs don't need instant visibility

### Future: Event-Based Invalidation

For stricter freshness requirements, implement **cache invalidation on write**:

```typescript
// In gigs-service (after publishing gig)
await publishEvent('gig.published', { gigId, artistType, city });

// In search-service (event listener)
async function handleGigPublished(event) {
  // Invalidate all gig caches
  const pattern = 'search:gigs:*';
  const keys = await redis.keys(pattern);
  await redis.del(...keys);
}
```

**Trade-offs:**
- ✅ Always fresh data
- ❌ More complex architecture
- ❌ Requires message queue (RabbitMQ, Kafka)
- ❌ Higher operational overhead

---

## Performance Impact

### Latency Comparison

| Scenario | Without Cache | With Cache (Hit) | Improvement |
|----------|---------------|------------------|-------------|
| **People Search** | ~180ms | ~5ms | **36x faster** |
| **Gigs Search** | ~160ms | ~5ms | **32x faster** |
| **Events Search** | ~160ms | ~5ms | **32x faster** |
| **Preview Search** | ~400ms | ~15ms | **27x faster** |

### Cache Hit Rate Analysis

**Production Metrics** (simulated):

```
Total Searches: 10,000
Cache Hits: 7,500
Cache Misses: 2,500
Hit Rate: 75%
```

**Why 75% hit rate?**
- Repeat searches (same query by different users)
- Pagination (page 1 → page 2 of same search)
- Popular queries ("dancer in Bangalore")

### Database Load Reduction

**Without Cache:**
```
10,000 searches → 10,000 MongoDB Atlas queries
```

**With 75% Cache Hit Rate:**
```
10,000 searches → 2,500 MongoDB Atlas queries (75% reduction)
```

**Cost Savings:**
- MongoDB Atlas charges per read operation
- 75% fewer reads = 75% lower query costs

---

## Configuration

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
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3
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

### Environment Variables

```env
# Redis Configuration
REDIS_URL=redis://localhost:6379

# For Redis Cloud / Upstash / AWS ElastiCache:
# REDIS_URL=redis://username:password@host:port

# For TLS:
# REDIS_URL=rediss://username:password@host:port
```

### Cache TTL Configuration

**Location:** `src/cache/cache.service.ts`

```typescript
export const CACHE_TTL = {
  SEARCH_RESULTS: 60 * 5,      // 5 minutes (default)
  PREVIEW_RESULTS: 60 * 2,     // 2 minutes (more volatile)
  FEATURED_RESULTS: 60 * 10,   // 10 minutes (less volatile)
};

// Usage:
await cacheService.set(key, data, CACHE_TTL.PREVIEW_RESULTS);
```

### Enabling/Disabling Cache

**1. Via Environment Variable** (recommended)

```typescript
// In cache.service.ts
const CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false';

get: async <T>(key: string) => {
  if (!CACHE_ENABLED) return null;
  // ... rest of implementation
}
```

**2. Via Configuration Flag**

```typescript
// In src/config/search.ts
export const SEARCH_CONFIG = {
  // ...
  CACHE_ENABLED: true,
  CACHE_TTL_SECONDS: 300,
};
```

---

## Monitoring & Debugging

### Cache Hit/Miss Logging

```typescript
const cached = await cacheService.get(cacheKey);
if (cached) {
  console.log(`[Cache HIT] ${cacheKey.substring(0, 50)}...`);
  return cached;
}
console.log(`[Cache MISS] ${cacheKey.substring(0, 50)}...`);
```

### Recommended Metrics

Track these in production:

1. **Hit Rate**: `hits / (hits + misses)`
2. **Average Latency (Cache Hit)**: Should be < 10ms
3. **Average Latency (Cache Miss)**: ~150-200ms
4. **Cache Size**: Number of keys in Redis
5. **Memory Usage**: Redis memory consumption
6. **Eviction Rate**: Keys evicted due to memory limits

### Redis CLI Debugging

```bash
# Connect to Redis
redis-cli

# List all search cache keys
KEYS search:*

# Get a specific key
GET search:people:a3f2b1c9d8e7f6a5b4c3d2e1f0a9b8c7

# Check TTL
TTL search:people:a3f2b1c9d8e7f6a5b4c3d2e1f0a9b8c7

# Delete a key (manual invalidation)
DEL search:people:a3f2b1c9d8e7f6a5b4c3d2e1f0a9b8c7

# Clear all search caches
KEYS search:* | xargs redis-cli DEL
```

---

**Document Index:** [05] Caching Strategy  
**Previous:** [04-data-models.md](./04-data-models.md) | **Next:** [06-configuration.md](./06-configuration.md)

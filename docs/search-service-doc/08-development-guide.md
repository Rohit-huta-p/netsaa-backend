# Development Guide

> **Document Index:** [08] Development Guide  
> **Previous:** [07-deployment.md](./07-deployment.md)

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Local Development Setup](#local-development-setup)
3. [Code Examples](#code-examples)
4. [Testing](#testing)
5. [Best Practices](#best-practices)
6. [Common Patterns](#common-patterns)
7. [Debugging](#debugging)
8. [Contributing](#contributing)

---

## Getting Started

### Quick Start for Developers

```bash
# 1. Clone the repository
cd netsa-backend/search-service

# 2. Install dependencies
npm install

# 3. Create .env file
cp .env.example .env
# Edit .env with your MongoDB and Redis URLs

# 4. Start development server
npm run dev

# 5. Test the service
curl http://localhost:5003/search/health
```

---

## Local Development Setup

### Prerequisites

- **Node.js** v16+ (v18 LTS recommended)
- **MongoDB Atlas** account (or local MongoDB with Atlas Search)
- **Redis** (optional for local dev)
- **TypeScript** knowledge

### Step-by-Step Setup

#### 1. Install Dependencies

```bash
npm install
```

**Key Dependencies:**
- `express` - Web framework
- `mongoose` - MongoDB ODM
- `ioredis` - Redis client
- `typescript` - Type safety
- `nodemon` - Hot reloading

#### 2. Configure Environment

Create `.env` file:

```env
PORT=5003
NODE_ENV=development
MONGO_URI=mongodb+srv://dev_user:password@dev-cluster.mongodb.net/netsa-dev
REDIS_URL=redis://localhost:6379
```

#### 3. Start MongoDB (if local)

**Option A: Docker**
```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

**Option B: Atlas (recommended)**
- Use MongoDB Atlas free tier
- Create search indexes as per [06-configuration.md](./06-configuration.md)

#### 4. Start Redis (optional)

```bash
# Docker
docker run -d -p 6379:6379 --name redis redis:7-alpine

# Or Homebrew (macOS)
brew services start redis

# Or skip Redis (caching disabled)
# Just don't set REDIS_URL in .env
```

#### 5. Run Development Server

```bash
npm run dev
```

**Expected Output:**
```
[search-service] running on port 5003
[MongoDB] Connected successfully
[Redis] Connected successfully
```

#### 6. Verify Setup

```bash
# Health check
curl http://localhost:5003/search/health

# Test search
curl "http://localhost:5003/search/preview?q=dancer"
```

---

## Code Examples

### Adding a New Search Filter

**Example: Add "experience level" filter to people search**

#### Step 1: Update Filter Builder

```typescript
// File: src/modules/people/people.filters.ts

export const buildPeopleFilters = (filters: Record<string, any>) => {
  const must: any[] = [];
  const should: any[] = [];
  const { filter, mustNot } = buildPeopleVisibility();
  
  // Existing filters...
  
  // ✨ NEW: Experience level filter
  if (filters.experienceLevel) {
    must.push({
      text: {
        query: filters.experienceLevel,  // e.g., "beginner", "intermediate", "expert"
        path: "experienceLevel",
      }
    });
  }
  
  return { must, should, filter, mustNot };
};
```

#### Step 2: Update Atlas Search Index

Add field to `people_search_index`:

```json
{
  "experienceLevel": {
    "type": "string",
    "analyzer": "lucene.keyword"
  }
}
```

#### Step 3: Test

```bash
curl "http://localhost:5003/search/people?q=dancer&experienceLevel=expert"
```

---

### Creating a New Ranking Boost

**Example: Boost recently active users**

```typescript
// File: src/ranking/people.rank.ts

export const buildPeopleRankingClauses = (query: string) => {
  const clauses = [];
  
  // Existing clauses...
  
  // ✨ NEW: Boost recently active users (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  clauses.push({
    range: {
      path: "lastActiveAt",
      gte: thirtyDaysAgo,
      score: { boost: { value: 1.2 } }  // 20% boost
    }
  });
  
  return clauses;
};
```

**Update Index:**
```json
{
  "lastActiveAt": {
    "type": "date"
  }
}
```

---

### Adding a New Metadata Field to Search Results

**Example: Add "connection count" to people results**

```typescript
// File: src/modules/people/people.mapper.ts

export const mapPersonToSearchResult = (doc: any): SearchResultItemDTO => {
  return {
    id: doc._id.toString(),
    type: 'people',
    title: doc.displayName,
    subtitle: [doc.artistType, doc.city].filter(Boolean).join(' • '),
    image: doc.profilePicture,
    score: doc.score,
    metadata: {
      username: doc.username,
      rating: doc.cached?.averageRating,
      verified: doc.isVerified,
      // ✨ NEW: Add connection count
      connectionCount: doc.cached?.connectionCount || 0
    }
  };
};
```

---

### Implementing Custom Enrichment Logic

**Example: Add "mutual connections" for people search**

```typescript
// File: src/modules/enrichment/enrich.people.ts

export const enrichPeopleResults = async (
  originalIds: string[],
  viewerId?: string  // Current user ID
) => {
  // ... existing code to fetch documents ...
  
  // ✨ NEW: Fetch mutual connections
  let mutualConnectionsMap = new Map();
  
  if (viewerId) {
    // Get viewer's connections
    const viewerConnections = await db.collection('connections')
      .find({ userId: viewerId, status: 'connected' })
      .toArray();
    
    const viewerConnectionIds = viewerConnections.map(c => c.connectedUserId);
    
    // For each result, find mutual connections
    for (const id of originalIds) {
      const mutuals = await db.collection('connections')
        .find({
          userId: id,
          connectedUserId: { $in: viewerConnectionIds },
          status: 'connected'
        })
        .toArray();
      
      mutualConnectionsMap.set(id, mutuals.length);
    }
  }
  
  // Add to results
  return originalIds.map(id => {
    const doc = docMap.get(id);
    return {
      ...doc,
      mutualConnections: mutualConnectionsMap.get(id) || 0
    };
  });
};
```

---

## Testing

### Manual Testing with cURL

```bash
# Preview search
curl "http://localhost:5003/search/preview?q=dancer"

# People search with filters
curl "http://localhost:5003/search/people?q=musician&city=Mumbai&page=1"

# Gigs search
curl "http://localhost:5003/search/gigs?q=wedding&artistType=Dancer"

# Events search
curl "http://localhost:5003/search/events?q=festival"

# Test with user ID (personalization)
curl "http://localhost:5003/search/people?q=artist" \
  -H "X-User-Id: 65f123abc456def789012345"
```

### Testing with Postman

**1. Create Collection:** NETSA Search Service

**2. Add Requests:**

| Name | Method | URL | Headers |
|------|--------|-----|---------|
| Health Check | GET | `http://localhost:5003/search/health` | - |
| Preview Search | GET | `http://localhost:5003/search/preview?q=dancer` | - |
| People Search | GET | `http://localhost:5003/search/people?q=dancer&city=Bangalore` | `X-User-Id: <userid>` |

**3. Environment Variables:**
- `BASE_URL`: `http://localhost:5003`
- `TEST_USER_ID`: Your test user ID

### Testing Cache Behavior

```bash
# First request (cache miss)
time curl "http://localhost:5003/search/people?q=dancer"
# Note the time: ~180ms

# Second request (cache hit, if enabled)
time curl "http://localhost:5003/search/people?q=dancer"
# Note the time: ~5ms (98% faster!)

# Check Redis for cached key
redis-cli KEYS "search:people:*"
```

### Unit Testing (Basic Example)

**File:** `tests/people.search.test.ts`

```typescript
import { searchPeopleInDb } from '../src/modules/people/people.search';

describe('People Search', () => {
  it('should return results for valid query', async () => {
    const result = await searchPeopleInDb('dancer', {}, 1, 10);
    
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('total');
    expect(Array.isArray(result.results)).toBe(true);
  });
  
  it('should filter by city', async () => {
    const result = await searchPeopleInDb('dancer', { city: 'Bangalore' }, 1, 10);
    
    result.results.forEach(person => {
      expect(person.subtitle).toContain('Bangalore');
    });
  });
});
```

**Run tests:**
```bash
npm test
```

---

## Best Practices

### 1. **Use TypeScript Strictly**

```typescript
// ✅ Good: Typed parameters
async function searchPeople(
  query: string,
  filters: FilterOptions,
  page: number
): Promise<SearchResponse> {
  // ...
}

// ❌ Bad: No types
async function searchPeople(query, filters, page) {
  // ...
}
```

### 2. **Error Handling**

```typescript
// ✅ Good: Graceful degradation
try {
  const results = await atlasClient.executeSearch('users', pipeline);
  return results;
} catch (error) {
  console.error('[Search Error]:', error);
  return { results: [], total: 0 };  // Return empty instead of crashing
}

// ❌ Bad: Let errors bubble up unhandled
const results = await atlasClient.executeSearch('users', pipeline);
```

### 3. **Logging**

```typescript
// ✅ Good: Structured logging with context
console.log(`[people.search] Executing search: query="${query}", filters=${JSON.stringify(filters)}, userId=${userId}`);

// ❌ Bad: Unclear logs
console.log('searching...');
```

### 4. **Cache Invalidation**

```typescript
// ✅ Good: Include all relevant parameters in cache key
const cacheKey = generateSearchKey('people', query, { ...filters, userId }, page, pageSize);

// ❌ Bad: Miss important parameters
const cacheKey = `people:${query}:${page}`;  // Ignores filters!
```

### 5. **Avoid N+1 Queries**

```typescript
// ✅ Good: Batch fetch documents
const ids = searchResults.map(r => r._id);
const docs = await db.collection('users').find({ _id: { $in: ids } }).toArray();

// ❌ Bad: Loop and fetch individually
for (const result of searchResults) {
  const doc = await db.collection('users').findOne({ _id: result._id });
}
```

### 6. **Pagination Validation**

```typescript
// ✅ Good: Enforce limits
const page = Math.max(1, parseInt(req.query.page || '1'));
const pageSize = Math.min(
  parseInt(req.query.pageSize || '10'),
  SEARCH_CONFIG.MAX_PAGE_SIZE
);

// ❌ Bad: No validation
const page = req.query.page || 1;
const pageSize = req.query.pageSize || 10;  // User can request 1000000!
```

---

## Common Patterns

### Pattern 1: Adding a New Vertical (e.g., "Organizations")

**1. Create search module**
```
src/modules/organizations/
├── organizations.search.ts
├── organizations.filters.ts
└── organizations.mapper.ts
```

**2. Create pipeline builder**
```typescript
// src/infra/search/pipelines/organizations.pipeline.ts
export const buildOrganizationsPipeline = (...) => { ... };
```

**3. Create ranking clauses**
```typescript
// src/ranking/organizations.rank.ts
export const buildOrganizationsRankingClauses = (...) => { ... };
```

**4. Create enrichment**
```typescript
// src/modules/enrichment/enrich.organizations.ts
export const enrichOrganizationsResults = (...) => { ... };
```

**5. Add route**
```typescript
// src/modules/search/search.routes.ts
router.get('/organizations', searchController.searchOrganizations.bind(searchController));
```

**6. Add controller method**
```typescript
// src/modules/search/search.controller.ts
async searchOrganizations(req, res, next) { ... }
```

**7. Add service method**
```typescript
// src/modules/search/search.service.ts
async searchOrganizations(query, filters, page) { ... }
```

**8. Create Atlas Search Index**

Index name: `organizations_search_index` on `organizations` collection

---

### Pattern 2: Adding Custom Scoring Logic

```typescript
// src/ranking/custom-scorer.ts

export const customScore = (doc: any, context: any): number => {
  let score = doc.score || 0;  // Base Atlas score
  
  // Custom boosts
  if (doc.isPremium) score *= 1.5;
  if (doc.isVerified) score *= 1.2;
  if (context.userCity === doc.city) score *= 1.3;  // Location match
  
  return score;
};

// In search module:
const enrichedResults = results.map(doc => ({
  ...doc,
  score: customScore(doc, { userCity: context.userCity })
}));
```

---

## Debugging

### Debug MongoDB Queries

```typescript
// Enable Mongoose debug mode
mongoose.set('debug', true);

// This will log all MongoDB queries
// [Mongoose] users.aggregate([ ... ])
```

### Debug Atlas Search Pipelines

```typescript
// Log the pipeline before executing
console.log('[Pipeline]', JSON.stringify(pipeline, null, 2));

const results = await atlasClient.executeSearch('users', pipeline);
console.log('[Results]', JSON.stringify(results, null, 2));
```

### Debug Cache Keys

```typescript
const cacheKey = generateSearchKey('people', query, filters, page, pageSize);
console.log('[Cache Key]', cacheKey);

// Check if key exists in Redis
const exists = await redis.exists(cacheKey);
console.log('[Cache Exists]', exists);

// Get cached value
const value = await redis.get(cacheKey);
console.log('[Cache Value]', value);
```

### Common Debugging Commands

```bash
# Watch service logs in real-time
npm run dev | grep ERROR

# Test specific pipeline in MongoDB shell
mongosh "mongodb+srv://..."
use netsa
db.users.aggregate([
  { $search: { ... } },
  { $limit: 5 }
])

# Monitor Redis
redis-cli MONITOR

# Check service memory usage
node --inspect dist/server.js
# Open chrome://inspect
```

---

## Contributing

### Code Style

- **Use Prettier** for formatting (if configured)
- **Follow existing patterns** in the codebase
- **Add comments** for complex logic
- **Use TypeScript types** everywhere

### Pull Request Checklist

- [ ] Code follows existing patterns
- [ ] TypeScript compiles without errors (`npm run build`)
- [ ] Service starts successfully (`npm run dev`)
- [ ] Tested manually with cURL/Postman
- [ ] No console.logs (use proper logging)
- [ ] Added/updated comments
- [ ] Updated documentation if needed

### File Naming Conventions

- **Module files**: `{vertical}.{purpose}.ts` (e.g., `people.search.ts`)
- **Config files**: `{config-type}.ts` (e.g., `mongo.ts`, `redis.ts`)
- **DTOs**: `{name}.dto.ts` (e.g., `search-response.dto.ts`)
- **Utilities**: `{name}.util.ts` (e.g., `hash.util.ts`)

---

## Quick Reference

### Service Structure

```
src/
├── app.ts                  # Express app setup
├── server.ts               # Server startup
├── config/                 # Configuration files
│   ├── env.ts
│   ├── mongo.ts
│   ├── redis.ts
│   └── search.ts
├── modules/
│   ├── search/             # Main search orchestration
│   ├── people/             # People search vertical
│   ├── gigs/               # Gigs search vertical
│   ├── events/             # Events search vertical
│   └── enrichment/         # Document enrichment
├── infra/
│   └── search/
│       ├── atlas.client.ts # Atlas Search wrapper
│       └── pipelines/      # Pipeline builders
├── ranking/                # Ranking & scoring logic
├── cache/                  # Caching layer
├── permissions/            # Visibility rules
├── types/                  # TypeScript types
└── utils/                  # Utility functions
```

### Key Files

| File | Purpose |
|------|---------|
| `src/app.ts` | Express app & middleware |
| `src/server.ts` | Entry point, DB connections |
| `src/modules/search/search.routes.ts` | API route definitions |
| `src/modules/search/search.controller.ts` | Request handlers |
| `src/modules/search/search.service.ts` | Business logic orchestration |
| `src/infra/search/atlas.client.ts` | MongoDB Atlas Search client |
| `src/cache/cache.service.ts` | Redis caching service |

---

## Helpful Resources

- **MongoDB Atlas Search Docs**: https://www.mongodb.com/docs/atlas/atlas-search/
- **Mongoose Docs**: https://mongoosejs.com/docs/
- **ioredis Docs**: https://github.com/redis/ioredis
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/

---

**Document Index:** [08] Development Guide  
**Previous:** [07-deployment.md](./07-deployment.md)

---

🎉 **Documentation Complete!** You've reached the end of the Search Service documentation. For questions or contributions, refer to the team.

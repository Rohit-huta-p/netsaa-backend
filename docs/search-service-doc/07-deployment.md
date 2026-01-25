# Deployment Guide

> **Document Index:** [07] Deployment  
> **Previous:** [06-configuration.md](./06-configuration.md) | **Next:** [08-development-guide.md](./08-development-guide.md)

---

## Table of Contents

1. [Deployment Overview](#deployment-overview)
2. [Prerequisites](#prerequisites)
3. [Building for Production](#building-for-production)
4. [Docker Deployment](#docker-deployment)
5. [Environment Configuration](#environment-configuration)
6. [Production Checklist](#production-checklist)
7. [Monitoring](#monitoring)
8. [Troubleshooting](#troubleshooting)

---

## Deployment Overview

### Deployment Architecture

```mermaid
graph TB
    LB[Load Balancer]
    
    subgraph "Service Cluster"
        S1[Search Service Instance 1]
        S2[Search Service Instance 2]
        S3[Search Service Instance 3]
    end
    
    MongoDB[(MongoDB Atlas)]
    Redis[(Redis Cluster)]
    
    LB --> S1
    LB --> S2
    LB --> S3
    
    S1 --> MongoDB
    S2 --> MongoDB
    S3 --> MongoDB
    
    S1 --> Redis
    S2 --> Redis
    S3 --> Redis
```

### Deployment Requirements

| Component | Requirement | Recommended |
|-----------|-------------|-------------|
| **Node.js** | v16+ | v18 LTS |
| **RAM** | 512MB minimum | 1GB+ |
| **CPU** | 0.5 vCPU | 1 vCPU+ |
| **Disk** | 1GB | 5GB+ |
| **MongoDB Atlas** | M10+ cluster | M30+ for production |
| **Redis** | Optional | Recommended for production |

---

## Prerequisites

### 1. MongoDB Atlas Setup

**Create Atlas Cluster:**
1. Sign up at https://cloud.mongodb.com
2. Create new cluster (M10 or higher for production)
3. Configure network access (whitelist IPs)
4. Create database user with read/write permissions
5. Get connection string

**Create Search Indexes:**
- Follow [06-configuration.md](./06-configuration.md) to create:
  - `people_search_index` on `users` collection
  - `gigs_search_index` on `gigs` collection
  - `events_search_index` on `events` collection

### 2. Redis Setup (Optional but Recommended)

**Option A: Redis Cloud**
- Sign up at https://redis.com/try-free
- Create database
- Get connection URL

**Option B: AWS ElastiCache**
- Create Redis cluster
- Configure security groups
- Get endpoint URL

**Option C: Self-hosted**
- Install Redis on server
- Configure persistence
- Set up TLS (recommended)

---

## Building for Production

### 1. Install Dependencies

```bash
cd search-service
npm install --production
```

### 2. Build TypeScript

```bash
npm run build
```

**Output:**
```
search-service/
├── dist/              # Compiled JavaScript
│   ├── app.js
│   ├── server.js
│   └── ...
└── node_modules/
```

### 3. Test Build

```bash
# Test the production build locally
NODE_ENV=production node dist/server.js
```

---

## Docker Deployment

### Dockerfile

**Location:** `DockerFile` (root of service)

```dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Remove src and dev dependencies (optional cleanup)
RUN rm -rf src tsconfig.json

# Expose port
EXPOSE 5003

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5003/search/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1);})"

# Start server
CMD ["node", "dist/server.js"]
```

### Build Docker Image

```bash
docker build -t netsa/search-service:1.0.0 .
```

### Run Docker Container

```bash
docker run -d \
  --name search-service \
  -p 5003:5003 \
  -e MONGO_URI="mongodb+srv://..." \
  -e REDIS_URL="redis://..." \
  -e NODE_ENV=production \
  --restart unless-stopped \
  netsa/search-service:1.0.0
```

### Docker Compose

**File:** `docker-compose.yml`

```yaml
version: '3.8'

services:
  search-service:
    build: .
    container_name: search-service
    restart: unless-stopped
    ports:
      - "5003:5003"
    environment:
      - PORT=5003
      - NODE_ENV=production
      - MONGO_URI=${MONGO_URI}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:5003/search/health')"]
      interval: 30s
      timeout: 3s
      retries: 3

  redis:
    image: redis:7-alpine
    container_name: search-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

**Run with Docker Compose:**
```bash
docker-compose up -d
```

---

## Environment Configuration

### Production Environment Variables

**Create `.env.production`:**

```env
# Server
PORT=5003
NODE_ENV=production

# MongoDB Atlas (Production)
MONGO_URI=mongodb+srv://prod_user:strong_password@prod-cluster.mongodb.net/netsa?retryWrites=true&w=majority

# Redis (Production)
REDIS_URL=redis://prod-redis.abc123.cloud.redislabs.com:12345

# Service Metadata
SERVICE_NAME=search-service
SERVICE_VERSION=1.0.0
LOG_LEVEL=info
```

### Security Best Practices

**1. Use Environment Variables (DO NOT hardcode secrets)**

```bash
# Good ✅
MONGO_URI=${MONGO_URI}

# BAD ❌
MONGO_URI=mongodb+srv://user:password@...
```

**2. Use Secret Management**

**AWS Secrets Manager:**
```javascript
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({ region: "us-east-1" });
const response = await client.send(new GetSecretValueCommand({ SecretId: "prod/search-service" }));
const secrets = JSON.parse(response.SecretString);
```

**3. Rotate Credentials Regularly**
- MongoDB passwords: Every 90 days
- API keys: Every 180 days

---

## Production Checklist

### Pre-Deployment

- [ ] **Environment Variables Set**
  - [ ] `MONGO_URI` configured
  - [ ] `REDIS_URL` configured (if using cache)
  - [ ] `NODE_ENV=production`
  
- [ ] **Atlas Search Indexes Created**
  - [ ] `people_search_index` verified
  - [ ] `gigs_search_index` verified
  - [ ] `events_search_index` verified
  
- [ ] **Dependencies Installed**
  - [ ] `npm ci --production` executed
  - [ ] No dev dependencies in production
  
- [ ] **Build Successful**
  - [ ] TypeScript compiled (`npm run build`)
  - [ ] `dist/` directory exists
  
- [ ] **Security Hardened**
  - [ ] Secrets in env vars (not hardcoded)
  - [ ] CORS configured for production origins
  - [ ] Helmet middleware enabled

### Post-Deployment

- [ ] **Health Check Passing**
  - [ ] `GET /search/health` returns 200
  - [ ] MongoDB connection successful
  - [ ] Redis connection successful (if enabled)
  
- [ ] **Smoke Tests**
  - [ ] `GET /search/preview?q=test` returns results
  - [ ] `GET /search/people?q=test` returns results
  - [ ] `GET /search/gigs?q=test` returns results
  - [ ] `GET /search/events?q=test` returns results
  
- [ ] **Performance Validated**
  - [ ] P95 latency < 250ms
  - [ ] No memory leaks
  - [ ] CPU usage < 70%
  
- [ ] **Monitoring Configured**
  - [ ] Logs being collected
  - [ ] Metrics being tracked
  - [ ] Alerts configured

---

## Monitoring

### Recommended Metrics

#### Application Metrics

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| **Request Latency (P95)** | < 250ms | > 500ms |
| **Request Latency (P99)** | < 500ms | > 1000ms |
| **Error Rate** | < 0.1% | > 1% |
| **Requests/min** | - | > baseline + 50% |
| **Cache Hit Rate** | > 70% | < 50% |

#### System Metrics

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| **CPU Usage** | < 70% | > 85% |
| **Memory Usage** | < 80% | > 90% |
| **Disk Usage** | < 70% | > 85% |

#### Database Metrics (Atlas)

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| **Connection Count** | < 50 | > 80 |
| **Query P95 Latency** | < 100ms | > 200ms |
| **Index Efficiency** | > 95% | < 90% |

### Logging

**Log Levels:**
```typescript
// Production: info, warn, error
// Development: debug, info, warn, error

const logger = {
  error: (msg, meta?) => console.error(JSON.stringify({ level: 'error', msg, meta, timestamp: new Date() })),
  warn: (msg, meta?) => console.warn(JSON.stringify({ level: 'warn', msg, meta, timestamp: new Date() })),
  info: (msg, meta?) => console.log(JSON.stringify({ level: 'info', msg, meta, timestamp: new Date() })),
};
```

**Important Logs to Track:**
- Search query execution time
- Cache hit/miss events
- Database connection errors
- Atlas Search errors
- Enrichment failures

### Health Check Endpoint

```typescript
app.get('/search/health/detailed', async (req, res) => {
  const checks = {
    mongodb: await checkMongoDB(),
    redis: await checkRedis(),
    atlasSearch: await checkAtlasSearch()
  };
  
  const healthy = Object.values(checks).every(c => c === 'healthy');
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString()
  });
});
```

---

## Troubleshooting

### Common Issues

#### 1. **Service Failing to Start**

**Symptom:** Container/process exits immediately

**Check:**
```bash
# View logs
docker logs search-service

# Common causes:
# - MONGO_URI not set
# - Invalid connection string
# - Port already in use
```

**Solution:**
```bash
# Verify environment variables
docker exec search-service env | grep MONGO

# Check port availability
lsof -i :5003
```

#### 2. **High Latency**

**Symptom:** P95 > 500ms

**Diagnose:**
```bash
# Check cache hit rate
redis-cli INFO stats | grep keyspace_hits

# Check MongoDB connection pool
# (via Atlas UI → Metrics → Connections)

# Check service CPU/Memory
docker stats search-service
```

**Solutions:**
- Enable Redis caching
- Increase MongoDB connection pool
- Scale horizontally (add instances)
- Optimize Atlas Search indexes

#### 3. **Cache Not Working**

**Symptom:** All requests showing cache miss

**Check:**
```bash
# Verify Redis connection
redis-cli PING

# Check cache service code
# Ensure cache.service.ts is uncommented
```

**Solution:**
```typescript
// In src/cache/cache.service.ts
// Uncomment the implementation:
get: async <T>(key: string) => {
  const data = await cacheClient.get(key);
  return data ? JSON.parse(data) : null;
}
```

#### 4. **Atlas Search Not Returning Results**

**Symptom:** `results: [], total: 0` for valid queries

**Check:**
1. **Indexes exist** (Atlas UI → Search tab)
2. **Index is building** (wait 1-5 minutes)
3. **Index name matches config** (`people_search_index`, etc.)
4. **Collection has data**

**Solution:**
```javascript
// Test directly via MongoDB shell
db.users.aggregate([
  {
    $search: {
      index: "people_search_index",
      text: { query: "dancer", path: "artistType" }
    }
  },
  { $limit: 5 }
])
```

#### 5. **Memory Leaks**

**Symptom:** Memory usage grows continuously

**Diagnose:**
```bash
# Monitor memory over time
docker stats search-service

# Use Node.js memory profiler
node --inspect dist/server.js
# Then use Chrome DevTools → Memory tab
```

**Common Causes:**
- Event listeners not cleaned up
- Large cache values
- MongoDB cursors not closed

---

## Scaling

### Horizontal Scaling

**Deploy multiple instances behind load balancer:**

```bash
# Instance 1
docker run -d -p 5003:5003 --name search-1 netsa/search-service

# Instance 2
docker run -d -p 5004:5003 --name search-2 netsa/search-service

# Instance 3
docker run -d -p 5005:5003 --name search-3 netsa/search-service
```

**Load Balancer Config (nginx):**
```nginx
upstream search-service {
  server localhost:5003;
  server localhost:5004;
  server localhost:5005;
}

server {
  listen 80;
  
  location /search {
    proxy_pass http://search-service;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

### Auto-Scaling

**Kubernetes (example):**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: search-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: search-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

---

**Document Index:** [07] Deployment  
**Previous:** [06-configuration.md](./06-configuration.md) | **Next:** [08-development-guide.md](./08-development-guide.md)

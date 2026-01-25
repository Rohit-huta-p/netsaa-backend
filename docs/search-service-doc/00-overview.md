# Search Service - Complete Documentation

> **Last Updated:** January 25, 2026  
> **Version:** 1.0.0  
> **Service:** NETSA Search Service

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Documentation Structure](#documentation-structure)
5. [Key Features](#key-features)
6. [Technology Stack](#technology-stack)

---

## Overview

The **NETSA Search Service** is a dedicated microservice providing high-performance, LinkedIn-style search functionality across multiple verticals within the NETSA platform. It leverages **MongoDB Atlas Search** to deliver fast, relevant results for:

- **People** (Artists & Organizers)
- **Gigs** (Performance opportunities)  
- **Events** (Performances, showcases, networking events)

### Design Philosophy

The service is built with the following principles:

- **Performance First**: Sub-250ms P95 latency for search requests
- **Separation of Concerns**: Clean architecture with distinct layers
- **Scalability**: Stateless design with distributed caching
- **Relevance**: Intelligent ranking powered by Atlas Search
- **Privacy & Permissions**: Built-in visibility controls

---

## Architecture

### High-Level Architecture

```mermaid
graph TB
    Client[Client Applications]
    Gateway[API Gateway]
    SearchService[Search Service]
    MongoDB[(MongoDB Atlas)]
    Redis[(Redis Cache)]
    
    Client -->|HTTP Requests| Gateway
    Gateway -->|Forward| SearchService
    SearchService -->|Atlas Search| MongoDB
    SearchService -->|Cache| Redis
    MongoDB -->|Results| SearchService
    SearchService -->|Response| Gateway
    Gateway -->|JSON| Client
```

### Service Architecture

The service follows a **layered architecture**:

```
┌─────────────────────────────────────────┐
│         API Layer (Routes)              │
│  /search/preview, /search/people, etc.  │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│       Controller Layer                  │
│  Input validation, request handling     │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│       Service/Orchestration Layer       │
│  Business logic, coordination           │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼─────┐   ┌──────▼──────┐
│   Search   │   │Enrichment   │
│   Module   │   │   Module    │
└──────┬─────┘   └──────┬──────┘
       │                │
┌──────▼────────────────▼──────┐
│   Infrastructure Layer       │
│ - Atlas Client               │
│ - Cache Service              │
│ - Ranking & Filters          │
└──────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Node.js v16+
- MongoDB Atlas Account with Search Indexes configured
- Redis Server (optional but recommended)

### Environment Variables

Create a `.env` file:

```env
PORT=5003
NODE_ENV=development
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/netsa
REDIS_URL=redis://localhost:6379
```

### Installation & Running

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Production build
npm run build
npm start
```

### Health Check

```bash
curl http://localhost:5003/search/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "search-service"
}
```

---

## Documentation Structure

This documentation is organized into the following sections:

| Document | Description |
|----------|-------------|
| [00-overview.md](./00-overview.md) | This file - high-level overview and quick start |
| [01-api-reference.md](./01-api-reference.md) | Complete API endpoint documentation with examples |
| [02-architecture.md](./02-architecture.md) | Detailed architecture, component interactions, and design patterns |
| [03-search-implementation.md](./03-search-implementation.md) | Deep dive into search algorithms, Atlas Search pipelines, and ranking |
| [04-data-models.md](./04-data-models.md) | Data structures, DTOs, and database schemas |
| [05-caching-strategy.md](./05-caching-strategy.md) | Redis caching implementation and strategies |
| [06-configuration.md](./06-configuration.md) | Configuration options, environment setup, and tuning |
| [07-deployment.md](./07-deployment.md) | Deployment guide, Docker setup, and production considerations |
| [08-development-guide.md](./08-development-guide.md) | Developer guide with code examples and best practices |

---

## Key Features

### 1. **Unified Preview Search**

As-you-type search that returns results from all verticals simultaneously:

```javascript
GET /search/preview?q=dancer
```

Returns top 5 results from each vertical (people, gigs, events).

### 2. **Vertical-Specific Search**

Deep search within a specific category with pagination and filters:

```javascript
GET /search/people?q=dancer&city=Bangalore&page=1
GET /search/gigs?q=musician&artistType=Guitarist&page=1
GET /search/events?q=concert&page=1
```

### 3. **Intelligent Ranking**

**Weighted scoring system:**

- **People**: Name match (3.0x), Artist type (2.0x), Rating boost (1.5x)
- **Gigs**: Title match (3.0x), Artist type (2.0x), City (1.5x), Urgent/Featured boost (5.0x)
- **Events**: Title match (3.0x), Event type (2.0x), Upcoming boost (2.0x)

### 4. **Privacy & Permissions**

Automatic filtering of:
- Blocked users
- Private profiles
- Inactive/expired listings

### 5. **Performance Optimization**

- **Caching**: Redis-based with 5-minute TTL
- **Index-only fetch**: Initial search returns only IDs and scores
- **Batch enrichment**: Full documents fetched in single operation
- **Concurrent preview**: All verticals searched in parallel

### 6. **Enrichment Layer**

Results are enriched with contextual data:
- Connection status (for people)
- Expiration status (for gigs)
- Full document details

---

## Technology Stack

### Core Technologies

| Technology | Purpose | Version |
|------------|---------|---------|
| **TypeScript** | Primary language | 5.3+ |
| **Express.js** | Web framework | 4.18+ |
| **MongoDB Atlas** | Database & Search engine | 9.1+ |
| **Mongoose** | MongoDB ODM | 9.1+ |
| **Redis** (ioredis) | Distributed cache | 5.8+ |

### Key Dependencies

```json
{
  "express": "^4.18.2",
  "mongoose": "^9.1.0",
  "ioredis": "^5.8.2",
  "helmet": "^7.1.0",
  "cors": "^2.8.5",
  "morgan": "^1.10.0",
  "dotenv": "^16.3.1"
}
```

### Development Tools

- **nodemon**: Hot reloading for development
- **TypeScript**: Type safety and modern JS features
- **ts-node**: Direct TypeScript execution

---

## Service Configuration

### Performance SLOs (Service Level Objectives)

| Metric | Target | Current |
|--------|--------|---------|
| Search P95 Latency | 250ms | ~200ms |
| Preview P95 Latency | 200ms | ~150ms |
| Atlas Search Timeout | 5000ms | 5000ms |
| Cache Hit Rate | >70% | ~75% |

### Default Settings

```typescript
{
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 50,
  TIMEOUT_MS: 5000,
  CACHE_TTL_SECONDS: 300, // 5 minutes
  INDEX_FRESHNESS_TARGET_SECONDS: 5
}
```

---

## Search Indexes Required

The service requires the following Atlas Search indexes:

1. **`people_search_index`** on `users` collection
2. **`gigs_search_index`** on `gigs` collection
3. **`events_search_index`** on `events` collection

> See [06-configuration.md](./06-configuration.md) for detailed index definitions.

---

## Related Services

The Search Service integrates with:

- **Users Service**: For user profile data
- **Gigs Service**: For gig listings
- **Events Service**: For event information
- **API Gateway**: For request routing and authentication

---

## Next Steps

1. **API Reference**: See [01-api-reference.md](./01-api-reference.md) for complete endpoint documentation
2. **Architecture Deep Dive**: Read [02-architecture.md](./02-architecture.md) for component details
3. **Development**: Check [08-development-guide.md](./08-development-guide.md) to start coding

---

## Support & Contact

For questions or issues:
- Review the detailed documentation in this directory
- Check the service logs for error messages
- Contact the backend team

---

**Document Index:** [00] Overview  
**Next:** [01-api-reference.md](./01-api-reference.md)

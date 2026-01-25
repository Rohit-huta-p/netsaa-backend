# Search Service Documentation - README

## Overview

This directory contains **comprehensive, production-ready documentation** for the NETSA Search Service. The documentation is organized into 9 detailed guides covering every aspect of the service from architecture to deployment.

---

## Documentation Index

| # | Document | Description | Key Topics |
|---|----------|-------------|------------|
| **00** | [overview.md](./00-overview.md) | High-level introduction and quick start | Architecture diagrams, tech stack, key features |
| **01** | [api-reference.md](./01-api-reference.md) | Complete API endpoint documentation | Request/response formats, examples, error handling |
| **02** | [architecture.md](./02-architecture.md) | System architecture deep dive | Layered architecture, components, data flow |
| **03** | [search-implementation.md](./03-search-implementation.md) | Atlas Search implementation details | Index configuration, query construction, ranking |
| **04** | [data-models.md](./04-data-models.md) | Data structures and schemas | DTOs, database schemas, mappers |
| **05** | [caching-strategy.md](./05-caching-strategy.md) | Redis caching implementation | Cache keys, invalidation, performance metrics |
| **06** | [configuration.md](./06-configuration.md) | Service configuration guide | Environment setup, index creation, tuning |
| **07** | [deployment.md](./07-deployment.md) | Production deployment guide | Docker, environment config, monitoring |
| **08** | [development-guide.md](./08-development-guide.md) | Developer guide with examples | Local setup, code examples, best practices |

---

## Quick Start

1. **For API Users**: Start with [01-api-reference.md](./01-api-reference.md)
2. **For Developers**: Read [08-development-guide.md](./08-development-guide.md)
3. **For DevOps**: Check [07-deployment.md](./07-deployment.md)
4. **For Architects**: Review [02-architecture.md](./02-architecture.md)

---

## Service Overview

The Search Service provides **LinkedIn-style search functionality** across three verticals:

### Endpoints

- **`GET /search/preview`** - Unified preview (as-you-type search)
- **`GET /search/people`** - Search artists & organizers
- **`GET /search/gigs`** - Search performance opportunities
- **`GET /search/events`** - Search events & festivals

### Key Features

✅ **Real-time Atlas Search** - MongoDB Atlas Search with BM25 ranking  
✅ **Intelligent Ranking** - Configurable boost weights for relevance  
✅ **Redis Caching** - 5-minute TTL for performance optimization  
✅ **Personalization** - User-specific result exclusions  
✅ **Privacy Controls** - Automatic filtering of blocked/private content  
✅ **Pagination** - Efficient page-by-page result loading  

---

## Architecture Highlights

### Core Technologies

- **Node.js + TypeScript** - Type-safe backend
- **Express.js** - REST API framework
- **MongoDB Atlas** - Database + Atlas Search
- **Redis** - Distributed caching (optional)
- **Mongoose** - MongoDB ODM

### Performance

| Metric | Target | Typical |
|--------|--------|---------|
| **Search Latency (P95)** | < 250ms | ~180ms |
| **Preview Latency (P95)** | < 200ms | ~150ms |
| **Cache Hit Rate** | > 70% | ~75% |

### Layered Architecture

```
API Layer (Routes)
    ↓
Controller Layer
    ↓
Service/Orchestration Layer
    ↓
Search Modules ← → Enrichment Modules
    ↓
Infrastructure (Atlas Client, Cache, DB)
```

---

## Atlas Search Indexes

The service requires **3 Atlas Search indexes** to be configured:

1. **`people_search_index`** on `users` collection
2. **`gigs_search_index`** on `gigs` collection  
3. **`events_search_index`** on `events` collection

> See [06-configuration.md](./06-configuration.md) for complete index definitions

---

## Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with MongoDB and Redis URLs

# 3. Start development server
npm run dev

# 4. Test
curl http://localhost:5003/search/health
```

---

## Documentation Features

### What Makes This Documentation Complete?

✅ **9 comprehensive guides** covering every aspect  
✅ **Mermaid diagrams** for visual architecture  
✅ **Code examples** for common scenarios  
✅ **API examples** with cURL and JavaScript  
✅ **Configuration snippets** ready to copy-paste  
✅ **Troubleshooting guides** for common issues  
✅ **Best practices** from production experience  
✅ **Performance metrics** and tuning tips  

### Navigation

Each document includes:
- **Table of Contents** for quick navigation
- **Previous/Next links** for sequential reading
- **Document Index** showing current position
- **Code examples** with syntax highlighting
- **Cross-references** to related sections

---

## Use Cases

### For New Developers

1. Read [00-overview.md](./00-overview.md) for context
2. Follow [08-development-guide.md](./08-development-guide.md) to set up locally
3. Reference [01-api-reference.md](./01-api-reference.md) for API details

### For Features/Enhancements

1. Review [02-architecture.md](./02-architecture.md) to understand structure
2. Check [03-search-implementation.md](./03-search-implementation.md) for search logic
3. See [08-development-guide.md](./08-development-guide.md) → "Common Patterns"

### For Production Deployment

1. Read [07-deployment.md](./07-deployment.md) for deployment steps
2. Configure environment per [06-configuration.md](./06-configuration.md)
3. Set up monitoring from [07-deployment.md](./07-deployment.md) → "Monitoring"

### For Performance Tuning

1. Review [05-caching-strategy.md](./05-caching-strategy.md) for caching
2. Check [03-search-implementation.md](./03-search-implementation.md) → "Performance Optimization"
3. Adjust weights in [06-configuration.md](./06-configuration.md)

---

## Contributing to Documentation

### Updating Documentation

1. **Identify the relevant document** from the index above
2. **Make changes** following the existing format
3. **Update cross-references** if adding new sections
4. **Test code examples** to ensure they work
5. **Update this README** if adding new documents

### Documentation Standards

- Use **Mermaid** for diagrams
- Include **code examples** with comments
- Add **tables** for comparison/reference
- Use **alerts** (> **Note:**) for important info
- Keep **line length < 120** characters
- Use **markdown formatting** consistently

---

## Related Documentation

- **Users Service**: `../users-service-doc/`
- **Gigs Service**: `../gigs-service-doc/`
- **Events Service**: `../events-service-doc/`
- **API Gateway**: `../api-gateway-doc/`

---

## Support

For questions or issues:

1. **Search this documentation** - Use Cmd/Ctrl+F
2. **Check troubleshooting** - [07-deployment.md](./07-deployment.md) → "Troubleshooting"
3. **Review examples** - [08-development-guide.md](./08-development-guide.md) → "Code Examples"
4. **Contact the team** - Backend development team

---

## Document Statistics

- **Total Documents**: 9 core guides + 1 README
- **Total Pages**: ~150+ pages (if printed)
- **Code Examples**: 100+
- **Diagrams**: 10+ Mermaid diagrams
- **Topics Covered**: 80+

---

**Last Updated**: January 25, 2026  
**Version**: 1.0.0  
**Status**: ✅ Complete & Production-Ready

# API Reference

> **Document Index:** [01] API Reference  
> **Previous:** [00-overview.md](./00-overview.md) | **Next:** [02-architecture.md](./02-architecture.md)

---

## Table of Contents

1. [Base URL](#base-url)
2. [Authentication](#authentication)
3. [Endpoints Overview](#endpoints-overview)
4. [Preview Search](#preview-search)
5. [People Search](#people-search)
6. [Gigs Search](#gigs-search)
7. [Events Search](#events-search)
8. [Response Formats](#response-formats)
9. [Error Handling](#error-handling)
10. [Rate Limiting](#rate-limiting)

---

## Base URL

```
Development: http://localhost:5003
Production: https://api.netsaa.com/search
```

All endpoints are prefixed with `/search`.

---

## Authentication

The search service expects authentication headers passed from the API Gateway:

```http
X-User-Id: <user-id>
Authorization: Bearer <token>
```

> **Note**: These headers are typically set by the upstream API Gateway. Direct calls to the service should include `X-User-Id` for personalized results (e.g., excluding current user from people search).

---

## Endpoints Overview

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|--------------|
| `/search/health` | GET | Health check | No |
| `/search/preview` | GET | Unified preview search | Optional |
| `/search/people` | GET | Search people (artists/organizers) | Optional |
| `/search/gigs` | GET | Search gigs | Optional |
| `/search/events` | GET | Search events | Optional |

---

## Preview Search

### Endpoint

```
GET /search/preview
```

### Description

Returns a **unified preview** of search results across all three verticals (People, Gigs, Events). This is the "as-you-type" search experience, similar to LinkedIn's top search bar. Returns top 5 results from each vertical.

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Search query string |

### Example Request

```bash
curl "http://localhost:5003/search/preview?q=dancer"
```

### Example Response

```json
{
  "people": [
    {
      "id": "65f123abc456def789012345",
      "type": "people",
      "title": "Priya Sharma",
      "subtitle": "Classical Dancer • Bangalore",
      "image": "https://cdn.netsaa.com/profiles/priya.jpg",
      "score": 4.5,
      "metadata": {
        "username": "priya_dancer",
        "rating": 4.8,
        "verified": true
      }
    }
    // ... up to 5 people results
  ],
  "gigs": [
    {
      "id": "65f234bcd567efg890123456",
      "type": "gig",
      "title": "Classical Dancer needed for Wedding",
      "subtitle": "Bangalore • Dancer",
      "image": "https://cdn.netsaa.com/gigs/wedding.jpg",
      "score": 4.2,
      "metadata": {
        "compensation": "₹8000",
        "date": "2026-02-15T10:00:00Z",
        "expiresAt": "2026-02-10T00:00:00Z"
      }
    }
    // ... up to 5 gigs results
  ],
  "events": [
    {
      "id": "65f345cde678fgh901234567",
      "type": "event",
      "title": "Classical Dance Festival 2026",
      "subtitle": "Cultural Event • Bangalore",
      "image": "https://cdn.netsaa.com/events/festival.jpg",
      "score": 4.0,
      "metadata": {
        "startDate": "2026-03-20T09:00:00Z",
        "endDate": "2026-03-22T18:00:00Z",
        "venue": "Palace Grounds"
      }
    }
    // ... up to 5 events results
  ]
}
```

### Performance

- **Target Latency**: P95 < 200ms
- **Concurrent Execution**: All three searches run in parallel
- **Caching**: Not typically cached due to personalization

---

## People Search

### Endpoint

```
GET /search/people
```

### Description

Searches for people (artists and organizers) with pagination, filtering, and personalized exclusions.

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | Yes | - | Search query |
| `page` | number | No | `1` | Page number (1-indexed) |
| `artistType` | string | No | - | Filter by artist type (e.g., "Dancer", "Musician") |
| `city` | string | No | - | Filter by city |
| `rating` | number | No | - | Minimum rating (0-5) |

### Request Headers

| Header | Type | Description |
|--------|------|-------------|
| `X-User-Id` | string | Current user ID (for excluding from results) |

### Example Request

```bash
curl "http://localhost:5003/search/people?q=guitarist&city=Mumbai&page=1" \
  -H "X-User-Id: 65f123abc456def789012345"
```

### Example Response

```json
{
  "results": [
    {
      "id": "65f456def789ghi012345678",
      "type": "people",
      "title": "Rahul Mehta",
      "subtitle": "Guitarist • Mumbai",
      "image": "https://cdn.netsaa.com/profiles/rahul.jpg",
      "score": 5.2,
      "metadata": {
        "username": "rahul_guitar",
        "rating": 4.9,
        "verified": true
      }
    }
    // ... more results
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "total": 47
  }
}
```

### Ranking Weights

- **Name Match**: 3.0x boost (using autocomplete/edgegram)
- **Artist Type Match**: 2.0x boost
- **Rating Boost**: 1.5x for ratings ≥ 4.0
- **Featured Boost**: 5.0x for featured profiles

### Filters Applied Automatically

- Excludes blocked users
- Excludes current user (if `X-User-Id` provided)
- Only active/verified profiles

---

## Gigs Search

### Endpoint

```
GET /search/gigs
```

### Description

Searches for gig opportunities with filtering and boosting for urgent/featured gigs.

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | Yes | - | Search query |
| `page` | number | No | `1` | Page number (1-indexed) |
| `city` | string | No | - | Filter by city |
| `artistType` | string | No | - | Filter by required artist type |

### Example Request

```bash
curl "http://localhost:5003/search/gigs?q=musician&artistType=Guitarist&page=1"
```

### Example Response

```json
{
  "results": [
    {
      "id": "65f567efg890hij123456789",
      "type": "gig",
      "title": "Lead Guitarist for Rock Concert",
      "subtitle": "Mumbai • Guitarist",
      "image": "https://cdn.netsaa.com/gigs/concert.jpg",
      "score": 6.8,
      "metadata": {
        "compensation": "₹15000",
        "date": "2026-02-28T19:00:00Z",
        "expiresAt": "2026-02-20T00:00:00Z"
      }
    }
    // ... more results
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "total": 23
  }
}
```

### Ranking Weights

- **Title Match**: 3.0x boost
- **Artist Type Match**: 2.0x boost
- **City Match**: 1.5x boost
- **Urgent Gigs**: 5.0x boost
- **Featured Gigs**: 5.0x boost

### Filters Applied Automatically

- Only published gigs
- Non-expired gigs
- Visible to public

---

## Events Search

### Endpoint

```
GET /search/events
```

### Description

Searches for events (performances, showcases, festivals) with recency boosting.

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | Yes | - | Search query |
| `page` | number | No | `1` | Page number (1-indexed) |

### Example Request

```bash
curl "http://localhost:5003/search/events?q=classical+music&page=1"
```

### Example Response

```json
{
  "results": [
    {
      "id": "65f678fgh901ijk234567890",
      "type": "event",
      "title": "Classical Music Evening",
      "subtitle": "Concert • Delhi",
      "image": "https://cdn.netsaa.com/events/classical.jpg",
      "score": 4.5,
      "metadata": {
        "startDate": "2026-02-10T18:00:00Z",
        "endDate": "2026-02-10T21:00:00Z",
        "venue": "India Habitat Centre"
      }
    }
    // ... more results
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "total": 15
  }
}
```

### Ranking Weights

- **Title Match**: 3.0x boost
- **Event Type Match**: 2.0x boost
- **Upcoming Events**: 2.0x boost (using temporal "near" scoring with 7-day pivot)

### Filters Applied Automatically

- Only published events
- Future events (not past)
- Public visibility

---

## Response Formats

### Success Response Structure

All search endpoints return a consistent structure:

```typescript
{
  results: SearchResultItemDTO[];  // Array of results
  meta: {
    page: number;                   // Current page
    pageSize: number;               // Results per page
    total: number;                  // Total matching results
  }
}
```

### SearchResultItemDTO

```typescript
{
  id: string;              // Document ID
  type: 'people' | 'gig' | 'event';  // Result type
  title: string;           // Primary display text
  subtitle: string;        // Secondary context (e.g., "Dancer • Bangalore")
  image: string;           // Thumbnail/profile picture URL
  score: number;           // Relevance score from Atlas Search
  metadata: {              // Type-specific metadata
    [key: string]: any;
  }
}
```

---

## Error Handling

### Error Response Format

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

### Common Error Codes

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `400` | Bad Request | Invalid query parameters |
| `404` | Not Found | Endpoint not found |
| `500` | Internal Server Error | Server-side error (logged) |
| `503` | Service Unavailable | Database or cache unavailable |

### Example Error Response

```json
{
  "error": "Internal Server Error",
  "message": "Database connection not established"
}
```

---

## Rate Limiting

> **Note**: Rate limiting is typically implemented at the API Gateway level.

### Recommended Limits

- **Preview Search**: 100 requests/minute per IP
- **Vertical Search**: 60 requests/minute per user
- **Burst Limit**: 10 requests/second

---

## Performance Characteristics

### Latency Targets (P95)

| Endpoint | Target | Typical |
|----------|--------|---------|
| `/search/preview` | 200ms | ~150ms |
| `/search/people` | 250ms | ~180ms |
| `/search/gigs` | 250ms | ~160ms |
| `/search/events` | 250ms | ~160ms |

### Caching Behavior

- **Cache Key**: MD5 hash of `index:query:filters:page:pageSize`
- **TTL**: 5 minutes (300 seconds)
- **Cache Hit Rate**: ~75% in production
- **Invalidation**: Automatic on TTL expiry

---

## Best Practices

### 1. Query Optimization

✅ **DO:**
```
?q=classical+dancer&city=Bangalore
```

❌ **DON'T:**
```
?q=&city=Bangalore  // Empty query
?q=a                 // Too short (< 2 chars)
```

### 2. Pagination

Always use pagination for production:

```javascript
// Good
const fetchPage = (page) => 
  fetch(`/search/people?q=dancer&page=${page}`)

// Avoid
const fetchAll = () => 
  fetch(`/search/people?q=dancer&pageSize=1000`)  // Not supported
```

### 3. Debouncing Preview Search

For as-you-type functionality, debounce requests:

```javascript
const debouncedSearch = _.debounce((query) => {
  fetch(`/search/preview?q=${encodeURIComponent(query)}`)
}, 300); // 300ms delay
```

### 4. Error Handling

Always handle errors gracefully:

```javascript
try {
  const response = await fetch('/search/people?q=dancer');
  if (!response.ok) {
    const error = await response.json();
    console.error('Search failed:', error.message);
  }
  const data = await response.json();
  // Process results
} catch (error) {
  console.error('Network error:', error);
}
```

---

## Testing Examples

### cURL Examples

**Preview Search:**
```bash
curl -X GET "http://localhost:5003/search/preview?q=musician" \
  -H "Accept: application/json"
```

**People Search with Filters:**
```bash
curl -X GET "http://localhost:5003/search/people?q=dancer&city=Bangalore&rating=4" \
  -H "X-User-Id: 65f123abc456def789012345" \
  -H "Accept: application/json"
```

**Gigs Search:**
```bash
curl -X GET "http://localhost:5003/search/gigs?q=wedding&page=2" \
  -H "Accept: application/json"
```

### JavaScript/Fetch Examples

```javascript
// Preview Search
const previewSearch = async (query) => {
  const response = await fetch(
    `http://localhost:5003/search/preview?q=${encodeURIComponent(query)}`
  );
  return response.json();
};

// People Search with Pagination
const searchPeople = async (query, page = 1, filters = {}) => {
  const params = new URLSearchParams({
    q: query,
    page: page.toString(),
    ...filters
  });
  
  const response = await fetch(
    `http://localhost:5003/search/people?${params}`,
    {
      headers: {
        'X-User-Id': getCurrentUserId() // Your auth logic
      }
    }
  );
  
  return response.json();
};

// Usage
const results = await searchPeople('guitarist', 1, { city: 'Mumbai' });
console.log(`Found ${results.meta.total} guitarists in Mumbai`);
```

---

**Document Index:** [01] API Reference  
**Previous:** [00-overview.md](./00-overview.md) | **Next:** [02-architecture.md](./02-architecture.md)

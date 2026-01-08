# Folder Structure - Users Service

This document outlines the folder structure and organization of the `users-service`.

## Overview

The `users-service` follows a hybrid structure, combining **feature-based** organization (for complex features like connections and messaging) with **layer-based** organization (for core authentication and models).

## Directory Breakdown

### `src/`

The source code root directory.

#### `src/connections/`
Contains the logic for the social graph and messaging features. This directory uses a **feature-based** structure, grouping related files together.

- **Files**:
  - `*.controller.ts`: Request handlers for the feature.
  - `*.model.ts`: Database schemas/models specific to the feature.
  - `*.routes.ts`: Route definitions.
  - `*.service.ts`: Business logic implementation.
- **Sub-domains**:
  - **Connections**: Logic for user connections (friend requests, follows, etc.).
  - **Conversations**: Logic for chat threads/conversations.
  - **Messages**: Logic for individual messages within conversations.

#### `src/controllers/`
Contains general controllers, primarily for authentication.
- `auth.ts`: Authentication-related request handlers.

#### `src/models/`
Contains the core Mongoose models for the different user types.
- `User.ts`: Base user model.
- `Artist.ts`: Artist-specific fields/logic.
- `Organizer.ts`: Organizer-specific fields/logic.

#### `src/routes/`
Contains the main route definitions.
- `auth.ts`: Authentication routes.
- `connections.ts`: Entry point for connection-related routes (delegates to `src/connections`).

#### `src/middleware/`
Express middleware functions (e.g., authentication checks, error handling).

#### `src/config/`
Configuration files and environment variable setup.

#### `src/sockets/`
Socket.io handlers and logic for real-time features.

#### `src/types/`
TypeScript type definitions and interfaces used across the service.

#### Root Files
- `server.ts`: The entry point for the application. Initializes the Express app and server.
- `verify_models.ts`: Utility script for model verification.

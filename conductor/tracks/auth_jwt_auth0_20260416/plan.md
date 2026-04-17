# Implementation Plan: JWT and Auth0 Authentication

## Phase 1: Foundation & Infrastructure
- [x] Task: Install and configure authentication dependencies (bb600df)
    - [x] Add \`express-oauth2-jwt-bearer\` and \`jwks-rsa\` to package.json
    - [x] Define required Auth0 environment variables in \`.env.example\`
- [ ] Task: Conductor - User Manual Verification 'Foundation & Infrastructure' (Protocol in workflow.md)

## Phase 2: Auth Middleware Implementation (TDD)
- [ ] Task: Create JWT validation middleware
    - [ ] **Red:** Write tests to verify 401 response for missing/invalid tokens
    - [ ] **Green:** Implement middleware using \`auth()\` from express-oauth2-jwt-bearer
    - [ ] **Refactor:** Clean up middleware structure and error handling
- [ ] Task: Conductor - User Manual Verification 'Auth Middleware Implementation' (Protocol in workflow.md)

## Phase 3: User Synchronization & Identity Management (TDD)
- [ ] Task: Implement user synchronization service
    - [ ] **Red:** Write tests for \`upsertUserFromAuth0\` (creation and update)
    - [ ] **Green:** Implement service logic to sync profile data and roles
    - [ ] **Refactor:** Optimize Prisma queries and role mapping logic
- [ ] Task: Integrate synchronization into the request lifecycle
    - [ ] **Red:** Write tests to ensure user exists in DB after authenticated request
    - [ ] **Green:** Add sync logic to the auth middleware or a separate wrapper
- [ ] Task: Conductor - User Manual Verification 'User Synchronization & Identity Management' (Protocol in workflow.md)

## Phase 4: Route Security & Integration
- [ ] Task: Secure existing application routes
    - [ ] **Red:** Write integration tests for \`/api/properties\` and \`/api/users\` expecting 401
    - [ ] **Green:** Apply auth middleware to all routes in \`src/server.ts\` or individual routers
- [ ] Task: Conductor - User Manual Verification 'Route Security & Integration' (Protocol in workflow.md)

# API reference (summary)

Base URL: `API_PUBLIC_URL` (default `http://localhost:4000`). Auth is a
JWT in an httpOnly `token` cookie (set by login/register) or a `Bearer`
header. All routes below require auth unless noted; org-scoped routes also
enforce membership (`requireOrgMembership`) or platform-admin status.

## Auth (`/api/auth`)
`POST /register` · `POST /login` · `POST /logout` · `GET /me` · `GET /ws-token`
`POST /password-reset/request` · `POST /password-reset/confirm`
`GET /verify-email/:token` · `GET /google` · `GET /google/callback`

## Organizations & projects
`GET/POST /api/organizations` · `GET /api/organizations/:id`
`POST/DELETE /api/organizations/:id/members[/:userId]`
`GET/POST /api/projects` · `GET/DELETE /api/projects/:id`

## Apps & versions
`GET /api/apps?projectId=` · `GET/DELETE /api/apps/:id`
`POST /api/apps/upload` (multipart: `file`, `projectId`)
`GET /api/apps/:appId/versions` · `GET /api/app-versions/:id/download-url`

## Devices
`GET /api/device-profiles` (filters: `androidVersion`, `apiLevel`,
`architecture`, `formFactor`, `minWidth`) · `PATCH /api/device-profiles/:id`
`GET /api/devices` (filters: `deviceProfileId`, `status`)

## Sessions
`GET/POST /api/sessions` · `GET /api/sessions/:id` · `POST /api/sessions/:id/stop`
`POST /api/sessions/:id/restart` · `POST /api/sessions/:id/rotate`
`POST /api/sessions/:id/input/touch|swipe|key|text`
`POST /api/sessions/:id/screenshot` · `GET /api/sessions/:id/screenshots`
`GET /api/sessions/:id/events` · `GET /api/sessions/:id/logs`
`POST /api/sessions/:id/recordings/start` · `POST /api/recordings/:id/stop`
`GET /api/sessions/:id/recordings` · `DELETE /api/recordings/:id`

WebSockets (not REST, but part of the session surface):
`WS /ws/sessions/:id/events` (API - progress panel)
`WS /sessions/:id/stream` and `/logcat` (streaming-gateway - video/input, logs)

## Usage & billing
`GET /api/usage?organizationId=` · `GET /api/billing/plans`
`GET /api/billing/:organizationId` · `POST /api/billing/:organizationId/checkout`

## Admin (platform admin only)
`GET /api/admin/overview` · `GET /api/admin/users` · `GET /api/admin/organizations`
`GET /api/admin/sessions` · `POST /api/admin/sessions/:id/force-stop`
`GET/POST /api/admin/compute-hosts` · `PATCH/DELETE /api/admin/compute-hosts/:id`
`PATCH /api/admin/device-profiles/:id` · `GET /api/admin/audit-logs`

## Health & metrics
`GET /health` · `GET /metrics` (Prometheus)

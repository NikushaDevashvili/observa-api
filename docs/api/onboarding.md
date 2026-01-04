# Onboarding API Documentation

Complete guide to the Observa onboarding API endpoints.

## Overview

The Onboarding API provides endpoints for tracking user onboarding progress, managing checklist items, and personalizing the onboarding experience.

## Authentication

All onboarding endpoints require authentication via session token:

```
Authorization: Bearer <session_token>
```

Session tokens are obtained through:
- Signup: `POST /api/v1/auth/signup` returns `sessionToken`
- Login: `POST /api/v1/auth/login` returns `sessionToken`

## Endpoints

### GET /api/v1/onboarding/progress

Get user's current onboarding progress.

**Request:**
```
GET /api/v1/onboarding/progress
Authorization: Bearer <session_token>
```

**Response:**
```json
{
  "success": true,
  "progress": {
    "currentStep": "send_first_trace",
    "progressPercentage": 62,
    "completedAt": null,
    "startedAt": "2024-01-15T10:00:00Z",
    "checklist": [
      {
        "id": "uuid",
        "taskKey": "account_created",
        "taskType": "automatic",
        "status": "completed",
        "completedAt": "2024-01-15T10:00:00Z",
        "metadata": {
          "title": "Create Account",
          "description": "Your account has been created",
          "order": 1
        },
        "createdAt": "2024-01-15T10:00:00Z"
      },
      {
        "id": "uuid",
        "taskKey": "send_first_trace",
        "taskType": "automatic",
        "status": "pending",
        "completedAt": null,
        "metadata": {
          "title": "Send First Trace",
          "description": "Send your first trace to Observa",
          "order": 5
        },
        "createdAt": "2024-01-15T10:00:00Z"
      }
    ]
  }
}
```

### POST /api/v1/onboarding/tasks/:taskKey/complete

Mark a task as complete.

**Request:**
```
POST /api/v1/onboarding/tasks/install_sdk/complete
Authorization: Bearer <session_token>
Content-Type: application/json

{
  "metadata": {
    "version": "1.0.0",
    "packageManager": "npm"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Task install_sdk marked as complete"
}
```

**Task Keys:**
- `account_created` - Account creation (automatic)
- `email_verified` - Email verification (manual/automatic)
- `api_key_retrieved` - API key retrieved (automatic)
- `install_sdk` - SDK installed (manual)
- `send_first_trace` - First trace sent (automatic)
- `dashboard_visited` - Dashboard visited (automatic)
- `first_trace_viewed` - First trace viewed (automatic)
- `project_configured` - Project configured (manual)

### POST /api/v1/onboarding/tasks/:taskKey/skip

Skip a task.

**Request:**
```
POST /api/v1/onboarding/tasks/project_configured/skip
Authorization: Bearer <session_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Task project_configured skipped"
}
```

### POST /api/v1/onboarding/preferences

Update user onboarding preferences.

**Request:**
```
POST /api/v1/onboarding/preferences
Authorization: Bearer <session_token>
Content-Type: application/json

{
  "role": "developer",
  "useCase": "llm_monitoring",
  "onboardingDismissed": false
}
```

**Parameters:**
- `role` (optional): `"developer" | "product_manager" | "executive" | "other"`
- `useCase` (optional): `"llm_monitoring" | "cost_tracking" | "debugging" | "quality_analysis" | "other"`
- `onboardingDismissed` (optional): `boolean`

**Response:**
```json
{
  "success": true,
  "message": "Preferences updated"
}
```

### GET /api/v1/onboarding/next-steps

Get recommended next steps.

**Request:**
```
GET /api/v1/onboarding/next-steps
Authorization: Bearer <session_token>
```

**Response:**
```json
{
  "success": true,
  "nextSteps": [
    {
      "taskKey": "send_first_trace",
      "title": "Send First Trace",
      "description": "Send your first trace to Observa",
      "type": "automatic",
      "actionUrl": "https://observa-app.vercel.app/docs/quickstart",
      "actionText": "View Quick Start"
    },
    {
      "taskKey": "first_trace_viewed",
      "title": "View First Trace",
      "description": "View a trace detail in your dashboard",
      "type": "automatic",
      "actionUrl": "https://observa-app.vercel.app/traces",
      "actionText": "View Traces"
    }
  ]
}
```

### GET /api/v1/onboarding/banner

Get onboarding banner state for frontend display.

**Request:**
```
GET /api/v1/onboarding/banner
Authorization: Bearer <session_token>
```

**Response:**
```json
{
  "showBanner": true,
  "currentStep": "send_first_trace",
  "progressPercentage": 62,
  "nextTask": {
    "key": "send_first_trace",
    "title": "Send First Trace",
    "description": "Send your first trace to Observa",
    "type": "automatic"
  },
  "canDismiss": true
}
```

### GET /api/v1/onboarding/checklist

Get full checklist for frontend rendering.

**Request:**
```
GET /api/v1/onboarding/checklist
Authorization: Bearer <session_token>
```

**Response:**
```json
{
  "success": true,
  "items": [
    {
      "id": "uuid",
      "taskKey": "account_created",
      "taskType": "automatic",
      "status": "completed",
      "completedAt": "2024-01-15T10:00:00Z",
      "metadata": {
        "title": "Create Account",
        "description": "Your account has been created",
        "order": 1
      },
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ],
  "overallProgress": 62,
  "completedCount": 3,
  "totalCount": 8
}
```

## Email Verification Endpoints

### POST /api/v1/auth/verify-email

Request email verification email.

**Request:**
```
POST /api/v1/auth/verify-email
Authorization: Bearer <session_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Verification email sent"
}
```

### GET /api/v1/auth/verify-email/:token

Verify email with token.

**Request:**
```
GET /api/v1/auth/verify-email/abc123token
```

**Response:**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

## Automatic Task Detection

The system automatically detects and completes certain tasks:

- **`account_created`**: Automatically marked complete on signup
- **`api_key_retrieved`**: Automatically marked complete when API key is retrieved
- **`send_first_trace`**: Automatically detected when first trace is ingested
- **`dashboard_visited`**: Automatically detected on dashboard access
- **`first_trace_viewed`**: Automatically detected when viewing trace detail

## Frontend Integration Examples

### Display Onboarding Banner

```typescript
async function getOnboardingBanner() {
  const response = await fetch('/api/v1/onboarding/banner', {
    headers: {
      'Authorization': `Bearer ${sessionToken}`
    }
  });
  
  const data = await response.json();
  
  if (data.showBanner) {
    // Display banner with progress
    displayBanner({
      progress: data.progressPercentage,
      nextTask: data.nextTask,
      onDismiss: () => {
        // Update preferences to dismiss
        fetch('/api/v1/onboarding/preferences', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ onboardingDismissed: true })
        });
      }
    });
  }
}
```

### Display Checklist

```typescript
async function getOnboardingChecklist() {
  const response = await fetch('/api/v1/onboarding/checklist', {
    headers: {
      'Authorization': `Bearer ${sessionToken}`
    }
  });
  
  const data = await response.json();
  
  // Display checklist
  renderChecklist({
    items: data.items,
    progress: data.overallProgress,
    completed: data.completedCount,
    total: data.totalCount
  });
}
```

### Mark Task Complete

```typescript
async function markTaskComplete(taskKey: string, metadata?: object) {
  const response = await fetch(`/api/v1/onboarding/tasks/${taskKey}/complete`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ metadata })
  });
  
  return response.json();
}
```

## Error Responses

All endpoints return standard error responses:

```json
{
  "error": "Error message",
  "message": "Detailed error message"
}
```

**Status Codes:**
- `200` - Success
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing or invalid token)
- `404` - Not Found
- `500` - Internal Server Error

## Notes

- Onboarding progress is automatically initialized on signup
- Automatic tasks are detected without user intervention
- Manual tasks can be marked complete by the user or frontend
- Progress percentage is calculated from completed tasks
- Onboarding completion triggers a completion email (if email service is configured)
- Email verification is optional and can be disabled via `EMAIL_VERIFICATION_ENABLED` env var


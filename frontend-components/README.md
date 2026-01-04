# Frontend Onboarding Components

This directory contains React/Next.js components for the onboarding experience that match the Observa dashboard visual language.

## Components

- **OnboardingBanner** - Dismissible banner showing current progress and next step
- **OnboardingChecklist** - Full checklist of onboarding tasks with progress
- **NextStepsCard** - Recommended next steps card
- **OnboardingProgress** - Standalone progress indicator

## Installation

1. Copy these components to your frontend repository:
   ```bash
   cp -r frontend-components/onboarding /path/to/observa-app/src/components/
   ```

2. Install required dependencies:
   ```bash
   npm install lucide-react
   ```

3. Import and use components:
   ```typescript
   import { OnboardingBanner, OnboardingChecklist } from "@/components/onboarding";
   ```

## Usage

See `docs/frontend/onboarding-ui-components.md` for complete usage examples and integration guide.

## Styling

All components use Tailwind CSS with the same color palette and design patterns as the dashboard:
- Colors: Blue (`blue-600`), Green (`green-500`), Gray (`gray-50`, `gray-900`)
- Spacing: Standard Tailwind spacing scale
- Border radius: `rounded-lg`
- Shadows: `shadow-sm`

## API Integration

All components connect to the onboarding API endpoints:
- `/api/v1/onboarding/banner`
- `/api/v1/onboarding/checklist`
- `/api/v1/onboarding/next-steps`
- `/api/v1/onboarding/progress`
- `/api/v1/onboarding/tasks/:taskKey/complete`
- `/api/v1/onboarding/tasks/:taskKey/skip`
- `/api/v1/onboarding/preferences`

## Customization

Adjust the `apiUrl` prop if your API is hosted at a different URL:

```typescript
<OnboardingBanner 
  sessionToken={token} 
  apiUrl="https://your-api-url.com" 
/>
```


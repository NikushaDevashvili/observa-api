# Example Usage Pages

This directory contains example pages showing how to use the onboarding components.

## Examples

- **DashboardPageExample.tsx** - Shows how to integrate onboarding into the main dashboard
- **OnboardingPageExample.tsx** - Shows a dedicated onboarding page for new users

## Usage

1. Copy these examples to your frontend repository
2. Adjust the auth hook import (`useSession`) to match your authentication system
3. Customize the layout and styling as needed

## Integration Points

### Dashboard Integration

Add the onboarding banner at the top of your dashboard:

```typescript
import { OnboardingBanner } from "@/components/onboarding";

// In your dashboard layout
<OnboardingBanner sessionToken={sessionToken} />
```

### Sidebar Integration

Add the checklist and next steps in your dashboard sidebar:

```typescript
import { OnboardingChecklist, NextStepsCard } from "@/components/onboarding";

// In your sidebar
<NextStepsCard sessionToken={sessionToken} />
<OnboardingChecklist sessionToken={sessionToken} compact={true} />
```

### Dedicated Page

Create a dedicated onboarding page for new users:

```typescript
// app/onboarding/page.tsx
import OnboardingPageExample from "@/components/examples/OnboardingPageExample";
```


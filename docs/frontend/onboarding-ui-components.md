# Onboarding UI Components Guide

Complete guide to implementing onboarding UI components that match the Observa dashboard visual language.

## Overview

This guide provides React/Next.js components for the onboarding experience, designed to match the existing dashboard design system using Tailwind CSS, the same color palette, and visual patterns.

## Prerequisites

- React 19+ (or React 18)
- Next.js
- Tailwind CSS 3
- TypeScript
- Lucide React (for icons)

## Color Scheme

Based on the dashboard visual language:
- **Primary**: Blue (`#2563eb` / `blue-600`)
- **Success**: Green (`#22c55e` / `green-500`)
- **Warning**: Amber (`#f59e0b` / `amber-500`)
- **Error**: Red (`#ef4444` / `red-500`)
- **Info**: Cyan (`#06b6d4` / `cyan-500`)
- **Purple**: Purple (`#a855f7` / `purple-500`)
- **Background**: Gray (`#f9fafb` / `gray-50`)
- **Text**: Gray (`#1f2937` / `gray-800`)

## Components

### 1. OnboardingBanner Component

A dismissible banner showing current progress and next step.

**File**: `components/onboarding/OnboardingBanner.tsx`

```typescript
"use client";

import { useState, useEffect } from "react";
import { X, CheckCircle2, ArrowRight } from "lucide-react";

interface OnboardingBannerProps {
  sessionToken: string;
  apiUrl?: string;
}

interface BannerData {
  showBanner: boolean;
  currentStep: string;
  progressPercentage: number;
  nextTask: {
    key: string;
    title: string;
    description: string;
    type: "automatic" | "manual";
  } | null;
  canDismiss: boolean;
}

export function OnboardingBanner({
  sessionToken,
  apiUrl = "https://observa-api.vercel.app",
}: OnboardingBannerProps) {
  const [bannerData, setBannerData] = useState<BannerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    async function fetchBanner() {
      try {
        const response = await fetch(`${apiUrl}/api/v1/onboarding/banner`, {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch banner");
        }

        const data = await response.json();
        setBannerData(data);
      } catch (error) {
        console.error("Error fetching banner:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchBanner();
  }, [sessionToken, apiUrl]);

  const handleDismiss = async () => {
    try {
      await fetch(`${apiUrl}/api/v1/onboarding/preferences`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ onboardingDismissed: true }),
      });
      setDismissed(true);
    } catch (error) {
      console.error("Error dismissing banner:", error);
    }
  };

  if (loading || dismissed || !bannerData?.showBanner) {
    return null;
  }

  return (
    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-r-lg shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-sm font-semibold text-blue-900">
              Getting Started
            </h3>
            <div className="flex-1 max-w-xs">
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${bannerData.progressPercentage}%`,
                  }}
                />
              </div>
            </div>
            <span className="text-xs text-blue-700 font-medium">
              {bannerData.progressPercentage}%
            </span>
          </div>

          {bannerData.nextTask && (
            <div className="mt-2">
              <p className="text-sm text-blue-800 mb-1">
                <strong>Next:</strong> {bannerData.nextTask.title}
              </p>
              {bannerData.nextTask.description && (
                <p className="text-xs text-blue-600">
                  {bannerData.nextTask.description}
                </p>
              )}
              {bannerData.nextTask.type === "automatic" && (
                <span className="inline-flex items-center gap-1 mt-1 text-xs text-blue-600">
                  <CheckCircle2 className="w-3 h-3" />
                  This will complete automatically
                </span>
              )}
            </div>
          )}
        </div>

        {bannerData.canDismiss && (
          <button
            onClick={handleDismiss}
            className="ml-4 text-blue-600 hover:text-blue-800 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
```

### 2. OnboardingChecklist Component

A comprehensive checklist showing all onboarding tasks with progress.

**File**: `components/onboarding/OnboardingChecklist.tsx`

```typescript
"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  Circle,
  X,
  Loader2,
  ExternalLink,
  Zap,
} from "lucide-react";

interface ChecklistItem {
  id: string;
  taskKey: string;
  taskType: string;
  status: "pending" | "completed" | "skipped";
  completedAt: string | null;
  metadata: {
    title: string;
    description: string;
    order: number;
  };
  createdAt: string;
}

interface ChecklistData {
  items: ChecklistItem[];
  overallProgress: number;
  completedCount: number;
  totalCount: number;
}

interface OnboardingChecklistProps {
  sessionToken: string;
  apiUrl?: string;
  compact?: boolean;
}

export function OnboardingChecklist({
  sessionToken,
  apiUrl = "https://observa-api.vercel.app",
  compact = false,
}: OnboardingChecklistProps) {
  const [checklist, setChecklist] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchChecklist();
  }, [sessionToken]);

  const fetchChecklist = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/v1/onboarding/checklist`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch checklist");
      }

      const data = await response.json();
      setChecklist(data);
    } catch (error) {
      console.error("Error fetching checklist:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async (taskKey: string) => {
    setUpdating(taskKey);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/onboarding/tasks/${taskKey}/skip`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        }
      );

      if (response.ok) {
        await fetchChecklist();
      }
    } catch (error) {
      console.error("Error skipping task:", error);
    } finally {
      setUpdating(null);
    }
  };

  const handleComplete = async (taskKey: string) => {
    setUpdating(taskKey);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/onboarding/tasks/${taskKey}/complete`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      if (response.ok) {
        await fetchChecklist();
      }
    } catch (error) {
      console.error("Error completing task:", error);
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!checklist) {
    return null;
  }

  const sortedItems = [...checklist.items].sort(
    (a, b) => (a.metadata?.order || 999) - (b.metadata?.order || 999)
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {!compact && (
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900">
              Onboarding Checklist
            </h3>
            <div className="text-sm text-gray-600">
              {checklist.completedCount} of {checklist.totalCount} completed
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${checklist.overallProgress}%` }}
            />
          </div>
        </div>
      )}

      <div className={compact ? "p-2" : "p-4"}>
        <ul className="space-y-3">
          {sortedItems.map((item) => {
            const isCompleted = item.status === "completed";
            const isPending = item.status === "pending";
            const isSkipped = item.status === "skipped";

            return (
              <li
                key={item.id}
                className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                  isCompleted
                    ? "bg-green-50 border border-green-200"
                    : isSkipped
                    ? "bg-gray-50 border border-gray-200 opacity-60"
                    : "bg-gray-50 border border-gray-200"
                }`}
              >
                <div className="mt-0.5">
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : isSkipped ? (
                    <X className="w-5 h-5 text-gray-400" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h4
                        className={`text-sm font-medium ${
                          isCompleted
                            ? "text-green-900"
                            : isSkipped
                            ? "text-gray-500"
                            : "text-gray-900"
                        }`}
                      >
                        {item.metadata?.title || item.taskKey}
                      </h4>
                      {item.metadata?.description && (
                        <p
                          className={`text-xs mt-1 ${
                            isCompleted
                              ? "text-green-700"
                              : isSkipped
                              ? "text-gray-400"
                              : "text-gray-600"
                          }`}
                        >
                          {item.metadata.description}
                        </p>
                      )}
                      {item.taskType === "automatic" && isPending && (
                        <span className="inline-flex items-center gap-1 mt-1 text-xs text-blue-600">
                          <Zap className="w-3 h-3" />
                          Automatic
                        </span>
                      )}
                    </div>

                    {!isCompleted && !isSkipped && item.taskType === "manual" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleComplete(item.taskKey)}
                          disabled={updating === item.taskKey}
                          className="px-3 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded border border-green-200 transition-colors disabled:opacity-50"
                        >
                          {updating === item.taskKey ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            "Mark Complete"
                          )}
                        </button>
                        <button
                          onClick={() => handleSkip(item.taskKey)}
                          disabled={updating === item.taskKey}
                          className="px-3 py-1 text-xs font-medium text-gray-600 bg-white hover:bg-gray-50 rounded border border-gray-300 transition-colors disabled:opacity-50"
                        >
                          Skip
                        </button>
                      </div>
                    )}
                  </div>

                  {isCompleted && item.completedAt && (
                    <p className="text-xs text-green-600 mt-1">
                      Completed{" "}
                      {new Date(item.completedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
```

### 3. NextStepsCard Component

A card showing recommended next steps.

**File**: `components/onboarding/NextStepsCard.tsx`

```typescript
"use client";

import { useState, useEffect } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

interface NextStep {
  taskKey: string;
  title: string;
  description: string;
  type: "automatic" | "manual";
  actionUrl?: string;
  actionText?: string;
}

interface NextStepsCardProps {
  sessionToken: string;
  apiUrl?: string;
}

export function NextStepsCard({
  sessionToken,
  apiUrl = "https://observa-api.vercel.app",
}: NextStepsCardProps) {
  const [nextSteps, setNextSteps] = useState<NextStep[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchNextSteps() {
      try {
        const response = await fetch(
          `${apiUrl}/api/v1/onboarding/next-steps`,
          {
            headers: {
              Authorization: `Bearer ${sessionToken}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch next steps");
        }

        const data = await response.json();
        setNextSteps(data.nextSteps || []);
      } catch (error) {
        console.error("Error fetching next steps:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchNextSteps();
  }, [sessionToken, apiUrl]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (nextSteps.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Recommended Next Steps
      </h3>
      <div className="space-y-3">
        {nextSteps.map((step, index) => (
          <div
            key={step.taskKey}
            className="bg-white rounded-lg p-4 border border-gray-200 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                    {index + 1}
                  </span>
                  <h4 className="text-sm font-semibold text-gray-900">
                    {step.title}
                  </h4>
                  {step.type === "automatic" && (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      <CheckCircle2 className="w-3 h-3" />
                      Automatic
                    </span>
                  )}
                </div>
                {step.description && (
                  <p className="text-xs text-gray-600 ml-8">
                    {step.description}
                  </p>
                )}
              </div>
              {step.actionUrl && (
                <a
                  href={step.actionUrl}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                >
                  {step.actionText || "View"}
                  <ArrowRight className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 4. OnboardingProgress Component

A standalone progress indicator.

**File**: `components/onboarding/OnboardingProgress.tsx`

```typescript
"use client";

import { useState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

interface ProgressData {
  currentStep: string;
  progressPercentage: number;
  completedAt: string | null;
  startedAt: string;
}

interface OnboardingProgressProps {
  sessionToken: string;
  apiUrl?: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export function OnboardingProgress({
  sessionToken,
  apiUrl = "https://observa-api.vercel.app",
  showLabel = true,
  size = "md",
}: OnboardingProgressProps) {
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProgress() {
      try {
        const response = await fetch(
          `${apiUrl}/api/v1/onboarding/progress`,
          {
            headers: {
              Authorization: `Bearer ${sessionToken}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch progress");
        }

        const data = await response.json();
        setProgress(data.progress);
      } catch (error) {
        console.error("Error fetching progress:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchProgress();
  }, [sessionToken, apiUrl]);

  if (loading || !progress) {
    return null;
  }

  const heightClasses = {
    sm: "h-1.5",
    md: "h-2",
    lg: "h-3",
  };

  const isComplete = progress.progressPercentage >= 100;

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Onboarding Progress
          </span>
          {isComplete ? (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              Complete
            </span>
          ) : (
            <span className="text-sm font-medium text-gray-600">
              {progress.progressPercentage}%
            </span>
          )}
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full ${heightClasses[size]}`}>
        <div
          className={`${
            isComplete ? "bg-green-600" : "bg-blue-600"
          } ${heightClasses[size]} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${Math.min(progress.progressPercentage, 100)}%` }}
        />
      </div>
    </div>
  );
}
```

## Usage Examples

### Dashboard Layout with Onboarding

**File**: `app/dashboard/page.tsx`

```typescript
"use client";

import { OnboardingBanner } from "@/components/onboarding/OnboardingBanner";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { NextStepsCard } from "@/components/onboarding/NextStepsCard";
import { useSession } from "@/hooks/useSession"; // Your auth hook

export default function DashboardPage() {
  const { sessionToken } = useSession(); // Adjust to your auth implementation

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Onboarding Banner */}
        {sessionToken && (
          <OnboardingBanner sessionToken={sessionToken} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Your dashboard content here */}
          </div>

          {/* Sidebar with Onboarding */}
          <div className="space-y-6">
            {sessionToken && (
              <>
                <NextStepsCard sessionToken={sessionToken} />
                <OnboardingChecklist
                  sessionToken={sessionToken}
                  compact={false}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Onboarding Page

**File**: `app/onboarding/page.tsx`

```typescript
"use client";

import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { NextStepsCard } from "@/components/onboarding/NextStepsCard";
import { useSession } from "@/hooks/useSession";

export default function OnboardingPage() {
  const { sessionToken } = useSession();

  if (!sessionToken) {
    return <div>Please log in to view onboarding</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to Observa!
          </h1>
          <p className="text-gray-600">
            Let's get you set up in just a few steps.
          </p>
        </div>

        <div className="mb-8">
          <OnboardingProgress
            sessionToken={sessionToken}
            showLabel={true}
            size="lg"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <OnboardingChecklist sessionToken={sessionToken} />
          </div>
          <div>
            <NextStepsCard sessionToken={sessionToken} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

## Styling

All components use Tailwind CSS classes that match the dashboard:
- Same color palette (blue-600, green-500, etc.)
- Same border radius (`rounded-lg`)
- Same shadows (`shadow-sm`)
- Same spacing patterns
- Same typography scale

## API Integration

All components use the onboarding API endpoints:
- `GET /api/v1/onboarding/banner` - Banner data
- `GET /api/v1/onboarding/checklist` - Full checklist
- `GET /api/v1/onboarding/next-steps` - Recommended steps
- `GET /api/v1/onboarding/progress` - Progress data
- `POST /api/v1/onboarding/tasks/:taskKey/complete` - Mark complete
- `POST /api/v1/onboarding/tasks/:taskKey/skip` - Skip task
- `POST /api/v1/onboarding/preferences` - Update preferences

## Responsive Design

All components are responsive and work on:
- Mobile (320px+)
- Tablet (768px+)
- Desktop (1024px+)

## Accessibility

Components include:
- ARIA labels
- Keyboard navigation
- Focus states
- Semantic HTML

## Next Steps

1. Copy components to your frontend repo
2. Install required dependencies (`lucide-react`)
3. Adjust API URL if different
4. Integrate with your auth system (session token)
5. Customize colors/styling if needed
6. Test with real API data


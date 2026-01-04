/**
 * Example: Dedicated Onboarding Page
 * 
 * This shows a full onboarding page for new users
 */

"use client";

import { OnboardingChecklist } from "../onboarding/OnboardingChecklist";
import { OnboardingProgress } from "../onboarding/OnboardingProgress";
import { NextStepsCard } from "../onboarding/NextStepsCard";
import { useSession } from "@/hooks/useSession"; // Adjust to your auth hook

export default function OnboardingPage() {
  const { sessionToken } = useSession();

  if (!sessionToken) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Please log in to view onboarding</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to Observa!
          </h1>
          <p className="text-gray-600">
            Let's get you set up in just a few steps. Complete these tasks to
            unlock the full power of Observa.
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="mb-8 bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <OnboardingProgress
            sessionToken={sessionToken}
            showLabel={true}
            size="lg"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Checklist */}
          <div className="lg:col-span-2">
            <OnboardingChecklist sessionToken={sessionToken} />
          </div>

          {/* Next Steps Sidebar */}
          <div>
            <NextStepsCard sessionToken={sessionToken} />
          </div>
        </div>

        {/* Completion Message */}
        <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">
            <strong>Tip:</strong> Most tasks can be completed automatically as
            you use Observa. Just install the SDK and start tracking traces!
          </p>
        </div>
      </div>
    </div>
  );
}


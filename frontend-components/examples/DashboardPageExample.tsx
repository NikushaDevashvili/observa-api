/**
 * Example: Dashboard Page with Onboarding
 * 
 * This shows how to integrate onboarding components into your dashboard
 */

"use client";

import { OnboardingBanner } from "../onboarding/OnboardingBanner";
import { OnboardingChecklist } from "../onboarding/OnboardingChecklist";
import { NextStepsCard } from "../onboarding/NextStepsCard";
import { useSession } from "@/hooks/useSession"; // Adjust to your auth hook

export default function DashboardPage() {
  const { sessionToken } = useSession(); // Adjust to your auth implementation

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Onboarding Banner */}
        {sessionToken && (
          <OnboardingBanner sessionToken={sessionToken} />
        )}

        {/* Main Dashboard Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Your dashboard metrics, charts, etc. */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Dashboard Overview
              </h2>
              {/* Dashboard content here */}
            </div>
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


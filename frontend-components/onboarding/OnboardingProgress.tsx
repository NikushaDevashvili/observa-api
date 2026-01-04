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


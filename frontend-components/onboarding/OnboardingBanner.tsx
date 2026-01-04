"use client";

import { useState, useEffect } from "react";
import { X, CheckCircle2 } from "lucide-react";

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


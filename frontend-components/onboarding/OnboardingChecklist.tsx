"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  Circle,
  X,
  Loader2,
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


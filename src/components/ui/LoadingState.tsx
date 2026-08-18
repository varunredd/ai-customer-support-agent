import React from "react";
import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = "Loading..." }: LoadingStateProps) {
  return (
    <div className="state-container">
      <Loader2 className="state-icon" style={{ animation: "spin 1s linear infinite" }} size={32} />
      <p className="state-description">{message}</p>
    </div>
  );
}

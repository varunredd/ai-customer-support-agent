import React from "react";
import { AlertTriangle } from "lucide-react";
import clsx from "clsx";

interface ErrorStateProps {
  title?: string;
  description?: string;
  className?: string;
}

export function ErrorState({ 
  title = "Something went wrong", 
  description = "An error occurred while loading this data. Please try again later.", 
  className 
}: ErrorStateProps) {
  return (
    <div className={clsx("state-container state-error", className)}>
      <div className="state-icon">
        <AlertTriangle size={32} />
      </div>
      <h3 className="state-title">{title}</h3>
      <p className="state-description">{description}</p>
    </div>
  );
}

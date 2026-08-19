import { Inbox } from "lucide-react";
import clsx from "clsx";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function EmptyState({
  title = "Nothing here",
  description = "",
  icon = <Inbox size={22} />,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div className={clsx("state-container", className)}>
      <div className="state-icon">{icon}</div>
      <h3 className="state-title">{title}</h3>
      {description ? <p className="state-description">{description}</p> : null}
      {children}
    </div>
  );
}

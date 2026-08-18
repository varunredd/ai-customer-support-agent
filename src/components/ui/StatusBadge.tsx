import clsx from "clsx";

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: "SUCCESS" | "FAILED" | "RUNNING" | "WARNING" | "NEUTRAL" | "PASS" | "FAIL" | "LOW" | "MEDIUM" | "HIGH";
  children: React.ReactNode;
}

export function StatusBadge({ status, children, className, ...props }: StatusBadgeProps) {
  const colorClass = {
    SUCCESS: "status-success",
    PASS: "status-success",
    LOW: "status-success",
    FAILED: "status-failed",
    FAIL: "status-failed",
    HIGH: "status-failed",
    WARNING: "status-warning",
    MEDIUM: "status-warning",
    RUNNING: "status-running",
    NEUTRAL: "status-neutral",
  }[status];

  return (
    <span className={clsx("badge", colorClass, className)} {...props}>
      {children}
    </span>
  );
}

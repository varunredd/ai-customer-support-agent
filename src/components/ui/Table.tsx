import React from "react";
import clsx from "clsx";

export function Table({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="table-container">
      <table className={clsx("table", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

import clsx from "clsx";
import styles from "./PageHeader.module.css";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  return (
    <header className={clsx(styles.header, className)}>
      <div className={styles.content}>
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {children ? <div className={styles.actions}>{children}</div> : null}
    </header>
  );
}

import { cn } from '../../utils/cn.ts';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export function Card({ className, ...rest }: CardProps) {
  return <div className={cn('rounded-[var(--radius-md)] bg-raised border border-line p-3 shadow-sm', className)} {...rest} />;
}

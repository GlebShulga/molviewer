import { type LucideIcon } from 'lucide-react';

export interface IconProps {
  icon: LucideIcon;
  size?: number;
  className?: string;
  color?: string;
  strokeWidth?: number;
}

export function Icon({
  icon: LucideIcon,
  size = 18,
  className,
  color,
  strokeWidth = 2,
}: IconProps) {
  return (
    <LucideIcon
      size={size}
      className={className}
      color={color}
      strokeWidth={strokeWidth}
    />
  );
}

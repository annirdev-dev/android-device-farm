import { Badge, type BadgeProps } from "@/components/ui/badge";

const VARIANT_MAP: Record<string, NonNullable<BadgeProps["variant"]>> = {
  // sessions
  RUNNING: "success",
  READY: "success",
  BOOTING: "warning",
  INSTALLING: "warning",
  STARTING: "warning",
  CREATING: "warning",
  STOPPING: "muted",
  STOPPED: "muted",
  FAILED: "destructive",
  // devices / hosts
  AVAILABLE: "success",
  HEALTHY: "success",
  BUSY: "warning",
  DEGRADED: "warning",
  OFFLINE: "muted",
  MAINTENANCE: "outline",
  // app versions
  UPLOADED: "muted",
  SCANNING: "warning",
  PROCESSING: "warning",
  REJECTED: "destructive",
};

const DOT_COLOR: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  muted: "bg-muted-foreground",
  outline: "bg-foreground",
  default: "bg-primary",
  secondary: "bg-secondary-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  const variant = VARIANT_MAP[status] ?? "secondary";
  return (
    <Badge variant={variant} className="capitalize">
      <span className={`status-dot ${DOT_COLOR[variant]}`} />
      {status.toLowerCase().replace(/_/g, " ")}
    </Badge>
  );
}

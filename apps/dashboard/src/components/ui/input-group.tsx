import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * InputGroup — wraps an Input with leading/trailing icon slots.
 *
 * Usage:
 * ```tsx
 * <InputGroup>
 *   <InputGroupIcon side="leading"><Search /></InputGroupIcon>
 *   <Input placeholder="Search..." />
 *   <InputGroupIcon side="trailing"><X /></InputGroupIcon>
 * </InputGroup>
 * ```
 */
function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn(
        "relative flex items-center [&>input]:w-full",
        // Add left padding to input when a leading icon is present
        "[&>input]:has-[[data-slot=input-group-icon][data-side=leading]]:pl-9",
        // Add right padding to input when a trailing icon is present
        "[&>input]:has-[[data-slot=input-group-icon][data-side=trailing]]:pr-9",
        className,
      )}
      {...props}
    />
  );
}

function InputGroupIcon({
  className,
  side,
  ...props
}: React.ComponentProps<"div"> & { side: "leading" | "trailing" }) {
  return (
    <div
      data-slot="input-group-icon"
      data-side={side}
      className={cn(
        "pointer-events-none absolute top-1/2 -translate-y-1/2 flex items-center justify-center text-muted-foreground [&>svg]:size-4",
        side === "leading" && "left-3",
        side === "trailing" && "right-3",
        className,
      )}
      {...props}
    />
  );
}

/**
 * InputGroupAction — an interactive element (button) inside the input group.
 * Unlike InputGroupIcon, this allows pointer events.
 */
function InputGroupAction({
  className,
  side,
  ...props
}: React.ComponentProps<"div"> & { side: "leading" | "trailing" }) {
  return (
    <div
      data-slot="input-group-icon"
      data-side={side}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 flex items-center justify-center",
        side === "leading" && "left-2",
        side === "trailing" && "right-2",
        className,
      )}
      {...props}
    />
  );
}

export { InputGroup, InputGroupIcon, InputGroupAction };

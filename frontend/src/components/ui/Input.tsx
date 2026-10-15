import * as React from "react";
import { cn } from "../../lib/cn";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", onWheel, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn("ui-input", className)}
        onWheel={(e) => {
          if (type === "number") {
            (e.target as HTMLElement).blur();
          }
          onWheel?.(e);
        }}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export default Input;

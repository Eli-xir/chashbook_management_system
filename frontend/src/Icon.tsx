import type { SVGProps } from 'react';

export function Icon({ size, ...props }: SVGProps<SVGSVGElement> & { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.5" aria-hidden="true" {...props} />;
}

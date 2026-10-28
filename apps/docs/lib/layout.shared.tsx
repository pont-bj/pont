import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <span className="flex items-center gap-2 font-semibold">
        <svg viewBox="0 0 64 64" className="h-5 w-5" aria-hidden>
          <path fill="#4F46E5" fillRule="evenodd" d="M8 6 H42 A14 14 0 0 1 56 20 V30 A14 14 0 0 1 42 44 H22 V58 H8 Z M22 34 H42 V22 A10 10 0 0 0 22 22 Z" />
        </svg>
        Pont · Documentation
      </span>
    ),
    url: "/",
  },
};

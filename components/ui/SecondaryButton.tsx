"use client";

import React from 'react';
import Link from 'next/link';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: string };

export default function SecondaryButton(props: Props) {
  const { className = '', children, href, ...rest } = props;
  const base = 'bg-[#1A1A1A] text-white border border-gray-700 hover:border-[#D4AF37] py-2 px-4 rounded-lg transition';

  if (href) {
    return (
      <Link href={href} className={`${base} ${className}`}>
        {children}
      </Link>
    );
  }

  return (
    <button className={`${base} ${className}`} {...rest}>
      {children}
    </button>
  );
}

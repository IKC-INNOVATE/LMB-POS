"use client";

import React from 'react';
import Link from 'next/link';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: string };

export default function PrimaryButton(props: Props) {
  const { className = '', children, href, ...rest } = props;
  const base = 'bg-[#D4AF37] text-black font-bold hover:bg-[#C5A059] py-2 px-4 rounded-lg transition';

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

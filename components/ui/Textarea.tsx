"use client";

import React from 'react';

export default function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', children, ...rest } = props;
  const base = 'bg-[#111111] border border-gray-700 focus:border-[#D4AF37] text-white placeholder-gray-400 font-medium rounded-lg px-3 py-2 w-full';
  return (
    <textarea className={`${base} ${className}`} {...rest}>
      {children}
    </textarea>
  );
}

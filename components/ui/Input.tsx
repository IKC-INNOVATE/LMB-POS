"use client";

import React from 'react';

export default function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  const base = 'bg-[#111111] border border-gray-700 focus:border-[#D4AF37] text-white placeholder-gray-400 font-medium rounded-lg px-3 py-2 w-full';
  return <input className={`${base} ${className}`} {...rest} />;
}

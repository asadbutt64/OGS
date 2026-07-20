import React from 'react';

export interface WarningBannerProps {
  data: any;
  defaultMessage: string;
}

export const IllustrativeWarningBanner = ({ data, defaultMessage }: WarningBannerProps) => {
  if (!data) return null;
  const isIllustrative = data.type === 'illustrative_simulation' || 
                         (data.data && data.data.type === 'illustrative_simulation') ||
                         (Array.isArray(data) && (data as any).type === 'illustrative_simulation') ||
                         (Array.isArray(data.data) && (data.data as any).type === 'illustrative_simulation');
  if (!isIllustrative) return null;
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 text-amber-900 text-[10px] p-2.5 rounded-lg mb-3 leading-relaxed">
      <strong>ILLUSTRATIVE SIMULATION WARNING</strong> — {defaultMessage}
    </div>
  );
};

export function assertSectionDataType(data: any, expectedType: string, sectionName: string) {
  if (data && data.type !== expectedType) {
    throw new Error(
      `Render-time contract violation in ${sectionName}: expected data type "${expectedType}", but received data type "${data.type}". Rendering halted to prevent silent misrouting.`
    );
  }
}

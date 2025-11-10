import React from 'react';

/**
 * Professional card component for consistent content containers
 */

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  title,
  subtitle,
  padding = 'md',
  hover = false,
}) => {
  const getPaddingClasses = () => {
    const paddings = {
      none: '',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    };
    return paddings[padding];
  };

  return (
    <div
      className={`
        bg-base-100 rounded-xl shadow-sm border border-base-300/50
        transition-all duration-200
        ${hover ? 'hover:shadow-md hover:border-base-300' : ''}
        ${className}
      `}
    >
      {(title || subtitle) && (
        <div className={`border-b border-base-300 ${getPaddingClasses()}`}>
          {title && (
            <h3 className="text-xl font-semibold text-neutral">{title}</h3>
          )}
          {subtitle && (
            <p className="text-sm text-base-content/60 mt-1">{subtitle}</p>
          )}
        </div>
      )}
      <div className={getPaddingClasses()}>{children}</div>
    </div>
  );
};

export default Card;

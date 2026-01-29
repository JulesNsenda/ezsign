import React from 'react';

/**
 * Professional button component with multiple variants and sizes
 *
 * Accessibility: For icon-only buttons (no children text), always provide an aria-label.
 * Example: <Button icon={<TrashIcon />} aria-label="Delete item" />
 */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline' | 'link';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  icon,
  iconPosition = 'left',
  disabled,
  className,
  ...props
}) => {
  const getVariantClasses = () => {
    const variants = {
      primary: 'bg-neutral text-base-100 hover:bg-neutral/90 active:bg-neutral/80 shadow-sm hover:shadow-md',
      secondary: 'bg-secondary text-white hover:bg-secondary/90 active:bg-secondary/80 shadow-sm hover:shadow-md',
      danger: 'bg-error text-white hover:bg-error/90 active:bg-error/80 shadow-sm hover:shadow-md',
      success: 'bg-success text-white hover:bg-success/90 active:bg-success/80 shadow-sm hover:shadow-md',
      ghost: 'bg-transparent hover:bg-base-200 active:bg-base-300 text-base-content',
      outline: 'bg-transparent border-2 border-neutral text-neutral hover:bg-neutral hover:text-base-100 active:bg-neutral/90',
      link: 'bg-transparent text-neutral hover:text-neutral/80 hover:underline underline-offset-4',
    };

    return variants[variant];
  };

  const getSizeClasses = () => {
    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-5 py-2.5 text-base',
      lg: 'px-6 py-3 text-lg',
    };

    return sizes[size];
  };

  const baseClasses = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral/50';

  return (
    <button
      className={`
        ${baseClasses}
        ${getVariantClasses()}
        ${getSizeClasses()}
        ${fullWidth ? 'w-full' : ''}
        ${loading ? 'cursor-wait' : ''}
        ${className || ''}
      `}
      disabled={disabled || loading}
      aria-busy={loading}
      aria-disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Loading...</span>
        </>
      ) : (
        <>
          {icon && iconPosition === 'left' && <span aria-hidden="true">{icon}</span>}
          {children}
          {icon && iconPosition === 'right' && <span aria-hidden="true">{icon}</span>}
        </>
      )}
    </button>
  );
};

export default Button;

import React from 'react';

/**
 * Loading spinner component
 */

export interface LoaderProps {
  size?: 'small' | 'medium' | 'large';
  fullScreen?: boolean;
}

export const Loader: React.FC<LoaderProps> = ({
  size = 'medium',
  fullScreen = false,
}) => {
  const getSizePixels = () => {
    const sizes = {
      small: 20,
      medium: 40,
      large: 60,
    };
    return sizes[size];
  };

  const sizePixels = getSizePixels();

  const spinner = (
    <div
      style={{
        width: `${sizePixels}px`,
        height: `${sizePixels}px`,
        border: `${sizePixels / 10}px solid #f3f3f3`,
        borderTop: `${sizePixels / 10}px solid #007bff`,
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }}
    />
  );

  if (fullScreen) {
    return (
      <>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            zIndex: 9999,
          }}
        >
          {spinner}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      {spinner}
    </>
  );
};

export default Loader;

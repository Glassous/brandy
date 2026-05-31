import { useState, useEffect } from 'react';

interface AvatarProps {
  name: string;
  url?: string;
  size?: number;
  fontSize?: number;
}

export function Avatar({ name, url, size = 40, fontSize }: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [url]);

  const hasAvatar = url && !imgError;

  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: fontSize ?? size * 0.4,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {hasAvatar ? (
        <img
          src={url}
          alt={name}
          onError={() => setImgError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        (name ?? '?').slice(0, 1).toUpperCase()
      )}
    </div>
  );
}

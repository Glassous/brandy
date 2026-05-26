interface AvatarProps {
  name: string;
  size?: number;
  fontSize?: number;
}

export function Avatar({ name, size = 40, fontSize }: AvatarProps) {
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: fontSize ?? size * 0.4,
      }}
    >
      {name.slice(0, 1)}
    </div>
  );
}

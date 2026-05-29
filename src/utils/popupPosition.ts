interface Position {
  top: number;
  left: number;
}

interface Size {
  width: number;
  height: number;
}

interface PopupPositionOptions {
  x: number;
  y: number;
  popupSize: Size;
  margin?: number;
}

interface PopoverPositionOptions {
  triggerRect: DOMRect;
  popupSize: Size;
  margin?: number;
  preferredDirection?: 'right' | 'left' | 'auto';
}

export function calculateContextMenuPosition({
  x,
  y,
  popupSize,
  margin = 8
}: PopupPositionOptions): Position {
  const { innerWidth, innerHeight } = window;
  let top = y;
  let left = x;

  if (x + popupSize.width + margin > innerWidth) {
    left = innerWidth - popupSize.width - margin;
  }

  if (y + popupSize.height + margin > innerHeight) {
    top = innerHeight - popupSize.height - margin;
  }

  if (left < margin) {
    left = margin;
  }

  if (top < margin) {
    top = margin;
  }

  return { top, left };
}

export function calculatePopoverPosition({
  triggerRect,
  popupSize,
  margin = 4,
  preferredDirection = 'auto'
}: PopoverPositionOptions): Position {
  const { innerWidth, innerHeight } = window;
  let top: number;
  let left: number;

  if (preferredDirection === 'right' || 
      (preferredDirection === 'auto' && triggerRect.left + popupSize.width + margin <= innerWidth)) {
    left = triggerRect.left;
  } else {
    left = triggerRect.right - popupSize.width;
  }

  if (triggerRect.bottom + popupSize.height + margin <= innerHeight) {
    top = triggerRect.bottom + margin;
  } else {
    top = triggerRect.top - popupSize.height - margin;
  }

  if (left < margin) {
    left = margin;
  } else if (left + popupSize.width + margin > innerWidth) {
    left = innerWidth - popupSize.width - margin;
  }

  if (top < margin) {
    top = margin;
  }

  return { top, left };
}

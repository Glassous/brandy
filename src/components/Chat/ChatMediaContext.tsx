import { createContext, useContext } from 'react';

export interface MediaItem {
  url: string;
  file_name: string;
  file_size: number;
  file_type: 'image' | 'video' | 'audio' | 'file';
  cos_key?: string;
}

interface ChatMediaContextValue {
  /** Open the global viewer at the given file url */
  openViewer: (url: string) => void;
}

export const ChatMediaContext = createContext<ChatMediaContextValue>({
  openViewer: () => {},
});

export const useChatMedia = () => useContext(ChatMediaContext);

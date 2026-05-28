export interface LocalMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  friend_id: string; // Helper field to easily query by friend ID
}

export interface SyncState {
  friend_id: string;
  last_sync_time: string | null;
  deleted_before: string | null;
}

export class LocalChatDB {
  private dbName: string;
  private db: IDBDatabase | null = null;

  constructor(userId: string) {
    this.dbName = `brandy_local_db_${userId}`;
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        reject(new Error("Failed to open IndexedDB"));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('friend_id', 'friend_id', { unique: false });
          messageStore.createIndex('created_at', 'created_at', { unique: false });
        }
        if (!db.objectStoreNames.contains('sync_states')) {
          db.createObjectStore('sync_states', { keyPath: 'friend_id' });
        }
      };
    });
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // Save messages
  saveMessages(messages: LocalMessage[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not open"));
      if (messages.length === 0) return resolve();

      const transaction = this.db.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      messages.forEach(msg => {
        store.put(msg);
      });
    });
  }

  // Get messages for a friend
  getMessages(friendId: string, deletedBefore: string | null): Promise<LocalMessage[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not open"));

      const transaction = this.db.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const index = store.index('friend_id');
      const request = index.getAll(IDBKeyRange.only(friendId));

      request.onsuccess = () => {
        let list = request.result as LocalMessage[];
        // Filter by deletedBefore if present
        if (deletedBefore) {
          list = list.filter(m => m.created_at > deletedBefore);
        }
        // Sort by created_at ascending
        list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        resolve(list);
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Clear messages for a specific friend
  clearMessages(friendId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not open"));

      const transaction = this.db.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      const index = store.index('friend_id');
      const request = index.openCursor(IDBKeyRange.only(friendId));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Clear all messages
  clearAllMessages(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not open"));

      const transaction = this.db.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Get sync state for a friend
  getSyncState(friendId: string): Promise<SyncState> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not open"));

      const transaction = this.db.transaction(['sync_states'], 'readonly');
      const store = transaction.objectStore('sync_states');
      const request = store.get(friendId);

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result);
        } else {
          resolve({ friend_id: friendId, last_sync_time: null, deleted_before: null });
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Update sync state
  updateSyncState(state: SyncState): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not open"));

      const transaction = this.db.transaction(['sync_states'], 'readwrite');
      const store = transaction.objectStore('sync_states');
      const request = store.put(state);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Update all sync states (e.g. for clearing all conversations)
  updateAllSyncStates(deletedBefore: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not open"));

      const transaction = this.db.transaction(['sync_states'], 'readwrite');
      const store = transaction.objectStore('sync_states');
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          const data = cursor.value as SyncState;
          data.deleted_before = deletedBefore;
          cursor.update(data);
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  deleteMessage(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not open"));
      const transaction = this.db.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  deleteMessages(ids: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not open"));
      if (ids.length === 0) return resolve();
      const transaction = this.db.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      ids.forEach(id => {
        store.delete(id);
      });
    });
  }
}

import { useEffect } from 'react';
import { useSocket } from '@/contexts/SocketContext';

/**
 * Hook to subscribe to real-time document updates
 * Query invalidation is handled automatically by SocketContext
 * This hook is mainly for joining document-specific rooms
 */
export const useDocumentUpdates = (documentId?: string) => {
  const { isConnected, joinDocument, leaveDocument } = useSocket();

  // Subscribe to document-specific room if documentId is provided
  useEffect(() => {
    if (!isConnected || !documentId) return;

    joinDocument(documentId);

    return () => {
      leaveDocument(documentId);
    };
  }, [isConnected, documentId, joinDocument, leaveDocument]);

  return { isConnected };
};

export default useDocumentUpdates;

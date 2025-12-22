import React, { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';

interface DocumentEvent {
  documentId: string;
  status: string;
  updatedAt: string;
  updatedBy?: string;
}

interface SignerEvent {
  documentId: string;
  signerId: string;
  signerEmail: string;
  status: string;
  signedAt?: string;
}

interface SocketContextType {
  isConnected: boolean;
  socket: Socket | null;
  joinDocument: (documentId: string) => void;
  leaveDocument: (documentId: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const token = localStorage.getItem('access_token');
    if (!token) {
      console.log('[Socket] No access token found');
      return;
    }

    // Don't create a new socket if one already exists
    if (socketRef.current?.connected) {
      return;
    }

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    console.log('[Socket] Connecting to:', apiUrl);

    const newSocket = io(apiUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      console.log('[Socket] Connected, socket id:', newSocket.id);
      setIsConnected(true);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      setIsConnected(false);
    });

    // Handle document updates - invalidate queries directly
    newSocket.on('document:updated', (event: DocumentEvent) => {
      console.log('[Socket] Received document:updated event:', event);

      // Invalidate all document-related queries
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['recent-documents'] });

      if (event.documentId) {
        queryClient.invalidateQueries({ queryKey: ['document', event.documentId] });
        queryClient.invalidateQueries({ queryKey: ['document-status', event.documentId] });
      }
    });

    // Handle signer updates
    newSocket.on('signer:updated', (event: SignerEvent) => {
      console.log('[Socket] Received signer:updated event:', event);

      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['recent-documents'] });

      if (event.documentId) {
        queryClient.invalidateQueries({ queryKey: ['signers', event.documentId] });
        queryClient.invalidateQueries({ queryKey: ['document-status', event.documentId] });
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, queryClient]);

  const joinDocument = useCallback((documentId: string) => {
    if (socketRef.current?.connected) {
      console.log('[Socket] Joining document room:', documentId);
      socketRef.current.emit('join:document', documentId);
    }
  }, []);

  const leaveDocument = useCallback((documentId: string) => {
    if (socketRef.current?.connected) {
      console.log('[Socket] Leaving document room:', documentId);
      socketRef.current.emit('leave:document', documentId);
    }
  }, []);

  const value: SocketContextType = {
    isConnected,
    socket,
    joinDocument,
    leaveDocument,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export default SocketContext;

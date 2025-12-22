import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import logger from './loggerService';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  teamId?: string | null;
}

interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  teamId?: string | null;
}

// Event types for type safety
export interface DocumentEvent {
  documentId: string;
  status: string;
  updatedAt: string;
  updatedBy?: string;
  ownerId?: string;
}

export interface SignerEvent {
  documentId: string;
  signerId: string;
  signerEmail: string;
  status: string;
  signedAt?: string;
}

export interface FieldEvent {
  documentId: string;
  fieldId: string;
  signerId: string;
  value?: string;
  completedAt?: string;
}

class SocketService {
  private io: Server | null = null;
  private pool: Pool | null = null;

  /**
   * Initialize Socket.IO with the HTTP server
   */
  initialize(httpServer: HttpServer, pool: Pool): Server {
    this.pool = pool;

    const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3002',
      'http://localhost:5173',
    ];

    this.io = new Server(httpServer, {
      cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

        if (!token) {
          return next(new Error('Authentication required'));
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
          logger.error('JWT_SECRET not configured');
          return next(new Error('Server configuration error'));
        }

        const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
        socket.userId = decoded.userId;
        socket.teamId = decoded.teamId;

        logger.debug('Socket authenticated', {
          socketId: socket.id,
          userId: decoded.userId,
        });

        next();
      } catch (error) {
        logger.warn('Socket authentication failed', {
          socketId: socket.id,
          error: (error as Error).message,
        });
        next(new Error('Invalid token'));
      }
    });

    // Connection handler
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      logger.info('[Socket] Client connected', {
        socketId: socket.id,
        userId: socket.userId,
        teamId: socket.teamId,
      });

      // Join user-specific room
      if (socket.userId) {
        socket.join(`user:${socket.userId}`);
        logger.info('[Socket] User joined room', {
          socketId: socket.id,
          room: `user:${socket.userId}`,
        });
      }

      // Join team room if user belongs to a team
      if (socket.teamId) {
        socket.join(`team:${socket.teamId}`);
        logger.info('[Socket] User joined team room', {
          socketId: socket.id,
          room: `team:${socket.teamId}`,
        });
      }

      // Handle joining document-specific room
      socket.on('join:document', async (documentId: string) => {
        try {
          // Verify user has access to this document
          const hasAccess = await this.verifyDocumentAccess(socket.userId!, documentId);
          if (hasAccess) {
            socket.join(`document:${documentId}`);
            logger.debug('Client joined document room', {
              socketId: socket.id,
              documentId,
            });
          } else {
            socket.emit('error', { message: 'Access denied to document' });
          }
        } catch (error) {
          logger.error('Error joining document room', {
            socketId: socket.id,
            documentId,
            error: (error as Error).message,
          });
        }
      });

      // Handle leaving document room
      socket.on('leave:document', (documentId: string) => {
        socket.leave(`document:${documentId}`);
        logger.debug('Client left document room', {
          socketId: socket.id,
          documentId,
        });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.info('Client disconnected', {
          socketId: socket.id,
          userId: socket.userId,
          reason,
        });
      });
    });

    logger.info('Socket.IO initialized');
    return this.io;
  }

  /**
   * Verify if a user has access to a document
   */
  private async verifyDocumentAccess(userId: string, documentId: string): Promise<boolean> {
    if (!this.pool) return false;

    try {
      const result = await this.pool.query(
        `SELECT id FROM documents
         WHERE id = $1 AND (created_by = $2 OR team_id IN (
           SELECT team_id FROM team_members WHERE user_id = $2
         ))`,
        [documentId, userId]
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error verifying document access', {
        userId,
        documentId,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Emit document status update
   */
  async emitDocumentUpdate(event: DocumentEvent): Promise<void> {
    if (!this.io) {
      logger.warn('Socket.IO not initialized, cannot emit document update');
      return;
    }

    logger.info('[Socket] Emitting document:updated', {
      documentId: event.documentId,
      status: event.status,
      ownerId: event.ownerId,
    });

    // Emit to document room
    this.io.to(`document:${event.documentId}`).emit('document:updated', event);
    logger.info('[Socket] Emitted to document room', { room: `document:${event.documentId}` });

    // Also emit to the document owner's user room for dashboard updates
    if (event.ownerId) {
      this.io.to(`user:${event.ownerId}`).emit('document:updated', event);
      logger.info('[Socket] Emitted to user room (from ownerId)', { room: `user:${event.ownerId}` });
    } else if (this.pool) {
      // Look up document owner and emit to their room
      try {
        const result = await this.pool.query(
          'SELECT user_id FROM documents WHERE id = $1',
          [event.documentId]
        );
        if (result.rows[0]?.user_id) {
          const ownerId = result.rows[0].user_id;
          this.io.to(`user:${ownerId}`).emit('document:updated', event);
          logger.info('[Socket] Emitted to user room (from DB lookup)', { room: `user:${ownerId}` });
        } else {
          logger.warn('[Socket] No owner found for document', { documentId: event.documentId });
        }
      } catch (error) {
        logger.warn('Could not look up document owner for socket emission', {
          documentId: event.documentId,
          error: (error as Error).message,
        });
      }
    }

    logger.info('[Socket] Document update emission complete', {
      documentId: event.documentId,
      status: event.status,
    });
  }

  /**
   * Emit signer status update
   */
  async emitSignerUpdate(event: SignerEvent): Promise<void> {
    if (!this.io) {
      logger.warn('Socket.IO not initialized, cannot emit signer update');
      return;
    }

    // Emit to document room
    this.io.to(`document:${event.documentId}`).emit('signer:updated', event);
    logger.info('[Socket] Emitted signer:updated to document room', {
      documentId: event.documentId,
      room: `document:${event.documentId}`,
    });

    // Also emit to the document owner's user room for dashboard updates
    if (this.pool) {
      try {
        const result = await this.pool.query(
          'SELECT user_id FROM documents WHERE id = $1',
          [event.documentId]
        );
        if (result.rows[0]?.user_id) {
          const ownerId = result.rows[0].user_id;
          this.io.to(`user:${ownerId}`).emit('signer:updated', event);
          logger.info('[Socket] Emitted signer:updated to user room', {
            documentId: event.documentId,
            ownerId,
            room: `user:${ownerId}`,
          });
        } else {
          logger.warn('[Socket] No owner found for document', { documentId: event.documentId });
        }
      } catch (error) {
        logger.warn('Could not look up document owner for socket emission', {
          documentId: event.documentId,
          error: (error as Error).message,
        });
      }
    }

    logger.info('[Socket] Emitted signer update complete', {
      documentId: event.documentId,
      signerId: event.signerId,
      status: event.status,
    });
  }

  /**
   * Emit field completion update
   */
  emitFieldUpdate(event: FieldEvent): void {
    if (!this.io) {
      logger.warn('Socket.IO not initialized, cannot emit field update');
      return;
    }

    // Emit to document room
    this.io.to(`document:${event.documentId}`).emit('field:updated', event);

    logger.debug('Emitted field update', {
      documentId: event.documentId,
      fieldId: event.fieldId,
    });
  }

  /**
   * Emit to a specific user
   */
  emitToUser(userId: string, event: string, data: unknown): void {
    if (!this.io) {
      logger.warn('Socket.IO not initialized, cannot emit to user');
      return;
    }

    this.io.to(`user:${userId}`).emit(event, data);

    logger.debug('Emitted event to user', {
      userId,
      event,
    });
  }

  /**
   * Emit to a team
   */
  emitToTeam(teamId: string, event: string, data: unknown): void {
    if (!this.io) {
      logger.warn('Socket.IO not initialized, cannot emit to team');
      return;
    }

    this.io.to(`team:${teamId}`).emit(event, data);

    logger.debug('Emitted event to team', {
      teamId,
      event,
    });
  }

  /**
   * Get the Socket.IO server instance
   */
  getIO(): Server | null {
    return this.io;
  }
}

// Export singleton instance
export const socketService = new SocketService();
export default socketService;
